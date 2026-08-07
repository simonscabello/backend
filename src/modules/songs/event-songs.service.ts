import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SetlistItemDto } from './dto/event-song.dto';

/// O que a escala precisa saber de cada música: o suficiente para o músico
/// achar a cifra e o tom sem abrir o repertório. A letra não vem -- são
/// centenas de caracteres por música e a escala já é a tela mais carregada.
export const EVENT_SONG_INCLUDE = {
  orderBy: { position: 'asc' },
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
} as const;

interface EventSongRow {
  id: string;
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
      select: { id: true, teamId: true },
    });

    if (!event) {
      throw new NotFoundException('Escala não encontrada.');
    }

    const ids = items.map((i) => i.songId);
    const repetida = ids.find((id, index) => ids.indexOf(id) !== index);
    if (repetida) {
      throw new BadRequestException({
        code: 'DUPLICATE_SONG',
        message: 'A mesma música aparece duas vezes no repertório.',
      });
    }

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

    await this.prisma.$transaction([
      this.prisma.eventSong.deleteMany({ where: { eventId } }),
      this.prisma.eventSong.createMany({
        // A posição é normalizada aqui, em 0..n-1: o cliente manda a ordem,
        // não o índice, e assim não existe posição repetida nem buraco.
        data: items.map((item, index) => ({
          eventId,
          songId: item.songId,
          position: index,
          keyOverride: item.keyOverride ?? null,
          note: item.note ?? null,
        })),
      }),
    ]);
  }
}
