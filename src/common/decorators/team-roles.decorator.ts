import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Membership, MembershipRole } from '@prisma/client';
import type { RequestWithUser } from './current-user.decorator';

export const TEAM_ROLES_KEY = 'teamRoles';

/// Restringe a rota a determinados papeis dentro da equipe.
/// Sem o decorator, qualquer membro ativo tem acesso.
export const TeamRoles = (...roles: MembershipRole[]) =>
  SetMetadata(TEAM_ROLES_KEY, roles);

export interface RequestWithMembership extends RequestWithUser {
  membership?: Membership;
}

/// O vinculo do usuario autenticado com a equipe da rota, carregado pelo
/// TeamMemberGuard.
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Membership => {
    const request = ctx.switchToHttp().getRequest<RequestWithMembership>();
    return request.membership as Membership;
  },
);
