import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Membership } from '@prisma/client';
import {
  CurrentMembership,
  TeamRoles,
} from '../../common/decorators/team-roles.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { InvitesService } from './invites.service';
import { AcceptInviteDto, CreateInviteDto } from './dto/invite.dto';

@Controller('teams/:teamId/invites')
@UseGuards(TeamMemberGuard)
@TeamRoles('OWNER', 'LEADER')
export class TeamInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentMembership() actor: Membership,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.create(teamId, actor, dto);
  }

  @Get()
  list(@Param('teamId', ParseUUIDPipe) teamId: string) {
    return this.invites.list(teamId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':inviteId')
  revoke(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.invites.revoke(teamId, inviteId);
  }
}

@Controller('invites')
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly prisma: PrismaService,
  ) {}

  /// Publico: a pessoa ve para qual equipe foi convidada antes de criar conta.
  /// Limite baixo porque e a unica rota que aceita um código sem autenticacao.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':code')
  preview(@Param('code') code: string) {
    return this.invites.preview(code);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('accept')
  async accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptInviteDto) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true },
    });

    return this.invites.accept(dto.code, user.id, account.name);
  }
}
