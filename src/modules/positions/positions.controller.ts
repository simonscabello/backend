import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TeamRoles } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { PositionsService } from './positions.service';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';

@Controller('teams/:teamId/positions')
@UseGuards(TeamMemberGuard)
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.positions.list(teamId, includeInactive ?? false);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Post()
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreatePositionDto,
  ) {
    return this.positions.create(teamId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Patch(':positionId')
  update(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.positions.update(teamId, positionId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Delete(':positionId')
  deactivate(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
  ) {
    return this.positions.deactivate(teamId, positionId);
  }
}
