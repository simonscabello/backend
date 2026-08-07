import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { TeamRoles } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { AssignmentsService } from '../assignments/assignments.service';
import { EventSongsService } from './event-songs.service';
import { ReplaceSetlistDto } from './dto/event-song.dto';

/// Repertório de uma escala. Mesma forma do controller de escalação: `PUT`
/// com a lista inteira, e a resposta é a escala completa -- a tela do culto
/// já se atualiza sem uma segunda chamada.
@Controller('events/:eventId/songs')
@UseGuards(TeamMemberGuard)
export class EventSongsController {
  constructor(
    private readonly setlist: EventSongsService,
    private readonly assignments: AssignmentsService,
  ) {}

  @TeamRoles('OWNER', 'LEADER')
  @Put()
  async replace(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReplaceSetlistDto,
  ) {
    await this.setlist.replace(eventId, dto.songs);
    return this.assignments.buildSchedule(eventId);
  }
}
