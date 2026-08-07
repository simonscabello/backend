/**
 * Importa um repertorio exportado para uma equipe.
 *
 *   docker compose exec api npm run import:songs -- --team=<uuid> --file=tmp/songs.json [--dry-run] [--only-universal]
 *
 * Para levar a base para producao, rode com a DATABASE_URL do Railway -- vai
 * direto ao banco, sem passar pela API:
 *
 *   docker compose exec -e DATABASE_URL="postgresql://..." api \
 *     npm run import:songs -- --team=<uuid de producao> --file=tmp/songs.json
 *
 * ---------------------------------------------------------------------------
 * --only-universal
 * ---------------------------------------------------------------------------
 * Sem a flag, leva tudo -- e o caso de mover a SUA base para producao: e a
 * mesma igreja, o tom e o andamento sao trabalho seu.
 *
 * Com a flag, deixa de fora `defaultKey`, `pace` e `isArchived`, que sao
 * decisao de cada equipe: o tom em que ELA canta, como ELA sente a musica.
 * E o caso de dar um repertorio de partida para OUTRA igreja.
 *
 * Em qualquer um dos dois, repetivel: casa por (equipe, origem, id externo) e
 * atualiza em vez de duplicar. Musica sem id externo casa por titulo+artista.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { buildSearchText, normalizeSearch } from '../src/modules/songs/song-search';

const prisma = new PrismaClient();

/// O que so a equipe decide -- nao viaja quando o destino e outra igreja.
const TEAM_DECISIONS = ['defaultKey', 'pace', 'isArchived'] as const;

interface ExportedSong {
  title: string;
  artist?: string | null;
  composer?: string | null;
  kind?: 'HYMN' | 'SONG' | null;
  pace?: 'CALM' | 'MODERATE' | 'UPBEAT' | null;
  defaultKey?: string | null;
  originalKey?: string | null;
  bpm?: number | null;
  lyrics?: string | null;
  lyricsUrl?: string | null;
  chordsUrl?: string | null;
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
  isArchived?: boolean;
  externalSource?: string | null;
  externalId?: string | null;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const teamId = arg('team');
  const file = arg('file');
  const dryRun = process.argv.includes('--dry-run');
  const onlyUniversal = process.argv.includes('--only-universal');

  if (!teamId || !file) {
    throw new Error(
      'Uso: npm run import:songs -- --team=<uuid> --file=<arquivo> [--dry-run] [--only-universal]',
    );
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error(`Equipe ${teamId} nao existe neste banco.`);

  const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
    songs?: ExportedSong[];
  };
  const songs = parsed.songs ?? [];

  if (!songs.length) throw new Error(`Nenhuma musica em ${file}.`);

  console.log(
    `${songs.length} musicas -> "${team.name}"` +
      `${onlyUniversal ? ' (so os dados universais)' : ''}` +
      `${dryRun ? ' [simulacao]' : ''}`,
  );

  let criadas = 0;
  let atualizadas = 0;
  const semTitulo: number[] = [];

  for (const [index, song] of songs.entries()) {
    const title = song.title?.trim();
    if (!title) {
      semTitulo.push(index);
      continue;
    }

    const artist = song.artist?.trim() || null;

    const data: Prisma.SongUncheckedCreateInput = {
      teamId,
      title,
      artist,
      composer: song.composer ?? null,
      kind: song.kind ?? null,
      originalKey: song.originalKey ?? null,
      bpm: song.bpm ?? null,
      lyrics: song.lyrics ?? null,
      lyricsUrl: song.lyricsUrl ?? null,
      chordsUrl: song.chordsUrl ?? null,
      youtubeUrl: song.youtubeUrl ?? null,
      spotifyUrl: song.spotifyUrl ?? null,
      externalSource: song.externalSource ?? null,
      externalId: song.externalId ?? null,
      searchText: buildSearchText({ title, artist, composer: song.composer }),
    };

    if (!onlyUniversal) {
      data.defaultKey = song.defaultKey ?? null;
      data.pace = song.pace ?? null;
      data.isArchived = song.isArchived ?? false;
    }

    // Identidade: id externo quando existe (e o mesmo backup do Holyrics em
    // qualquer banco); senao, titulo+artista, que e a regra 20.
    const existing =
      song.externalSource && song.externalId
        ? await prisma.song.findUnique({
            where: {
              teamId_externalSource_externalId: {
                teamId,
                externalSource: song.externalSource,
                externalId: song.externalId,
              },
            },
            select: { id: true },
          })
        : await prisma.song.findFirst({
            where: {
              teamId,
              title: { equals: title, mode: 'insensitive' },
              artist: artist
                ? { equals: artist, mode: 'insensitive' }
                : { equals: null },
            },
            select: { id: true },
          });

    if (dryRun) {
      existing ? atualizadas++ : criadas++;
      continue;
    }

    if (existing) {
      const { teamId: _t, ...fields } = data;
      await prisma.song.update({ where: { id: existing.id }, data: fields });
      atualizadas++;
    } else {
      await prisma.song.create({ data });
      criadas++;
    }
  }

  console.log(`  criadas    : ${criadas}`);
  console.log(`  atualizadas: ${atualizadas}`);
  if (semTitulo.length) {
    console.log(`  ignoradas (sem titulo): ${semTitulo.length}`);
  }
  if (onlyUniversal) {
    console.log(`  nao vieram : ${TEAM_DECISIONS.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
