/**
 * Traz para o repertorio as musicas de uma coletanea do CifraClub que ainda
 * nao existem na equipe.
 *
 *   docker compose exec api npm run import:collection -- --team=<uuid> --collection=corinhos-evangelicos [--dry-run]
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO E, E O QUE NAO E
 * ---------------------------------------------------------------------------
 * Coletanea do CifraClub e uma pagina de "artista" que na verdade agrupa o que
 * nao tem artista: corinho de igreja, hino da Harpa. `corinhos-evangelicos` tem
 * 396 paginas; `harpa-crista`, 624.
 *
 * NAO e o import de hinario (`import-hymns.ts`). La existe numeracao, o
 * catalogo e fechado e a chave e (equipe, numero do hino). Aqui nao ha numero
 * nenhum: a unica chave possivel e o titulo, e por isso todo o cuidado deste
 * script esta em NAO criar o que ja existe com outro nome.
 *
 * ---------------------------------------------------------------------------
 * COMO DECIDE SE JA EXISTE
 * ---------------------------------------------------------------------------
 * Titulo identico (sem acento, sem maiuscula, sem pontuacao) ou 75% de
 * semelhanca por palavra. Os guardas moram em `cifraclub-collections.ts` e cada
 * um nasceu de um erro medido no acervo real:
 *
 *   "Contente Estou" x "Estou Contente"      mesmas palavras, ordem trocada
 *   "Eu Sou Feliz"   x "Sou Feliz"           uma contida na outra
 *   "Alfa e Omega"   x "Alfa, Omega"         so a pontuacao muda
 *
 * Nenhuma dessas vira musica nova. Na duvida o script NAO cria e lista o par
 * para conferencia -- duplicata no repertorio e pior que ausencia: ela se
 * espalha pelas escalas e depois alguem tem de unir na mao.
 *
 * ---------------------------------------------------------------------------
 * O QUE A MUSICA TRAZ AO NASCER
 * ---------------------------------------------------------------------------
 * Titulo, artista da coletanea, `chordsUrl` (o indice ja da o endereco) e
 * `lyricsUrl` derivado dele, de graca. Fica faltando so o que nenhuma API
 * responde e a equipe decide: tom, hino/cantico e andamento.
 *
 * `isNew` nasce falso: acervo importado nao e novidade para ninguem. A equipe
 * marca "Musica nova" no que for de fato ensaiar.
 *
 * Rodar de novo nao duplica -- na segunda execucao tudo ja existe.
 */
import { PrismaClient } from '@prisma/client';
import { buildSearchText, normalizeSearch } from '../src/modules/songs/song-search';
import {
  ARTISTA_DA_COLECAO,
  COLECOES,
  baixarColecao,
  mesmasPalavrasOutraOrdem,
  semelhanca,
  urlDaLetra,
} from './cifraclub-collections';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const teamId = arg('team');
  const slug = arg('collection');
  const dryRun = process.argv.includes('--dry-run');

  if (!teamId || !slug) {
    throw new Error(
      'Uso: npm run import:collection -- --team=<uuid> --collection=<slug> [--dry-run]\n' +
        `Coletaneas conhecidas: ${COLECOES.join(', ')}`,
    );
  }

  const artista = arg('artist') ?? ARTISTA_DA_COLECAO[slug];
  if (!artista) {
    throw new Error(
      `Nao sei como assinar as musicas de "${slug}". Passe --artist="Nome".`,
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) throw new Error(`Equipe ${teamId} nao encontrada.`);

  const indice = await baixarColecao(slug);
  if (!indice.length) {
    throw new Error(
      `A coletanea "${slug}" veio vazia. Ou o slug esta errado, ou o formato ` +
        `da pagina mudou -- veja \`baixarColecao\` em cifraclub-collections.ts.`,
    );
  }

  // O acervo inteiro, inclusive arquivadas e hinos: o que importa aqui e "esta
  // musica ja existe em algum lugar", e recriar uma arquivada seria ressuscitar
  // pela porta dos fundos o que a equipe tirou de circulacao.
  const acervo = await prisma.song.findMany({
    where: { teamId },
    select: { id: true, title: true, artist: true, isArchived: true },
  });

  console.log(
    `${team.name}: ${acervo.length} musicas no acervo\n` +
      `coletanea ${slug}: ${indice.length} paginas\n`,
  );

  const porTitulo = new Map<string, (typeof acervo)[number]>();
  for (const song of acervo) {
    const k = normalizeSearch(song.title);
    if (!porTitulo.has(k)) porTitulo.set(k, song);
  }

  let criados = 0;
  const jaExistiam: string[] = [];
  const parecidas: string[] = [];

  for (const item of indice) {
    const alvo = normalizeSearch(item.comparavel);

    const identica = porTitulo.get(alvo);
    if (identica) {
      jaExistiam.push(item.titulo);
      continue;
    }

    // Parecida demais para criar do lado. Uma varredura no acervo inteiro por
    // item e O(n*m), mas sao 396 x 861 -- roda em memoria, sem rede.
    let melhor: (typeof acervo)[number] | null = null;
    let score = 0;
    for (const song of acervo) {
      const s = semelhanca(item.comparavel, song.title);
      if (s > score) {
        score = s;
        melhor = song;
      }
    }

    if (
      melhor &&
      (score >= 0.75 || mesmasPalavrasOutraOrdem(item.comparavel, melhor.title))
    ) {
      parecidas.push(
        `  "${item.titulo}"  ~  "${melhor.title}"` +
          `${melhor.isArchived ? ' (arquivada)' : ''}` +
          ` — ${score >= 0.75 ? `${Math.round(score * 100)}%` : 'mesmas palavras, ordem trocada'}`,
      );
      continue;
    }

    if (!dryRun) {
      await prisma.song.create({
        data: {
          teamId,
          title: item.titulo,
          artist: artista,
          chordsUrl: item.url,
          // Sai de graca do endereco da cifra, sem nenhuma requisicao.
          lyricsUrl: urlDaLetra(item.url),
          searchText: buildSearchText({ title: item.titulo, artist: artista }),
        },
      });
    }
    criados++;
  }

  console.log(
    `-> ${criados} ${dryRun ? 'seriam criadas' : 'criadas'} com cifra e link de letra\n` +
      `   ${jaExistiam.length} ja existiam com o mesmo titulo\n` +
      `   ${parecidas.length} parecidas demais para criar do lado`,
  );

  if (parecidas.length) {
    console.log(
      `\nEstas NAO foram criadas, para nao virar duplicata. Se alguma for mesmo\n` +
        `outra musica, cadastre a mao:`,
    );
    for (const p of parecidas) console.log(p);
  }

  if (criados && !dryRun) {
    console.log(
      `\nTom e andamento nascem vazios (a equipe decide). Para ler o tom da\n` +
        `gravacao e o bpm das paginas novas:\n` +
        `  npm run enrich:songs -- --team=${teamId} --only=tom`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
