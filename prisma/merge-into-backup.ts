/**
 * Devolve o enriquecimento para o arquivo do Holyrics.
 *
 *   docker compose exec api npm run merge:backup -- \
 *     --team=<uuid> --file=tmp/holyrics.js --out=tmp/holyrics-enriquecido.js
 *
 * A ligacao e o `id` do backup, guardado em `external_id` no import -- e por
 * isso que ele foi preservado.
 *
 * Duas regras:
 *
 * 1. **Nao sobrescreve o que ja existe no arquivo.** Se o backup ja tem
 *    artista, ele fica; o nosso so entra onde estava vazio. O arquivo do
 *    usuario e a fonte, o banco e o complemento.
 * 2. **Nao apaga nada.** Campos que o banco nao conhece (letra em
 *    paragrafos, deezer, lyrics_match) passam intactos.
 *
 * O que nao tem lugar no formato original -- cifra, tom e andamento -- entra
 * como campo novo, com nome proprio.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BackupSong {
  id: number | string;
  title: string;
  artist?: string | null;
  author?: string | null;
  lyrics_url?: string | null;
  streaming?: {
    audio?: {
      spotify?: string | null;
      youtube?: string | null;
      deezer?: string | null;
    } | null;
  } | null;
  // Acrescentados por este script.
  chords_url?: string | null;
  key?: string | null;
  bpm?: number | null;
  kind?: string | null;
  team_key?: string | null;
  pace?: string | null;
  [key: string]: unknown;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const teamId = arg('team');
  const file = arg('file');
  const out = arg('out');

  if (!teamId || !file || !out) {
    throw new Error(
      'Uso: npm run merge:backup -- --team=<uuid> --file=<entrada.js> --out=<saida.js>',
    );
  }

  const raw = readFileSync(file, 'utf8');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error(`Nao achei a lista de musicas em ${file}.`);
  }

  const songs = JSON.parse(raw.slice(start, end + 1)) as BackupSong[];

  const rows = await prisma.song.findMany({
    where: { teamId, externalSource: 'holyrics', externalId: { not: null } },
    select: {
      externalId: true,
      artist: true,
      composer: true,
      lyricsUrl: true,
      chordsUrl: true,
      youtubeUrl: true,
      spotifyUrl: true,
      originalKey: true,
      bpm: true,
      kind: true,
      defaultKey: true,
      pace: true,
    },
  });

  const porId = new Map(rows.map((r) => [r.externalId!, r]));

  const conta = {
    casadas: 0,
    artista: 0,
    compositor: 0,
    letraUrl: 0,
    cifra: 0,
    youtube: 0,
    spotify: 0,
    tom: 0,
    bpm: 0,
  };

  for (const song of songs) {
    const row = porId.get(String(song.id));
    if (!row) continue;
    conta.casadas++;

    // Preenche so o que falta no arquivo.
    if (!song.artist && row.artist) {
      song.artist = row.artist;
      conta.artista++;
    }
    if (!song.author && row.composer) {
      song.author = row.composer;
      conta.compositor++;
    }
    if (!song.lyrics_url && row.lyricsUrl) {
      song.lyrics_url = row.lyricsUrl;
      conta.letraUrl++;
    }

    if (row.youtubeUrl || row.spotifyUrl) {
      song.streaming ??= {};
      song.streaming.audio ??= {};
      if (!song.streaming.audio.youtube && row.youtubeUrl) {
        song.streaming.audio.youtube = row.youtubeUrl;
        conta.youtube++;
      }
      if (!song.streaming.audio.spotify && row.spotifyUrl) {
        song.streaming.audio.spotify = row.spotifyUrl;
        conta.spotify++;
      }
    }

    // Campos que o formato original nao tem.
    if (row.chordsUrl) {
      song.chords_url = row.chordsUrl;
      conta.cifra++;
    }
    if (row.originalKey) {
      song.key = row.originalKey;
      conta.tom++;
    }
    if (row.bpm) {
      song.bpm = row.bpm;
      conta.bpm++;
    }
    if (row.kind) song.kind = row.kind;
    // Decisoes da equipe, quando ja tomadas.
    if (row.defaultKey) song.team_key = row.defaultKey;
    if (row.pace) song.pace = row.pace;
  }

  writeFileSync(
    out,
    `window.CLEANED_SONGS = ${JSON.stringify(songs, null, 2)};\n`,
    'utf8',
  );

  console.log(`${songs.length} musicas no arquivo, ${conta.casadas} casadas com o banco`);
  console.log('--- preenchidos onde estava vazio ---');
  console.log(`  artista    : ${conta.artista}`);
  console.log(`  compositor : ${conta.compositor}`);
  console.log(`  link letra : ${conta.letraUrl}`);
  console.log(`  youtube    : ${conta.youtube}`);
  console.log(`  spotify    : ${conta.spotify}`);
  console.log('--- campos novos ---');
  console.log(`  chords_url : ${conta.cifra}`);
  console.log(`  key        : ${conta.tom}`);
  console.log(`  bpm        : ${conta.bpm}`);
  console.log(`\n-> ${out}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
