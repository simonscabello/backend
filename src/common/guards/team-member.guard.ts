import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TEAM_ROLES_KEY,
  type RequestWithMembership,
} from '../decorators/team-roles.decorator';

/// Resolve o vinculo do usuario com a equipe da rota e o injeta em
/// `req.membership`. Roda depois do JwtAuthGuard (que e global).
@Injectable()
export class TeamMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMembership>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Você precisa estar autenticado.');
    }

    const rawTeamId = request.params?.teamId;
    const rawEventId = request.params?.eventId;
    let teamId = typeof rawTeamId === 'string' ? rawTeamId : undefined;

    // Rotas /events/:eventId nao trazem teamId; resolvemos pelo evento.
    // Quem nao e membro da equipe dona do evento recebe 404 (mesmo contrato).
    if (!teamId && typeof rawEventId === 'string') {
      const event = await this.prisma.event.findUnique({
        where: { id: rawEventId },
        select: { teamId: true },
      });
      if (!event) {
        throw new NotFoundException('Culto não encontrado.');
      }
      teamId = event.teamId;
    }

    if (!teamId) {
      throw new InternalServerErrorException(
        'Rota protegida pelo TeamMemberGuard sem parametro :teamId ou :eventId.',
      );
    }

    const membership = await this.prisma.membership.findFirst({
      where: { teamId, userId: user.id, status: 'ACTIVE' },
    });

    // 404 e nao 403: nao confirmamos a existencia de equipes das quais o
    // usuario nao participa.
    if (!membership) {
      throw new NotFoundException('Equipe não encontrada.');
    }

    request.membership = membership;

    const allowedRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      TEAM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'Você não tem permissão para fazer isso nesta equipe.',
      );
    }

    return true;
  }
}
