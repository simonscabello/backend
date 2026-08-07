import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SetlistItemDto } from './dto/event-song.dto';

/// O que a escala precisa saber de cada música: o suficiente para o músico
/// achar a cifra e o tom sem abrir o repertório. A letra não vem -- são
/// centenas de caracteres por música e a escala já é a tela mais carregada.
export const EVENT_SONG_INCLUDE = {
  /// Por culto e depois por posição: a `position` é normalizada dentro de cada
  /// culto, então sozinha ela intercalaria manhã e noite (as duas têm um item
  /// na posição 0). O horário é o critério de qual culto vem primeiro -- o
  /// mesmo que a lista de cultos usa.
  orderBy: [
    { service: { startsAt: 'asc' } },
    { position: 'asc' },
  ],
  include: {
    song: {
      select: {
        id: true,
        title: true,
        artist: true,
        defaultKey: true,
        originalKey: true,
        chordsUrl: true,
        lyricsUrl: true,
        youtubeUrl: true,
        spotifyUrl: true,
      },
    },
  },
  // `satisfies` e não `as const`: o `as const` deixaria o `orderBy` readonly, e
  // o Prisma só aceita array mutável ali. Os literais do `select` continuam
  // estreitos, que é o que faz o tipo do resultado sair certo.
} satisfies Prisma.Event$songsArgs;

interface EventSongRow {
  id: string;
  serviceId: string;
  position: number;
  keyOverride: string | null;
  note: string | null;
  song: {
    id: string;
    title: string;
    artist: string | null;
    defaultKey: string | null;
    originalKey: string | null;
    chordsUrl: string | null;
    lyricsUrl: string | null;
    youtubeUrl: string | null;
    spotifyUrl: string | null;
  };
}

export function toPublicEventSongs(rows: EventSongRow[]) {
  return rows.map((row) => ({
    id: row.id,
    songId: row.song.id,
    /// Em qual culto da escala esta música entra. A tela agrupa por ele; o
    /// texto do WhatsApp abre uma seção por culto.
    serviceId: row.serviceId,
    position: row.position,
    title: row.song.title,
    artist: row.song.artist,
    /// O tom que vale nesta escala: o da escala quando existe, senão o da
    /// equipe. O app não precisa repetir essa decisão em cada tela.
    key: row.keyOverride ?? row.song.defaultKey,
    keyOverride: row.keyOverride,
    defaultKey: row.song.defaultKey,
    originalKey: row.song.originalKey,
    note: row.note,
    chordsUrl: row.song.chordsUrl,
    lyricsUrl: row.song.lyricsUrl,
    youtubeUrl: row.song.youtubeUrl,
    spotifyUrl: row.song.spotifyUrl,
  }));
}

@Injectable()
export class EventSongsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Substitui o repertório inteiro da escala, na ordem recebida.
  ///
  /// Bulk e não item a item porque é assim que a tela funciona: a pessoa
  /// arrasta, tira, acrescenta e salva de uma vez. Item a item deixaria a
  /// escala num estado intermediário se a rede caísse no meio.
  async replace(eventId: string, items: SetlistItemDto[]) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        teamId: true,
        services: { select: { id: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Escala não encontrada.');
    }

    // Culto de outra escala não entra: o id vem do cliente, e um id válido de
    // outra escala passaria pela validação de formato -- e deixaria a música
    // pendurada num culto que esta tela nem mostra.
    const cultos = new Set(event.services.map((service) => service.id));
    if (items.some((item) => !cultos.has(item.serviceId))) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE',
        message: 'Um dos cultos não pertence a esta escala.',
      });
    }

    // A repetição passou a ser por culto. A mesma música de manhã e à noite
    // são duas linhas legítimas -- à noite pode ser outro tom, outra ordem,
    // outro recado. O que continua sendo erro é repetir dentro do mesmo culto.
    const chaves = items.map((item) => `${item.serviceId}:${item.songId}`);
    const repetida = chaves.find((c, index) => chaves.indexOf(c) !== index);
    if (repetida) {
      throw new BadRequestException({
        code: 'DUPLICATE_SONG',
        message: 'A mesma música aparece duas vezes no mesmo culto.',
      });
    }

    // Distintas: a mesma música em dois cultos é o caso normal agora, e contar
    // as repetições faria a conferência abaixo acusar erro onde não há.
    const ids = [...new Set(items.map((item) => item.songId))];
    if (ids.length) {
      // Música de outra equipe não entra: o id vem do cliente, e um id
      // válido de outro repertório passaria pela validação de formato.
      const validas = await this.prisma.song.count({
        where: { id: { in: ids }, teamId: event.teamId },
      });

      if (validas !== ids.length) {
        throw new BadRequestException({
          code: 'INVALID_SONG',
          message: 'Uma das músicas não pertence ao repertório desta equipe.',
        });
      }
    }

    // A posição é normalizada por culto, cada um com a própria sequência
    // 0..n-1: o cliente manda a ordem, não o índice. Numerar a escala inteira
    // faria o repertório da noite começar em 4 só porque a manhã tem quatro
    // músicas -- e "3ª música da noite" é como a equipe fala.
    const proxima = new Map<string, number>();
    const data = items.map((item) => {
      const position = proxima.get(item.serviceId) ?? 0;
      proxima.set(item.serviceId, position + 1);

      return {
        eventId,
        serviceId: item.serviceId,
        songId: item.songId,
        position,
        keyOverride: item.keyOverride ?? null,
        note: item.note ?? null,
      };
    });

    await this.prisma.$transaction([
      this.prisma.eventSong.deleteMany({ where: { eventId } }),
      this.prisma.eventSong.createMany({ data }),
    ]);
  }
}
