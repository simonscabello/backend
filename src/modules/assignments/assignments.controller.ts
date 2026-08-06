import { Body, Controller, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { TeamRoles } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { AssignmentsService } from './assignments.service';
import { ReplaceAssignmentsDto } from './dto/assignment.dto';

@Controller('events/:eventId/assignments')
@UseGuards(TeamMemberGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @TeamRoles('OWNER', 'LEADER')
  @Put()
  replace(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReplaceAssignmentsDto,
  ) {
    return this.assignments.replace(
      eventId,
      dto.assignments,
      dto.ministerMembershipId,
    );
  }
}
