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
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TeamRoles } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { ServiceTemplatesService } from './service-templates.service';
import {
  CreateServiceTemplateDto,
  UpdateServiceTemplateDto,
} from './dto/service-template.dto';

/// A grade de cultos da igreja.
///
/// Leitura liberada a qualquer integrante -- a tela de nova escala precisa
/// dela, e saber que horas comeca o culto nao e informacao sensivel. Escrita
/// so para quem gerencia.
@Controller('teams/:teamId/service-templates')
@UseGuards(TeamMemberGuard)
export class ServiceTemplatesController {
  constructor(private readonly templates: ServiceTemplatesService) {}

  @Get()
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.templates.list(teamId, includeInactive ?? false);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Post()
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreateServiceTemplateDto,
  ) {
    return this.templates.create(teamId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Get(':templateId/future-events')
  futureEvents(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.templates.futureEvents(teamId, templateId);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Patch(':templateId')
  update(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateServiceTemplateDto,
  ) {
    return this.templates.update(teamId, templateId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':templateId')
  remove(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.templates.remove(teamId, templateId);
  }
}
