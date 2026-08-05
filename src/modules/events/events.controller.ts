import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Membership } from '@prisma/client';
import {
  CurrentMembership,
  TeamRoles,
} from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { EventsService } from './events.service';
import {
  CreateEventDto,
  DuplicateEventDto,
  ListEventsQueryDto,
  UpdateEventDto,
} from './dto/event.dto';

@Controller()
@UseGuards(TeamMemberGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @TeamRoles('OWNER', 'LEADER')
  @Post('teams/:teamId/events')
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentMembership() membership: Membership,
    @Body() dto: CreateEventDto,
  ) {
    return this.events.create(teamId, membership.id, dto);
  }

  @Get('teams/:teamId/events')
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query() query: ListEventsQueryDto,
  ) {
    return this.events.list(
      teamId,
      query.scope ?? 'upcoming',
      query.limit ?? 20,
    );
  }

  @Get('events/:eventId')
  findOne(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.findOne(eventId);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Patch('events/:eventId')
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(eventId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('events/:eventId')
  remove(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.remove(eventId);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Post('events/:eventId/duplicate')
  duplicate(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentMembership() membership: Membership,
    @Body() dto: DuplicateEventDto,
  ) {
    return this.events.duplicate(eventId, membership.id, dto);
  }
}
