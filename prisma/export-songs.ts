/**
 * Exporta o repertorio de uma equipe para um arquivo JSON.
 *
 *   docker compose exec api npm run export:songs -- --team=<uuid> --file=tmp/songs.json
 *
 * O arquivo sai **sem `id` e sem `teamId`**: ele descreve musicas, nao linhas
 * de um banco especifico. Quem decide a equipe de destino e o import.
 *
 * `externalSource` + `externalId` vao junto de proposito -- e o que permite
 * reimportar por cima em vez de duplicar, e o que faz a mesma musica ser
 * reconhecida entre equipes diferentes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const teamId = arg('team');
  const file = arg('file');

  if (!teamId || !file) {
    throw new Error(
      'Uso: npm run export:songs -- --team=<uuid> --file=tmp/songs.json',
    );
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error(`Equipe ${teamId} nao existe.`);

  const songs = await prisma.song.findMany({
    where: { teamId },
    orderBy: { searchText: 'asc' },
    select: {
      title: true,
      artist: true,
      composer: true,
      kind: true,
      pace: true,
      defaultKey: true,
      originalKey: true,
      bpm: true,
      lyrics: true,
      lyricsUrl: true,
      chordsUrl: true,
      youtubeUrl: true,
      spotifyUrl: true,
      isArchived: true,
      externalSource: true,
      externalId: true,
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    sourceTeam: team.name,
    count: songs.length,
    songs,
  };

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');

  const com = (n: number) => `${n}/${songs.length}`;
  console.log(`${songs.length} musicas de "${team.name}" -> ${file}`);
  console.log(`  com letra   : ${com(songs.filter((s) => s.lyrics).length)}`);
  console.log(`  com cifra   : ${com(songs.filter((s) => s.chordsUrl).length)}`);
  console.log(`  com tom da equipe: ${com(songs.filter((s) => s.defaultKey).length)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
