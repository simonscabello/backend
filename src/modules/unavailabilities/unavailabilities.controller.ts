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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Membership } from '@prisma/client';
import { CurrentMembership } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { UnavailabilitiesService } from './unavailabilities.service';
import {
  CreateUnavailabilityDto,
  ListUnavailabilityQueryDto,
} from './dto/unavailability.dto';

@Controller('teams/:teamId/unavailabilities')
@UseGuards(TeamMemberGuard)
export class UnavailabilitiesController {
  constructor(private readonly service: UnavailabilitiesService) {}

  /// Toda a equipe: quem monta a escala precisa ver, e não é informação
  /// sensível dentro da própria equipe.
  @Get()
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query() query: ListUnavailabilityQueryDto,
  ) {
    return this.service.list(teamId, query);
  }

  @Get('me')
  listMine(@CurrentMembership() actor: Membership) {
    return this.service.listMine(actor.id);
  }

  @Post()
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentMembership() actor: Membership,
    @Body() dto: CreateUnavailabilityDto,
  ) {
    return this.service.create(teamId, actor, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentMembership() actor: Membership,
  ) {
    return this.service.remove(teamId, id, actor);
  }
}
