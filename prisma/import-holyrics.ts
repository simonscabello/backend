/**
 * Importa o repertorio exportado do Holyrics para uma equipe.
 *
 *   docker compose exec api npx ts-node prisma/import-holyrics.ts \
 *     --file=tmp/holyrics.js --team=<uuid> [--dry-run]
 *
 * O arquivo e um .js (`window.CLEANED_SONGS = [...]`), nao um .json -- por
 * isso o recorte pelo primeiro "[" e o ultimo "]" em vez de um require.
 * Nada e avaliado como codigo: e JSON.parse sobre o trecho recortado.
 *
 * Repetivel: a chave e (team, "holyrics", id do backup), entao rodar de novo
 * atualiza o que mudou em vez de duplicar. Roda quantas vezes precisar.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { buildSearchText } from '../src/modules/songs/song-search';

const prisma = new PrismaClient();

const EXTERNAL_SOURCE = 'holyrics';

/// Sites de cifra. O backup guarda um `lyrics_url` so, e em 53 dos 285 ele
/// aponta para cifra -- separar por dominio ja preenche os dois campos.
const CHORD_HOSTS = ['cifraclub', 'cifras.com.br', 'e-chords', 'recifra'];

/// Nem todo `lyrics_url` e uma pagina de letra: 33 apontam para o Shazam e
/// 2 para o SoundCloud. Um botao "Letra" que abre o Shazam e uma promessa
/// quebrada, entao esses ficam de fora.
const NOT_LYRICS_HOSTS = ['shazam.com', 'soundcloud.com'];

/// Hinarios conhecidos aparecem no campo de artista ("Cantor Cristao - 148").
const HYMNAL = /harpa crist|cantor crist|hin[aá]rio|^hcc\b/i;

interface HolyricsSong {
  id: number | string;
  title: string;
  artist?: string | null;
  author?: string | null;
  lyrics?: { full_text?: string | null } | null;
  streaming?: {
    audio?: {
      spotify?: string | null;
      youtube?: string | null;
      deezer?: string | null;
    } | null;
  } | null;
  lyrics_url?: string | null;
}

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseFile(path: string): HolyricsSong[] {
  const raw = readFileSync(path, 'utf8');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');

  if (start === -1 || end === -1) {
    throw new Error(`Nao achei a lista de musicas em ${path}.`);
  }

  return JSON.parse(raw.slice(start, end + 1)) as HolyricsSong[];
}

function toSongData(song: HolyricsSong, teamId: string) {
  const title = clean(song.title);
  if (!title) return null;

  const artist = clean(song.artist);
  const composer = clean(song.author);

  const url = clean(song.lyrics_url);
  const host = url ? hostOf(url) : '';
  const isChords = CHORD_HOSTS.some((h) => host.includes(h));
  const isUsableLyricsPage = url && !NOT_LYRICS_HOSTS.some((h) => host.includes(h));

  return {
    teamId,
    title,
    artist,
    composer,
    // O hinario vem escrito no artista; o resto fica nulo para a equipe
    // classificar. Chutar "cantico" para 277 musicas seria pior do que
    // deixar vazio -- vazio a tela sabe cobrar.
    kind: artist && HYMNAL.test(artist) ? ('HYMN' as const) : null,
    lyrics: clean(song.lyrics?.full_text),
    lyricsUrl: !isChords && isUsableLyricsPage ? url : null,
    chordsUrl: isChords ? url : null,
    youtubeUrl: clean(song.streaming?.audio?.youtube),
    spotifyUrl: clean(song.streaming?.audio?.spotify),
    searchText: buildSearchText({ title, artist, composer }),
    externalSource: EXTERNAL_SOURCE,
    externalId: String(song.id),
  } satisfies Prisma.SongUncheckedCreateInput;
}

async function main(): Promise<void> {
  const file = arg('file');
  const teamId = arg('team');
  const dryRun = process.argv.includes('--dry-run');

  if (!file || !teamId) {
    throw new Error(
      'Uso: ts-node prisma/import-holyrics.ts --file=<caminho> --team=<uuid> [--dry-run]',
    );
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new Error(`Equipe ${teamId} nao existe.`);
  }

  const songs = parseFile(file);
  console.log(`${songs.length} musicas no arquivo, equipe "${team.name}".`);

  const seen = new Map<string, string>();
  const report = {
    created: 0,
    updated: 0,
    duplicated: [] as string[],
    skipped: [] as string[],
    lyrics: 0,
    chords: 0,
    youtube: 0,
    spotify: 0,
    hymns: 0,
  };

  for (const raw of songs) {
    const data = toSongData(raw, teamId);

    if (!data) {
      report.skipped.push(String(raw.id));
      continue;
    }

    // Regra 20 aplicada aqui tambem: o banco so garante a unicidade do
    // external_id, e o arquivo tem dois pares titulo+artista repetidos.
    const key = `${data.title.toLowerCase()}|${(data.artist ?? '').toLowerCase()}`;
    const first = seen.get(key);
    if (first) {
      report.duplicated.push(`${data.title} (${data.artist ?? 'sem artista'})`);
      continue;
    }
    seen.set(key, data.externalId);

    if (data.lyricsUrl) report.lyrics++;
    if (data.chordsUrl) report.chords++;
    if (data.youtubeUrl) report.youtube++;
    if (data.spotifyUrl) report.spotify++;
    if (data.kind === 'HYMN') report.hymns++;

    if (dryRun) continue;

    const existing = await prisma.song.findUnique({
      where: {
        teamId_externalSource_externalId: {
          teamId,
          externalSource: EXTERNAL_SOURCE,
          externalId: data.externalId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      // Nao mexe em defaultKey, pace nem isArchived: sao decisoes da equipe,
      // e reimportar nao pode apagar o trabalho de classificacao.
      const { teamId: _t, externalId: _e, externalSource: _s, ...fields } = data;
      await prisma.song.update({ where: { id: existing.id }, data: fields });
      report.updated++;
    } else {
      await prisma.song.create({ data });
      report.created++;
    }
  }

  console.log('');
  console.log(dryRun ? '--- simulacao (nada foi gravado) ---' : '--- resultado ---');
  console.log(`criadas   : ${report.created}`);
  console.log(`atualizadas: ${report.updated}`);
  console.log(`com letra (link)  : ${report.lyrics}`);
  console.log(`com cifra         : ${report.chords}`);
  console.log(`com youtube       : ${report.youtube}`);
  console.log(`com spotify       : ${report.spotify}`);
  console.log(`marcadas como hino: ${report.hymns}`);

  if (report.duplicated.length) {
    console.log(`\nduplicadas no arquivo (a 2a foi ignorada):`);
    report.duplicated.forEach((d) => console.log(`  - ${d}`));
  }
  if (report.skipped.length) {
    console.log(`\nsem titulo, ignoradas: ${report.skipped.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
