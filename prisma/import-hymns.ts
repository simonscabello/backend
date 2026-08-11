/**
 * Importa os 581 hinos do Cantor Cristao para o repertorio de uma equipe.
 *
 *   docker compose exec api npm run import:hymns -- --team=<uuid> [--dry-run]
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VEM A LISTA
 * ---------------------------------------------------------------------------
 * Do menu lateral da Coletanea Cantor Cristao (sites.google.com). As paginas
 * de hino de la estao VAZIAS -- so o titulo, sem letra e sem PDF (verificado
 * nos hinos 001, 112 e 142 e na pagina de Concordancia, em 11/08/2026). O que
 * o site tem de unico e o indice: 581 hinos, de 1 a 581, sem buraco nenhum,
 * com o titulo oficial de cada um. E a unica fonte encontrada com a numeracao
 * completa -- o CifraClub tem 669 paginas para os mesmos 581 hinos, com numero
 * dentro do titulo em formatos que brigam entre si.
 *
 * O indice vem no HTML cru (nao depende de JavaScript), entao um fetch basta.
 * Na primeira execucao ele e gravado em `prisma/data/cantor-cristao.json`; nas
 * seguintes o arquivo e usado direto. Assim a importacao continua reproduzivel
 * no dia em que aquele site sair do ar -- e da para revisar a lista no diff.
 *
 * ---------------------------------------------------------------------------
 * O QUE ENTRA NO BANCO
 * ---------------------------------------------------------------------------
 * Titulo, numero (`hymnNumber`), `kind: HYMN` e artista "Cantor Cristao".
 *
 * Artista preenchido, e nao vazio: hino nao tem interprete, mas o campo e o
 * que a tela mostra embaixo do titulo (vazio ele exibe "Sem artista") e o que
 * faz "cantor cristao" na busca trazer o hinario inteiro. E tambem como o
 * CifraClub e o letras.mus.br nomeiam a colecao.
 *
 * NAO entra: `defaultKey`, `kind` a parte, `pace` -- decisao da equipe -- nem
 * `isNew`. Acervo importado nao e novidade para ninguem; a equipe marca "Musica
 * nova" no hino que for de fato ensaiar.
 *
 * Rodar de novo NAO duplica: a chave e (equipe, numero do hino). Hino que ja
 * existe tem so o titulo corrigido, se tiver mudado.
 *
 * ---------------------------------------------------------------------------
 * ADOCAO: O QUE JA ESTAVA NO ACERVO
 * ---------------------------------------------------------------------------
 * O backup do Holyrics trouxe hinos como musica comum, com o hinario e o numero
 * escondidos no campo do artista ("Cantor Cristão - 093"). Criar o 093 do zero
 * ao lado daquele deixaria duas linhas do mesmo hino na busca -- e a nova sem a
 * LETRA que a antiga tem.
 *
 * Entao o script ADOTA: reconhece a musica que ja esta la, poe o numero no
 * lugar certo, normaliza o artista e mantem letra, cifra e tudo o mais. So
 * adota com prova: o artista precisa dizer "Cantor Cristao", e ou o numero
 * bate, ou o titulo bate.
 *
 * Titulo igual SEM artista de hinario nao e prova e nao adota -- "Consagração"
 * da Aline Barros nao e o hino 296, e "Espírito Santo" da Fernanda Brum nao e o
 * 117. Esses casos sao listados no fim para alguem olhar.
 *
 * Harpa Crista e Hinario para o Culto Cristao ficam INTOCADOS. Este campo
 * guarda numero do Cantor Cristao e nada mais; pintar "545" numa musica da
 * Harpa faria a tela dizer que ela e o Cantor Cristao 545, que e outro hino.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { buildSearchText } from '../src/modules/songs/song-search';

const prisma = new PrismaClient();

const INDICE =
  'https://sites.google.com/site/coletaneacantorcristao/001-ant%C3%ADfona';
const CACHE = join(__dirname, 'data', 'cantor-cristao.json');
const ARTISTA = 'Cantor Cristão';
const ULTIMO_HINO = 581;

interface Hino {
  number: number;
  title: string;
}

function arg(name: string): string | undefined {
  return process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

/// Le o indice do site, ou o cache se ele ja existir.
async function carregarHinos(): Promise<Hino[]> {
  if (existsSync(CACHE)) {
    const hinos = JSON.parse(readFileSync(CACHE, 'utf8')) as Hino[];
    console.log(`lista: ${hinos.length} hinos (de ${CACHE})`);
    return hinos;
  }

  const response = await fetch(INDICE, {
    headers: {
      // Sem User-Agent de navegador o Google devolve outra pagina.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(
      `A Coletanea respondeu ${response.status}. Sem ela nao ha lista -- ` +
        `tente de novo, ou reponha ${CACHE} de um backup.`,
    );
  }

  const html = await response.text();
  const encontrados = new Map<number, string>();

  // O menu lateral traz "<a ...>001 - Antifona</a>" para cada hino. O 000 e a
  // pagina de Concordancia, que nao e hino.
  for (const m of html.matchAll(/>(\d{3})\s*-\s*([^<]{2,80})</g)) {
    const numero = Number(m[1]);
    if (numero < 1 || numero > ULTIMO_HINO) continue;
    // O primeiro vence: 060 aparece duas vezes (CORONATION e DIADEM), que sao
    // duas melodias do mesmo hino, nao dois hinos.
    if (!encontrados.has(numero)) encontrados.set(numero, m[2].trim());
  }

  const hinos = [...encontrados.entries()]
    .map(([number, title]) => ({ number, title }))
    .sort((a, b) => a.number - b.number);

  // A lista tem de estar inteira. Importar 400 hinos e descobrir o buraco
  // depois, com a equipe usando, sai muito mais caro do que parar aqui.
  const faltando: number[] = [];
  for (let n = 1; n <= ULTIMO_HINO; n++) {
    if (!encontrados.has(n)) faltando.push(n);
  }
  if (faltando.length) {
    throw new Error(
      `O indice veio incompleto: faltam ${faltando.length} hinos ` +
        `(${faltando.slice(0, 10).join(', ')}...). O site pode ter mudado de ` +
        `formato -- confira antes de importar.`,
    );
  }

  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, `${JSON.stringify(hinos, null, 2)}\n`, 'utf8');
  console.log(`lista: ${hinos.length} hinos (baixados e gravados em ${CACHE})`);

  return hinos;
}

const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface Existente {
  id: string;
  title: string;
  artist: string | null;
  kind: 'HYMN' | 'SONG' | null;
  hymnNumber: number | null;
}

/// A musica ja cadastrada e do Cantor Cristao?
///
/// Pelo artista, que e onde o backup do Holyrics guardou o hinario. `kind`
/// sozinho nao serve: HYMN diz "e hino", nao diz de qual hinario -- e o acervo
/// tem Harpa Crista e HCC marcados igual.
function ehCantorCristao(song: Existente): boolean {
  return /cantor crist/.test(normalizar(song.artist ?? ''));
}

/// O numero que o artista carrega em "Cantor Cristão - 093".
function numeroNoArtista(song: Existente): number | null {
  const m = (song.artist ?? '').match(/(\d{1,3})\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= ULTIMO_HINO ? n : null;
}

async function main(): Promise<void> {
  const teamId = arg('team');
  const dryRun = process.argv.includes('--dry-run');

  if (!teamId) {
    throw new Error('Uso: npm run import:hymns -- --team=<uuid> [--dry-run]');
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) throw new Error(`Equipe ${teamId} nao encontrada.`);

  const hinos = await carregarHinos();

  const acervo = (await prisma.song.findMany({
    where: { teamId },
    select: {
      id: true,
      title: true,
      artist: true,
      kind: true,
      hymnNumber: true,
    },
  })) as Existente[];

  // Ja numerados: rodadas anteriores deste script.
  const porNumero = new Map<number, Existente>();
  // Candidatos a adocao: veio do Holyrics com o hinario no artista.
  const adotaveisPorNumero = new Map<number, Existente>();
  const adotaveisPorTitulo = new Map<string, Existente>();
  // Musica qualquer com titulo de hino -- so para avisar no fim.
  const homonimos = new Map<string, Existente[]>();

  for (const song of acervo) {
    if (song.hymnNumber) {
      porNumero.set(song.hymnNumber, song);
      continue;
    }

    const chave = normalizar(song.title);

    if (ehCantorCristao(song)) {
      const n = numeroNoArtista(song);
      if (n && !adotaveisPorNumero.has(n)) adotaveisPorNumero.set(n, song);
      if (!adotaveisPorTitulo.has(chave)) adotaveisPorTitulo.set(chave, song);
      continue;
    }

    if (!homonimos.has(chave)) homonimos.set(chave, []);
    homonimos.get(chave)!.push(song);
  }

  // Distintas: a mesma musica costuma estar nos dois indices, e somar os
  // tamanhos contaria cada uma duas vezes.
  const candidatas = new Set(
    [...adotaveisPorNumero.values(), ...adotaveisPorTitulo.values()].map(
      (s) => s.id,
    ),
  );

  console.log(
    `equipe: ${team.name} — ${acervo.length} musicas, ` +
      `${porNumero.size} ja numeradas, ` +
      `${candidatas.size} candidatas a adocao\n`,
  );

  let criados = 0;
  let adotados = 0;
  let renomeados = 0;
  let iguais = 0;
  const avisos: string[] = [];

  for (const hino of hinos) {
    const numeroFmt = String(hino.number).padStart(3, '0');
    const jaNumerado = porNumero.get(hino.number);

    // 1. Ja e deste hino: no maximo corrige o titulo.
    if (jaNumerado) {
      if (jaNumerado.title === hino.title) {
        iguais++;
        continue;
      }
      console.log(`  ~ ${numeroFmt} "${jaNumerado.title}" -> "${hino.title}"`);
      if (!dryRun) {
        await prisma.song.update({
          where: { id: jaNumerado.id },
          data: {
            title: hino.title,
            searchText: buildSearchText({
              title: hino.title,
              artist: ARTISTA,
              hymnNumber: hino.number,
            }),
          },
        });
      }
      renomeados++;
      continue;
    }

    // 2. Ja esta no acervo como musica comum: adota em vez de duplicar. O
    //    numero no artista e a prova mais forte; o titulo vem depois.
    const adotavel =
      adotaveisPorNumero.get(hino.number) ??
      adotaveisPorTitulo.get(normalizar(hino.title));

    if (adotavel) {
      console.log(
        `  + ${numeroFmt} adota "${adotavel.title}" (${adotavel.artist}) — mantem letra e links`,
      );
      if (!dryRun) {
        await prisma.song.update({
          where: { id: adotavel.id },
          data: {
            title: hino.title,
            artist: ARTISTA,
            kind: 'HYMN',
            hymnNumber: hino.number,
            searchText: buildSearchText({
              title: hino.title,
              artist: ARTISTA,
              hymnNumber: hino.number,
            }),
          },
        });
      }
      // Sai dos indices: uma musica so pode ser adotada por um hino.
      adotaveisPorNumero.delete(hino.number);
      adotaveisPorTitulo.delete(normalizar(adotavel.title));
      adotados++;
      continue;
    }

    // 3. Nao existe: cria.
    const iguaisNoAcervo = homonimos.get(normalizar(hino.title));
    if (iguaisNoAcervo) {
      avisos.push(
        `  ${numeroFmt} "${hino.title}" nasceu ao lado de: ` +
          iguaisNoAcervo
            .map((s) => `"${s.title}" (${s.artist ?? 'sem artista'})`)
            .join(', '),
      );
    }

    if (!dryRun) {
      await prisma.song.create({
        data: {
          teamId,
          title: hino.title,
          artist: ARTISTA,
          kind: 'HYMN',
          hymnNumber: hino.number,
          searchText: buildSearchText({
            title: hino.title,
            artist: ARTISTA,
            hymnNumber: hino.number,
          }),
        },
      });
    }
    criados++;
  }

  console.log(
    `\n-> ${criados} ${dryRun ? 'seriam criados' : 'criados'}, ` +
      `${adotados} adotados do acervo, ` +
      `${renomeados} com titulo corrigido, ${iguais} sem mudanca` +
      `${dryRun ? '  (simulacao)' : ''}`,
  );

  if (avisos.length) {
    console.log(
      `\n${avisos.length} hinos tem xara no acervo. NAO foram unidos de proposito ` +
        `-- "Consagração" da Aline Barros nao e o hino 296. Confira e arquive o ` +
        `que for repetido:`,
    );
    for (const aviso of avisos) console.log(aviso);
  }

  const outrosHinarios = acervo.filter(
    (s) =>
      !s.hymnNumber &&
      !ehCantorCristao(s) &&
      /harpa crist|hinario para o culto|^hcc\b/.test(normalizar(s.artist ?? '')),
  );
  if (outrosHinarios.length) {
    console.log(
      `\n${outrosHinarios.length} musicas de OUTROS hinarios ficaram intocadas ` +
        `(o campo guarda numero do Cantor Cristao e so dele):`,
    );
    for (const s of outrosHinarios) {
      console.log(`  ${s.artist} — ${s.title}`);
    }
  }

  if (criados && !dryRun) {
    console.log(
      '\nAgora rode o enriquecimento para buscar cifra, letra e video:\n' +
        `  npm run enrich:hymns -- --team=${teamId} --dry-run`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
