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
import { Throttle } from '@nestjs/throttler';
import { TeamRoles } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { SongsService } from './songs.service';
import { ExternalSearchService } from './external/external-search.service';
import {
  CopyFromCatalogDto,
  CreateFromExternalDto,
  CreateSongDto,
  UpdateSongDto,
} from './dto/song.dto';

/// Repertorio da equipe. Qualquer integrante consulta -- o musico precisa
/// achar a cifra e o tom antes do ensaio; so LEADER+ cadastra e edita.
@Controller('teams/:teamId/songs')
@UseGuards(TeamMemberGuard)
export class SongsController {
  constructor(
    private readonly songs: SongsService,
    private readonly external: ExternalSearchService,
  ) {}

  @Get()
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query('search') search?: string,
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ) {
    return this.songs.list(teamId, { search, includeArchived });
  }

  /// **Antes de `:songId`**, senão o Nest casa "catalog" como id e o
  /// ParseUUIDPipe rejeita com 400. A ordem de declaração é a ordem de
  /// resolução.
  @Get('catalog')
  catalog(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query('search') search?: string,
  ) {
    return this.songs.catalog(teamId, search);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Post('from-catalog')
  copyFromCatalog(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CopyFromCatalogDto,
  ) {
    return this.songs.copyFromCatalog(teamId, dto.sourceSongId);
  }

  /// Busca no Spotify, para a tela de cadastro. Também antes de `:songId`.
  ///
  /// Só a busca: resolver cifra, tom e andamento custa até quatro requisições
  /// ao CifraClub e acontece no POST abaixo, para a música escolhida.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('search-external')
  searchExternal(
    @Param('teamId', ParseUUIDPipe) _teamId: string,
    @Query('search') search?: string,
  ) {
    return this.external.search(search ?? '');
  }

  @TeamRoles('OWNER', 'LEADER')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('from-external')
  createFromExternal(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreateFromExternalDto,
  ) {
    return this.songs.createFromExternal(teamId, dto);
  }

  @Get(':songId')
  get(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('songId', ParseUUIDPipe) songId: string,
  ) {
    return this.songs.get(teamId, songId);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Post()
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreateSongDto,
  ) {
    return this.songs.create(teamId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Patch(':songId')
  update(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('songId', ParseUUIDPipe) songId: string,
    @Body() dto: UpdateSongDto,
  ) {
    return this.songs.update(teamId, songId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':songId')
  remove(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('songId', ParseUUIDPipe) songId: string,
  ) {
    return this.songs.remove(teamId, songId);
  }
}
