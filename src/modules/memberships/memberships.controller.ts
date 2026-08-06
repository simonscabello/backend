import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Query,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Membership } from '@prisma/client';
import {
  CurrentMembership,
  TeamRoles,
} from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { MembershipsService } from './memberships.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/membership.dto';

@Controller('teams/:teamId/members')
@UseGuards(TeamMemberGuard)
export class MembershipsController {
  constructor(private readonly members: MembershipsService) {}

  @Get()
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query('includeGuests', new ParseBoolPipe({ optional: true }))
    includeGuests?: boolean,
  ) {
    return this.members.list(teamId, includeGuests ?? false);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Post()
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreateMemberDto,
  ) {
    return this.members.create(teamId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Patch(':membershipId')
  update(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentMembership() actor: Membership,
  ) {
    return this.members.update(teamId, membershipId, dto, actor);
  }

  @TeamRoles('OWNER', 'LEADER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':membershipId')
  remove(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.members.remove(teamId, membershipId);
  }

  @TeamRoles('OWNER')
  @HttpCode(HttpStatus.OK)
  @Post(':membershipId/reset-password')
  resetPassword(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.members.resetPassword(teamId, membershipId);
  }
}
