import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Invite, Membership } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from '../../config/env';
import {
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from './invite-code';
import type { CreateInviteDto } from './dto/invite.dto';

const DEFAULT_EXPIRES_IN_DAYS = 7;

@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, actor: Membership, dto: CreateInviteDto) {
    if (dto.membershipId) {
      await this.assertClaimableMembership(teamId, dto.membershipId);
    }

    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS;

    const invite = await this.prisma.invite.create({
      data: {
        teamId,
        membershipId: dto.membershipId,
        code: generateInviteCode(),
        createdById: actor.id,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        // Convite individual so pode ser usado uma vez: ele carrega um cadastro
        // especifico junto.
        maxUses: dto.membershipId ? 1 : dto.maxUses,
      },
      include: { membership: true },
    });

    return this.toPublicInvite(invite);
  }

  async list(teamId: string) {
    const invites = await this.prisma.invite.findMany({
      where: { teamId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { membership: true },
      orderBy: { createdAt: 'desc' },
    });

    return invites
      .filter((invite) => !this.isExhausted(invite))
      .map((invite) => this.toPublicInvite(invite));
  }

  async revoke(teamId: string, inviteId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, teamId },
    });

    if (!invite) {
      throw new NotFoundException('Convite não encontrado.');
    }

    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
  }

  /// Publico: alimenta a tela "voce foi convidado para X" antes do login.
  /// Nao devolve nada que identifique membros alem de quem convidou.
  async preview(rawCode: string) {
    const invite = await this.findUsable(rawCode);

    return {
      teamName: invite.team.name,
      invitedBy: invite.createdBy?.displayName ?? null,
      /// Preenchido quando o convite e individual.
      invitedName: invite.membership?.displayName ?? null,
      expiresAt: invite.expiresAt,
    };
  }

  async accept(rawCode: string, userId: string, userName: string) {
    const invite = await this.findByCode(rawCode);

    const existing = await this.prisma.membership.findFirst({
      where: { teamId: invite.teamId, userId, status: 'ACTIVE' },
    });

    // Idempotente (regra 6): quem ja esta na equipe recebe sucesso, mesmo que o
    // convite ja tenha se esgotado ou expirado depois do primeiro uso -- tocar
    // no link duas vezes ou reinstalar o app não pode virar erro. A checagem
    // vem antes de `assertUsable` justamente por isso, e nao vaza nada: a
    // pessoa ja conhece a equipe da qual faz parte.
    if (existing) {
      return this.acceptResult(invite.teamId, invite.team.name, existing, false);
    }

    this.assertUsable(invite);

    const membership = await this.prisma.$transaction(async (tx) => {
      let result: Membership;

      if (invite.membershipId) {
        // Convite individual: a conta assume o cadastro que o lider ja criou,
        // preservando funções e escalas (regra 7).
        const target = await tx.membership.findUnique({
          where: { id: invite.membershipId },
        });

        if (!target || target.status !== 'ACTIVE') {
          throw new GoneException({
            code: 'INVITE_TARGET_UNAVAILABLE',
            message: 'Este convite não está mais disponivel.',
          });
        }

        if (target.userId) {
          throw new GoneException({
            code: 'INVITE_ALREADY_CLAIMED',
            message: 'Este convite ja foi usado por outra pessoa.',
          });
        }

        result = await tx.membership.update({
          where: { id: target.id },
          data: { userId, joinedAt: new Date() },
        });
      } else {
        result = await tx.membership.create({
          data: {
            teamId: invite.teamId,
            userId,
            displayName: userName,
            role: 'MEMBER',
            joinedAt: new Date(),
          },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });

      return result;
    });

    return this.acceptResult(invite.teamId, invite.team.name, membership, true);
  }

  private acceptResult(
    teamId: string,
    teamName: string,
    membership: Membership,
    joined: boolean,
  ) {
    return {
      teamId,
      teamName,
      membershipId: membership.id,
      displayName: membership.displayName,
      role: membership.role,
      /// false = a pessoa ja fazia parte da equipe.
      joined,
    };
  }

  private async findUsable(rawCode: string) {
    const invite = await this.findByCode(rawCode);
    this.assertUsable(invite);
    return invite;
  }

  private async findByCode(rawCode: string) {
    const code = normalizeInviteCode(rawCode);

    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        team: true,
        membership: true,
        createdBy: true,
      },
    });

    // Codigo inexistente e código vencido dao a mesma resposta: nao vale a pena
    // distinguir para quem esta tentando adivinhar.
    if (!invite) {
      throw new GoneException({
        code: 'INVITE_INVALID',
        message: 'Convite inválido ou expirado.',
      });
    }

    return invite;
  }

  private assertUsable(invite: Invite): void {
    if (invite.revokedAt) {
      throw new GoneException({
        code: 'INVITE_REVOKED',
        message: 'Este convite foi cancelado pelo lider da equipe.',
      });
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      throw new GoneException({
        code: 'INVITE_EXPIRED',
        message: 'Este convite expirou. Peca um novo ao lider da equipe.',
      });
    }

    if (this.isExhausted(invite)) {
      throw new GoneException({
        code: 'INVITE_EXHAUSTED',
        message: 'Este convite ja atingiu o limite de usos.',
      });
    }
  }

  private isExhausted(invite: Invite): boolean {
    return invite.maxUses !== null && invite.uses >= invite.maxUses;
  }

  private async assertClaimableMembership(
    teamId: string,
    membershipId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, teamId, status: 'ACTIVE' },
    });

    if (!membership) {
      throw new NotFoundException('Membro não encontrado nesta equipe.');
    }

    if (membership.userId) {
      throw new BadRequestException({
        code: 'MEMBER_ALREADY_HAS_ACCOUNT',
        message: 'Este membro ja tem uma conta vinculada.',
      });
    }
  }

  private toPublicInvite(
    invite: Invite & { membership?: Membership | null },
  ) {
    return {
      id: invite.id,
      code: invite.code,
      formattedCode: formatInviteCode(invite.code),
      url: env.INVITE_BASE_URL
        ? `${env.INVITE_BASE_URL.replace(/\/$/, '')}/${invite.code}`
        : null,
      forMembershipId: invite.membershipId,
      forName: invite.membership?.displayName ?? null,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      uses: invite.uses,
    };
  }
}
