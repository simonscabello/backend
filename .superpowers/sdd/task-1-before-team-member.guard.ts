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
      throw new UnauthorizedException('Voce precisa estar autenticado.');
    }

    // Express tipa params como string | string[]; aqui e sempre um segmento.
    const rawTeamId = request.params?.teamId;
    const teamId = typeof rawTeamId === 'string' ? rawTeamId : undefined;

    if (!teamId) {
      throw new InternalServerErrorException(
        'Rota protegida pelo TeamMemberGuard sem parametro :teamId.',
      );
    }

    const membership = await this.prisma.membership.findFirst({
      where: { teamId, userId: user.id, status: 'ACTIVE' },
    });

    // 404 e nao 403: nao confirmamos a existencia de equipes das quais o
    // usuario nao participa.
    if (!membership) {
      throw new NotFoundException('Equipe nao encontrada.');
    }

    request.membership = membership;

    const allowedRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      TEAM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'Voce nao tem permissao para fazer isso nesta equipe.',
      );
    }

    return true;
  }
}
