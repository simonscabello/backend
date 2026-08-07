import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { Membership } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { avatarUrl } from '../users/public-user';
import type { CreateMemberDto, UpdateMemberDto } from './dto/membership.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /// `includeGuests` só para a tela de escalação: na lista de integrantes da
  /// equipe o convidado não é membro e não deveria aparecer.
  async list(teamId: string, includeGuests = false) {
    const members = await this.prisma.membership.findMany({
      where: {
        teamId,
        status: 'ACTIVE',
        ...(includeGuests ? {} : { isGuest: false }),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarPath: true },
        },
        positions: { include: { position: true } },
      },
      orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
    });

    return members.map(toPublicMember);
  }

  /// Cria um membro sem conta (placeholder). O lider monta a equipe inteira na
  /// primeira sessao; as contas chegam depois, pelo convite (Etapa 3).
  async create(teamId: string, dto: CreateMemberDto) {
    await this.assertPositionsBelongToTeam(teamId, dto.positionIds);

    const member = await this.prisma.membership.create({
      data: {
        teamId,
        displayName: dto.displayName,
        phone: dto.phone,
        role: 'MEMBER',
        isGuest: dto.isGuest ?? false,
        positions: dto.positionIds?.length
          ? { create: dto.positionIds.map((positionId) => ({ positionId })) }
          : undefined,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarPath: true },
        },
        positions: { include: { position: true } },
      },
    });

    return toPublicMember(member);
  }

  async update(
    teamId: string,
    membershipId: string,
    dto: UpdateMemberDto,
    actor: Membership,
  ) {
    const target = await this.findInTeam(teamId, membershipId);

    if (dto.role && target.role === 'OWNER') {
      throw new ConflictException({
        code: 'CANNOT_DEMOTE_OWNER',
        message:
          'O dono da equipe não pode ser rebaixado. Transfira a posse antes.',
      });
    }

    if (dto.role && actor.role !== 'OWNER' && actor.id === target.id) {
      throw new ConflictException({
        code: 'CANNOT_CHANGE_OWN_ROLE',
        message: 'Você não pode alterar o proprio papel.',
      });
    }

    await this.assertPositionsBelongToTeam(teamId, dto.positionIds);

    const member = await this.prisma.$transaction(async (tx) => {
      if (dto.positionIds) {
        await tx.membershipPosition.deleteMany({ where: { membershipId } });
        if (dto.positionIds.length) {
          await tx.membershipPosition.createMany({
            data: dto.positionIds.map((positionId) => ({
              membershipId,
              positionId,
            })),
          });
        }
      }

      return tx.membership.update({
        where: { id: membershipId },
        data: {
          displayName: dto.displayName,
          phone: dto.phone,
          role: dto.role,
        },
        include: {
          user: {
          select: { id: true, name: true, email: true, avatarPath: true },
        },
          positions: { include: { position: true } },
        },
      });
    });

    return toPublicMember(member);
  }

  /// Remocao e logica (regra 10): as escalas passadas continuam integras, mas
  /// as escalacoes futuras saem junto.
  async remove(teamId: string, membershipId: string) {
    const target = await this.findInTeam(teamId, membershipId);

    if (target.role === 'OWNER') {
      throw new ConflictException({
        code: 'CANNOT_REMOVE_OWNER',
        message: 'O dono da equipe não pode ser removido.',
      });
    }

    await this.prisma.$transaction([
      this.prisma.assignment.deleteMany({
        where: {
          membershipId,
          event: { startsAt: { gte: new Date() } },
        },
      }),
      this.prisma.membership.update({
        where: { id: membershipId },
        data: { status: 'REMOVED' },
      }),
    ]);
  }

  /// Regra 27: substitui a recuperacao de senha por e-mail no MVP.
  /// A senha temporaria e devolvida uma unica vez e nunca fica em claro.
  async resetPassword(teamId: string, membershipId: string) {
    const target = await this.findInTeam(teamId, membershipId);

    if (!target.userId) {
      throw new BadRequestException({
        code: 'MEMBER_HAS_NO_ACCOUNT',
        message:
          'Este membro ainda não criou uma conta. Envie um convite para ele.',
      });
    }

    const temporaryPassword = randomBytes(6).toString('base64url');

    await this.prisma.user.update({
      where: { id: target.userId },
      data: {
        passwordHash: await argon2.hash(temporaryPassword, {
          type: argon2.argon2id,
        }),
        mustChangePassword: true,
      },
    });

    // Derruba as sessoes abertas: quem estava logado com a senha antiga sai.
    await this.tokens.revokeAllForUser(target.userId);

    return {
      temporaryPassword,
      message:
        'Entregue esta senha ao membro. Ele será obrigado a trocar no próximo acesso.',
    };
  }

  private async findInTeam(teamId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, teamId, status: 'ACTIVE' },
    });

    if (!membership) {
      throw new NotFoundException('Membro não encontrado nesta equipe.');
    }

    return membership;
  }

  private async assertPositionsBelongToTeam(
    teamId: string,
    positionIds?: string[],
  ) {
    if (!positionIds?.length) return;

    const count = await this.prisma.position.count({
      where: { id: { in: positionIds }, teamId },
    });

    if (count !== positionIds.length) {
      throw new BadRequestException({
        code: 'INVALID_POSITION',
        message: 'Uma das funções informadas não pertence a esta equipe.',
      });
    }
  }
}

function toPublicMember(member: {
  id: string;
  displayName: string;
  role: string;
  phone: string | null;
  joinedAt: Date | null;
  isGuest: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    avatarPath: string | null;
  } | null;
  positions: { position: { id: string; name: string; category: string } }[];
}) {
  return {
    id: member.id,
    displayName: member.displayName,
    role: member.role,
    phone: member.phone,
    joinedAt: member.joinedAt,
    /// Músico de fora, convidado para uma ocasião.
    isGuest: member.isGuest,
    /// false = membro cadastrado pelo lider que ainda não criou conta.
    hasAccount: member.user !== null,
    email: member.user?.email ?? null,
    /// Foto da conta, quando ela existe. Membro sem conta (e convidado) cai na
    /// inicial do nome, como antes.
    avatarUrl: avatarUrl(member.user?.avatarPath),
    positions: member.positions.map((p) => ({
      id: p.position.id,
      name: p.position.name,
      category: p.position.category,
    })),
  };
}
