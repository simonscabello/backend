import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSearchText, normalizeSearch } from './song-search';
import { ExternalSearchService } from './external/external-search.service';
import type {
  CreateFromExternalDto,
  CreateSongDto,
  UpdateSongDto,
} from './dto/song.dto';

/// A lista nao carrega a letra: sao centenas de musicas e a letra so importa
/// na tela de uma delas. Os campos que a equipe ainda precisa preencher (tom,
/// hino/cantico, andamento) vem todos, porque a tela filtra por eles.
const LIST_FIELDS = {
  id: true,
  title: true,
  artist: true,
  composer: true,
  kind: true,
  pace: true,
  defaultKey: true,
  /// Vêm na lista para a tela poder sugerir: ao lado de um tom vazio, mostrar
  /// "original: F#" transforma o preenchimento num toque em vez de pesquisa.
  originalKey: true,
  bpm: true,
  lyricsUrl: true,
  chordsUrl: true,
  youtubeUrl: true,
  spotifyUrl: true,
  isArchived: true,
  isNew: true,
  hymnNumber: true,
} satisfies Prisma.SongSelect;

@Injectable()
export class SongsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly external: ExternalSearchService,
  ) {}

  async list(
    teamId: string,
    options: { search?: string; includeArchived?: boolean } = {},
  ) {
    const search = options.search?.trim();

    return this.prisma.song.findMany({
      where: {
        teamId,
        ...(options.includeArchived ? {} : { isArchived: false }),
        ...(search
          ? { searchText: { contains: normalizeSearch(search) } }
          : {}),
      },
      select: LIST_FIELDS,
      // Por searchText, nao por title: ordenar pelo titulo com acento joga
      // "Ácaso" para depois de "Zelo" em algumas collations.
      orderBy: { searchText: 'asc' },
    });
  }

  /// Busca a mesma música no repertório das OUTRAS equipes.
  ///
  /// Existe porque a maioria das igrejas não tem como exportar o acervo de
  /// lugar nenhum, e nenhuma API devolve letra: quem chega depois só recebe
  /// letra se alguém antes já tiver cadastrado aquela música. Quanto mais
  /// equipes usam o sistema, menos trabalho a próxima tem.
  ///
  /// Não é um catálogo curado nem uma tabela nova -- é a própria tabela
  /// consultada de lado. Devolve só os dados universais.
  async catalog(teamId: string, search?: string) {
    const term = search?.trim();

    // Sem busca não devolve nada: isto lê o repertório de terceiros, e
    // despejar a tabela inteira não é o propósito.
    if (!term || term.length < 2) return [];

    const [mine, others] = await Promise.all([
      this.prisma.song.findMany({
        where: { teamId },
        select: {
          searchText: true,
          externalSource: true,
          externalId: true,
        },
      }),
      this.prisma.song.findMany({
        where: {
          teamId: { not: teamId },
          isArchived: false,
          searchText: { contains: normalizeSearch(term) },
        },
        select: {
          id: true,
          title: true,
          artist: true,
          composer: true,
          lyrics: true,
          lyricsUrl: true,
          chordsUrl: true,
          youtubeUrl: true,
          spotifyUrl: true,
          originalKey: true,
          bpm: true,
          searchText: true,
          externalSource: true,
          externalId: true,
        },
        take: 60,
      }),
    ]);

    const jaTenho = new Set(mine.map(identityOf));
    const melhorPorMusica = new Map<string, (typeof others)[number]>();

    for (const song of others) {
      const identity = identityOf(song);

      // O que a equipe já tem não é candidato a adicionar.
      if (jaTenho.has(identity)) continue;

      const atual = melhorPorMusica.get(identity);
      // A mesma música pode existir em cinco equipes com graus diferentes de
      // preenchimento; aparece uma vez só, na versão mais completa.
      if (!atual || richness(song) > richness(atual)) {
        melhorPorMusica.set(identity, song);
      }
    }

    return [...melhorPorMusica.values()]
      .sort((a, b) => a.searchText.localeCompare(b.searchText))
      .map((song) => ({
        /// É o que o POST /songs/from-catalog recebe.
        sourceSongId: song.id,
        title: song.title,
        artist: song.artist,
        composer: song.composer,
        originalKey: song.originalKey,
        bpm: song.bpm,
        /// A letra em si não vem na busca -- só a informação de que existe.
        hasLyrics: song.lyrics !== null,
        hasChords: song.chordsUrl !== null,
        hasYoutube: song.youtubeUrl !== null,
        hasSpotify: song.spotifyUrl !== null,
      }));
  }

  /// Copia uma música de outra equipe para o repertório desta.
  ///
  /// Copia, não compartilha: a partir daqui as duas seguem vidas separadas, e
  /// corrigir o artista aqui não mexe no repertório de ninguém.
  async copyFromCatalog(teamId: string, sourceSongId: string, isNew = false) {
    const source = await this.prisma.song.findUnique({
      where: { id: sourceSongId },
    });

    if (!source) {
      throw new NotFoundException('Música não encontrada.');
    }

    if (source.teamId === teamId) {
      throw new ConflictException({
        code: 'SONG_ALREADY_IN_TEAM',
        message: 'Esta música já é do repertório da sua equipe.',
      });
    }

    await this.assertNotDuplicated(teamId, source.title, source.artist);

    return this.prisma.song.create({
      data: {
        teamId,
        title: source.title,
        artist: source.artist,
        composer: source.composer,
        kind: source.kind,
        lyrics: source.lyrics,
        lyricsUrl: source.lyricsUrl,
        chordsUrl: source.chordsUrl,
        youtubeUrl: source.youtubeUrl,
        spotifyUrl: source.spotifyUrl,
        originalKey: source.originalKey,
        bpm: source.bpm,
        // A identidade viaja junto: é o que permite reconhecer a mesma música
        // entre equipes na próxima vez.
        externalSource: source.externalSource,
        externalId: source.externalId,
        // defaultKey, pace e isArchived NÃO vêm: são a decisão desta equipe
        // sobre em que tom ela canta e como ela sente a música.
        //
        // `isNew` também não vem da origem, e sim de quem está adicionando: que
        // ELES já dominem a canção não diz nada sobre a SUA equipe.
        isNew,
        searchText: source.searchText,
      },
    });
  }

  /// Cria a partir de uma escolha da busca externa: o que o Spotify deu mais
  /// o que a página do CifraClub entregou (cifra, letra, tom, andamento).
  ///
  /// `defaultKey` e `pace` nascem vazios de propósito -- são a decisão da
  /// equipe, e nenhum serviço externo sabe respondê-las.
  async createFromExternal(teamId: string, dto: CreateFromExternalDto) {
    await this.assertNotDuplicated(teamId, dto.title, dto.artist);

    const found = await this.external.resolve(dto.title, dto.artist);

    return this.prisma.song.create({
      data: {
        teamId,
        title: dto.title,
        artist: dto.artist,
        spotifyUrl: dto.spotifyUrl ?? null,
        chordsUrl: found?.chordsUrl ?? null,
        lyricsUrl: found?.lyricsUrl ?? null,
        originalKey: found?.originalKey ?? null,
        bpm: found?.bpm ?? null,
        isNew: dto.isNew ?? false,
        searchText: buildSearchText({ title: dto.title, artist: dto.artist }),
      },
    });
  }

  async get(teamId: string, songId: string) {
    const song = await this.prisma.song.findFirst({
      where: { id: songId, teamId },
    });

    if (!song) {
      throw new NotFoundException('Música não encontrada nesta equipe.');
    }

    return song;
  }

  async create(teamId: string, dto: CreateSongDto) {
    await this.assertNotDuplicated(teamId, dto.title, dto.artist ?? null);

    return this.prisma.song.create({
      data: {
        teamId,
        ...dto,
        searchText: buildSearchText({
          title: dto.title,
          artist: dto.artist,
          composer: dto.composer,
          hymnNumber: dto.hymnNumber,
        }),
      },
    });
  }

  async update(teamId: string, songId: string, dto: UpdateSongDto) {
    const current = await this.get(teamId, songId);

    const title = dto.title ?? current.title;
    const artist = dto.artist === undefined ? current.artist : dto.artist;
    const composer =
      dto.composer === undefined ? current.composer : dto.composer;
    const hymnNumber =
      dto.hymnNumber === undefined ? current.hymnNumber : dto.hymnNumber;

    if (title !== current.title || artist !== current.artist) {
      await this.assertNotDuplicated(teamId, title, artist, songId);
    }

    return this.prisma.song.update({
      where: { id: songId },
      data: {
        ...dto,
        searchText: buildSearchText({ title, artist, composer, hymnNumber }),
      },
    });
  }

  /// Regra 21: musica ja usada em alguma escala nao se exclui -- as escalas
  /// passadas continuam integras. O caminho e arquivar (PATCH isArchived).
  async remove(teamId: string, songId: string) {
    await this.get(teamId, songId);

    const uses = await this.prisma.eventSong.count({ where: { songId } });

    if (uses > 0) {
      throw new ConflictException({
        code: 'SONG_IN_USE',
        message:
          'Esta música já foi usada em uma escala. Arquive-a em vez de excluir.',
      });
    }

    await this.prisma.song.delete({ where: { id: songId } });
  }

  /// Regra 20: titulo + artista unicos por equipe, ignorando maiusculas.
  /// E uma trava contra duplicata obvia, nao contra variacao de grafia: quem
  /// cadastra "Deus do Impossivel" sem acento passa, e tudo bem.
  private async assertNotDuplicated(
    teamId: string,
    title: string,
    artist: string | null,
    ignoreSongId?: string,
  ) {
    const existing = await this.prisma.song.findFirst({
      where: {
        teamId,
        title: { equals: title, mode: 'insensitive' },
        artist: artist
          ? { equals: artist, mode: 'insensitive' }
          : { equals: null },
        ...(ignoreSongId ? { id: { not: ignoreSongId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'SONG_ALREADY_EXISTS',
        message: 'Esta equipe já tem uma música com este nome e artista.',
      });
    }
  }
}

/// Como reconhecer "a mesma música" entre equipes diferentes.
///
/// O id externo é a identidade forte: o mesmo backup do Holyrics em qualquer
/// banco gera o mesmo par. Sem ele (música digitada à mão), sobra o texto
/// normalizado -- que é justamente título+artista+compositor sem acento.
function identityOf(song: {
  searchText: string;
  externalSource: string | null;
  externalId: string | null;
}): string {
  return song.externalSource && song.externalId
    ? `${song.externalSource}:${song.externalId}`
    : song.searchText;
}

/// Quanto uma linha tem de preenchido. Desempata quando cinco equipes têm a
/// mesma música: quem chega depois recebe a versão mais completa.
function richness(song: {
  lyrics: string | null;
  composer: string | null;
  lyricsUrl: string | null;
  chordsUrl: string | null;
  youtubeUrl: string | null;
  spotifyUrl: string | null;
  originalKey: string | null;
  bpm: number | null;
}): number {
  // A letra pesa mais: é o que não se consegue em lugar nenhum.
  return (
    (song.lyrics ? 3 : 0) +
    [
      song.composer,
      song.lyricsUrl,
      song.chordsUrl,
      song.youtubeUrl,
      song.spotifyUrl,
      song.originalKey,
      song.bpm,
    ].filter((v) => v !== null).length
  );
}
