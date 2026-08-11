/**
 * Preenche cifra, letra e video dos hinos do Cantor Cristao.
 *
 *   docker compose exec api npm run enrich:hymns -- --team=<uuid> [--dry-run] [--limit=N] [--only=cifra,video]
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE SCRIPT ACHA CIFRA E O DOS CANTICOS NAO
 * ---------------------------------------------------------------------------
 * `enrich-songs.ts` documenta que cifra ficou manual: montar a URL pelo padrao
 * `cifraclub.com.br/<artista>/<musica>/` acertava 34%, e errar calado e pior
 * que campo vazio.
 *
 * Aqui o problema e outro. O Cantor Cristao e um catalogo FECHADO e NUMERADO, e
 * o CifraClub publica o indice inteiro do artista numa pagina so. Entao nao ha
 * palpite de slug: baixa-se o indice uma vez (669 paginas) e casa-se contra os
 * 581 hinos que ja estao no banco. Medido em 11/08/2026: 530 de 581 (91%), dos
 * quais 505 pelo NUMERO -- que o proprio CifraClub poe no titulo -- e 25 pelo
 * titulo normalizado.
 *
 * ---------------------------------------------------------------------------
 * O CRITERIO DE CASAMENTO
 * ---------------------------------------------------------------------------
 * Numero + titulo compativel, ou titulo identico. Nunca so o numero.
 *
 * O numero sozinho nao basta porque a pagina e colaborativa: aparecem numeros
 * impossiveis (973), numeros que sao parte do nome ("Consagracao 296") e o
 * mesmo numero em paginas diferentes. E o titulo sozinho nao basta porque o
 * hinario repete nomes -- ha varios "Louvor" e varios "Aleluia".
 *
 * A compatibilidade de titulo e por SOBREPOSICAO DE PALAVRAS, e nao por
 * igualdade: o CifraClub tem typo em titulo ("Jesus Me Tranformou", "Dia
 * Vestivo", "Nao Sei Porque" contra "Nao Sei Por Que"). Exigir igualdade
 * recusava 20 casamentos certos; exigir metade das palavras em comum recupera
 * todos eles sem aceitar hino trocado -- dois hinos diferentes com o mesmo
 * numero e metade das palavras iguais nao existem no Cantor Cristao.
 *
 * ---------------------------------------------------------------------------
 * LETRA
 * ---------------------------------------------------------------------------
 * Sai de graca da cifra: no CifraClub, a mesma pagina com `/letra/` no fim
 * mostra so a letra. Zero requisicao. E a mesma derivacao que `enrich-songs.ts`
 * ja faz para os canticos.
 *
 * O letras.mus.br foi avaliado e ficou de fora: o indice do artista de la nao
 * traz numero de hino, e as URLs vem em tres formatos diferentes
 * (`/675278/`, `/tudo-entregarei/`, `/hino-342-a-minha-cruz/`). Casar aquilo
 * seria adivinhacao para chegar onde a derivacao acima ja chega com certeza.
 *
 * ---------------------------------------------------------------------------
 * VIDEO
 * ---------------------------------------------------------------------------
 * So do canal "Musica Tradicional Crista", que canta o Cantor Cristao de forma
 * congregacional -- que e como a igreja vai cantar. Busca aberta no YouTube
 * traria solo, orquestra e coral, e o casamento por titulo nao teria como
 * distinguir. Requer YOUTUBE_API_KEY (a mesma do outro script); sem ela, a
 * etapa e pulada e as outras seguem.
 *
 * Nunca sobrescreve link existente. Rode com --dry-run primeiro.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INDICE_CIFRACLUB =
  'https://www.cifraclub.com.br/cantor-cristao/musicas.html';
const CANAL_YOUTUBE = 'MúsicaTradicionalCristã';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  return process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

interface HinoRow {
  id: string;
  title: string;
  hymnNumber: number;
  chordsUrl: string | null;
  lyricsUrl: string | null;
  youtubeUrl: string | null;
}

// ------------------------------------------------------------ comparacao

/// Minusculas, sem acento, so letras e numeros. E o mesmo espirito do
/// `normalizeSearch` da API, mas aqui tambem separa pontuacao em espaco:
/// "Nao Sei Por Que" e "Nao Sei Porque" precisam virar listas de palavras
/// comparaveis.
function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/// Tira o numero do titulo do CifraClub, nas formas que aparecem la:
/// "112 - Vencendo", "385 Cc - Louvor", "Hino 380", "Oh, Trazei... -244".
function separarNumero(titulo: string): { numero: number | null; texto: string } {
  const t = titulo.trim();

  let m = t.match(/^0*(\d{1,3})\s*(?:cc)?\s*[-–—:.]?\s+(.+)$/i);
  if (m) return { numero: Number(m[1]), texto: m[2].trim() };

  m = t.match(/^hino\s*0*(\d{1,3})\s*[-–—:.]?\s*(.*)$/i);
  if (m) return { numero: Number(m[1]), texto: m[2].trim() };

  m = t.match(/^(.*?)[\s\-–—]+0*(\d{1,3})\s*$/);
  if (m) return { numero: Number(m[2]), texto: m[1].trim() };

  return { numero: null, texto: t };
}

/// Fracao de palavras em comum, ignorando as curtas ("a", "o", "de").
///
/// O limiar e argumento porque as duas chamadas correm risco diferente.
///
/// No CifraClub (0,5) o NUMERO ja identificou o hino e o titulo so faz a
/// guarda contra numero absurdo. Exigir igualdade ali perdia 20 casamentos
/// certos por typo do proprio site ("Jesus Me Tranformou", "Dia Vestivo",
/// "Nao Sei Porque" contra "Por Que").
///
/// No YouTube sem numero no titulo (1,0) o titulo e a unica prova, e meio
/// titulo nao prova nada: "Louvor ao Senhor" (hino 3) e "Gloria ao Senhor"
/// (hino 6) dividem "senhor", e com 0,5 os dois recebiam o MESMO video --
/// aconteceu no dry-run, por isso este parametro existe.
///
/// Titulo vazio conta como compativel: e o caso de "Hino 380" no CifraClub,
/// onde o numero e tudo o que a pagina diz.
function titulosCompativeis(a: string, b: string, minimo = 0.5): boolean {
  const palavras = (s: string) =>
    new Set(normalizar(s).split(' ').filter((p) => p.length > 2));

  const pa = palavras(a);
  const pb = palavras(b);
  if (!pa.size || !pb.size) return true;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;

  return comuns / Math.min(pa.size, pb.size) >= minimo;
}

// ------------------------------------------------------------- CifraClub

/// Baixa o indice do artista e devolve titulo + URL de cada pagina.
///
/// O CifraClub e Next.js: a lista nao esta em `<a href>` no HTML, esta no
/// payload do React Server Components, com as aspas escapadas. Por isso o
/// regex procura `\"primaryLabel\"` e `\"href\"` -- e o formato real da pagina,
/// verificado em 11/08/2026. Se um dia o indice vier vazio, e aqui que mudou.
async function baixarIndice(): Promise<{ texto: string; url: string }[]> {
  const response = await fetch(INDICE_CIFRACLUB, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });

  if (!response.ok) {
    throw new Error(`CifraClub respondeu ${response.status} no indice.`);
  }

  const html = await response.text();
  const paginas = new Map<string, string>();

  for (const m of html.matchAll(
    /\\"primaryLabel\\":\\"((?:[^\\"]|\\.){1,120}?)\\"[\s\S]{0,200}?\\"href\\":\\"(\/cantor-cristao\/[^\\"]+)\\"/g,
  )) {
    const texto = m[1].replace(/\\\\"/g, '"').replace(/\\"/g, '"').trim();
    const url = `https://www.cifraclub.com.br${m[2]}`;
    if (!paginas.has(url)) paginas.set(url, texto);
  }

  if (!paginas.size) {
    throw new Error(
      'O indice do CifraClub veio sem nenhuma pagina. O formato da pagina ' +
        'provavelmente mudou -- veja `baixarIndice` neste arquivo.',
    );
  }

  return [...paginas.entries()].map(([url, texto]) => ({ url, texto }));
}

/// Casa as paginas do indice com os hinos do banco.
function casar(
  hinos: HinoRow[],
  paginas: { texto: string; url: string }[],
): Map<string, string> {
  const porNumero = new Map(hinos.map((h) => [h.hymnNumber, h]));
  const porTitulo = new Map<string, HinoRow>();
  for (const h of hinos) {
    const k = normalizar(h.title);
    // O primeiro vence: ha titulos repetidos no hinario ("Louvor" aparece
    // varias vezes), e sem numero nao ha como saber qual. Nesses o casamento
    // por titulo e o ultimo recurso, e so entra se o numero falhou.
    if (!porTitulo.has(k)) porTitulo.set(k, h);
  }

  const resultado = new Map<string, string>();

  for (const pagina of paginas) {
    const { numero, texto } = separarNumero(pagina.texto);

    let hino: HinoRow | undefined;

    if (numero !== null) {
      const candidato = porNumero.get(numero);
      if (candidato && titulosCompativeis(candidato.title, texto)) {
        hino = candidato;
      }
    }

    if (!hino) {
      hino = porTitulo.get(normalizar(texto));
    }

    // A primeira pagina de cada hino vence. As seguintes sao versao alternativa
    // (o 060 tem duas melodias) ou duplicata com typo -- e nenhuma delas e
    // melhor que a primeira, que e a mais acessada do indice.
    if (hino && !resultado.has(hino.id)) resultado.set(hino.id, pagina.url);
  }

  return resultado;
}

// --------------------------------------------------------------- YouTube

let canalId: string | null = null;

async function resolverCanal(chave: string): Promise<string | null> {
  if (canalId) return canalId;

  const q = encodeURIComponent(CANAL_YOUTUBE);
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${q}&key=${chave}`,
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    items?: { id: { channelId: string }; snippet: { title: string } }[];
  };

  const achado = data.items?.[0];
  if (!achado) return null;

  console.log(`  canal: ${achado.snippet.title} (${achado.id.channelId})`);
  canalId = achado.id.channelId;
  return canalId;
}

/// Procura o hino no canal congregacional, pelo numero e pelo titulo.
async function buscarVideo(
  hino: HinoRow,
  chave: string,
  canal: string,
): Promise<string | null> {
  const q = encodeURIComponent(`${hino.hymnNumber} ${hino.title}`);

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&channelId=${canal}&q=${q}&key=${chave}`,
  );

  const data = (await response.json()) as {
    error?: { errors?: { reason?: string }[] };
    items?: { id: { videoId: string }; snippet: { title: string } }[];
  };

  if (!response.ok) {
    const reason = data.error?.errors?.[0]?.reason ?? 'desconhecido';
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new Error(
        `YouTube: cota do dia esgotada (${reason}). Ela zera a meia-noite do ` +
          `Pacifico; rode de novo amanha com --only=video.`,
      );
    }
    console.log(`    (YouTube ${response.status}/${reason} em ${hino.hymnNumber} — pulando)`);
    return null;
  }

  for (const item of data.items ?? []) {
    const { numero, texto } = separarNumero(item.snippet.title);

    // Dentro do canal certo, numero batendo ja e prova suficiente: o canal so
    // publica Cantor Cristao. Sem numero no titulo do video, exige o nome.
    if (numero === hino.hymnNumber) {
      return `https://www.youtube.com/watch?v=${item.id.videoId}`;
    }
    // Sem numero, o titulo do hino precisa caber INTEIRO no titulo do video.
    if (numero === null && titulosCompativeis(hino.title, texto, 1)) {
      return `https://www.youtube.com/watch?v=${item.id.videoId}`;
    }
  }

  return null;
}

// -------------------------------------------------------------- execucao

async function main(): Promise<void> {
  const teamId = arg('team');
  const dryRun = process.argv.includes('--dry-run');
  const limit = Number(arg('limit') ?? 0);
  const only = arg('only')?.split(',').map((s) => s.trim());
  const quer = (etapa: string) => !only || only.some((o) => etapa.includes(o));

  if (!teamId) {
    throw new Error(
      'Uso: npm run enrich:hymns -- --team=<uuid> [--dry-run] [--limit=N] [--only=cifra,letra,video]',
    );
  }

  const hinos = await prisma.song.findMany({
    where: { teamId, hymnNumber: { not: null }, isArchived: false },
    select: {
      id: true,
      title: true,
      hymnNumber: true,
      chordsUrl: true,
      lyricsUrl: true,
      youtubeUrl: true,
    },
    orderBy: { hymnNumber: 'asc' },
  });

  if (!hinos.length) {
    throw new Error(
      'Nenhum hino nesta equipe. Rode antes: npm run import:hymns -- --team=' +
        teamId,
    );
  }

  console.log(`${hinos.length} hinos no repertorio\n`);
  const linhas = hinos as HinoRow[];

  // ---- cifra
  if (quer('cifra')) {
    const semCifra = linhas.filter((h) => !h.chordsUrl);
    console.log(`=== cifra: ${semCifra.length} hinos sem link ===`);

    const paginas = await baixarIndice();
    console.log(`  indice do CifraClub: ${paginas.length} paginas`);

    const casados = casar(semCifra, paginas);
    let gravados = 0;

    for (const hino of semCifra) {
      const url = casados.get(hino.id);
      if (!url) continue;
      if (limit && gravados >= limit) break;

      console.log(`  ${String(hino.hymnNumber).padStart(3, '0')} ${hino.title}\n    ${url}`);
      if (!dryRun) {
        await prisma.song.update({
          where: { id: hino.id },
          data: { chordsUrl: url },
        });
        hino.chordsUrl = url;
      } else {
        hino.chordsUrl = url;
      }
      gravados++;
    }

    const semNada = semCifra.length - gravados;
    console.log(
      `  -> ${gravados} ${dryRun ? 'seriam preenchidos' : 'preenchidos'}, ` +
        `${semNada} sem pagina no CifraClub`,
    );
  }

  // ---- letra (derivada da cifra, sem requisicao)
  if (quer('letra')) {
    const alvo = linhas.filter(
      (h) => !h.lyricsUrl && h.chordsUrl?.includes('cifraclub.com.br'),
    );
    console.log(`\n=== letra: ${alvo.length} derivadas da cifra (sem requisicao) ===`);

    for (const hino of alvo) {
      const base = hino.chordsUrl!.replace(/\/+$/, '');
      const lyricsUrl = base.endsWith('/letra') ? `${base}/` : `${base}/letra/`;
      if (!dryRun) {
        await prisma.song.update({
          where: { id: hino.id },
          data: { lyricsUrl },
        });
      }
      hino.lyricsUrl = lyricsUrl;
    }

    console.log(`  -> ${alvo.length} ${dryRun ? 'seriam preenchidas' : 'preenchidas'}`);
  }

  // ---- video
  if (quer('video')) {
    const chave = process.env.YOUTUBE_API_KEY;
    const semVideo = linhas.filter((h) => !h.youtubeUrl);

    if (!chave) {
      console.log(
        `\n=== video: pulado, falta YOUTUBE_API_KEY no .env (${semVideo.length} hinos sem video) ===`,
      );
    } else {
      // Cada busca custa 100 unidades de uma cota diaria de 10.000: 100 por dia.
      const teto = limit || 100;
      console.log(
        `\n=== video: ${semVideo.length} hinos sem link, ate ${teto} nesta execucao ===`,
      );

      const canal = await resolverCanal(chave);
      if (!canal) {
        console.log('  nao foi possivel achar o canal — pulando');
      } else {
        let achados = 0;
        let tentados = 0;

        for (const hino of semVideo) {
          if (tentados >= teto) break;
          tentados++;

          try {
            const url = await buscarVideo(hino, chave, canal);
            if (url) {
              console.log(
                `  ${String(hino.hymnNumber).padStart(3, '0')} ${hino.title}\n    ${url}`,
              );
              if (!dryRun) {
                await prisma.song.update({
                  where: { id: hino.id },
                  data: { youtubeUrl: url },
                });
              }
              // Tambem na linha em memoria: e dela que sai o resumo do fim, e
              // sem isto ele relatava o numero de antes da execucao.
              hino.youtubeUrl = url;
              achados++;
            }
          } catch (error) {
            console.error(
              `  ! ${error instanceof Error ? error.message : String(error)}`,
            );
            break;
          }

          // 1,1s e nao 300ms: a API do YouTube tem teto por segundo alem da
          // cota diaria, e a 300ms ela devolveu `429/rateLimitExceeded` em 74
          // de 100 buscas seguidas. As buscas recusadas nao acham nada e o
          // hino volta na proxima execucao -- so que gastando o dia de novo.
          await sleep(1100);
        }

        console.log(
          `  -> ${achados} ${dryRun ? 'seriam preenchidos' : 'preenchidos'} de ${tentados} tentados`,
        );
      }
    }
  }

  // ---- resumo
  const total = linhas.length;
  const comCifra = linhas.filter((h) => h.chordsUrl).length;
  const comLetra = linhas.filter((h) => h.lyricsUrl).length;
  const comVideo = linhas.filter((h) => h.youtubeUrl).length;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  console.log(
    `\n=== ${total} hinos: cifra ${comCifra} (${pct(comCifra)}), ` +
      `letra ${comLetra} (${pct(comLetra)}), video ${comVideo} (${pct(comVideo)}) ===`,
  );

  const semCifra = linhas.filter((h) => !h.chordsUrl).map((h) => h.hymnNumber);
  if (semCifra.length) {
    console.log(
      `hinos sem cifra (${semCifra.length}): ${semCifra.join(', ')}\n` +
        'Nesses o CifraClub nao tem pagina. Cadastre o link a mao na tela da musica.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
