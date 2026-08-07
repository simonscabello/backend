/**
 * Completa os links das musicas que estao sem eles, buscando nas APIs
 * publicas de cada servico.
 *
 *   docker compose exec api npm run enrich:songs -- --team=<uuid> [--dry-run] [--limit=20] [--only=spotify]
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE SCRIPT NAO FAZ: LETRA
 * ---------------------------------------------------------------------------
 * Nao precisa. 285 das 286 musicas ja tem a LETRA COMPLETA no banco, vinda do
 * backup do Holyrics, e nenhuma esta sem letra e sem link ao mesmo tempo. Um
 * link para site de letra e pior do que o texto que ja temos: depende de rede
 * e do site continuar no ar.
 *
 * (A API do Vagalume, que faria isso, responde 503 em qualquer caminho desde
 * 08/2026 -- o site www continua no ar, a api.vagalume.com.br nao. Foi
 * verificado, nao suponha que voltou sem testar.)
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE SCRIPT NAO FAZ: CIFRA
 * ---------------------------------------------------------------------------
 * O CifraClub nao tem API publica, e montar a URL pelo padrao
 * `cifraclub.com.br/<artista>/<musica>/` foi medido contra os 50 links reais
 * que vieram do Holyrics: 23 nem podiam ser tentados (musica sem artista) e,
 * dos 27 restantes, o padrao acertou 17. Os erros sao editoriais, nao de
 * normalizacao -- o site derruba artigos ("eu-vejo-gloria", "trazendo-arca"),
 * as vezes acrescenta um hash ("/sgpwmwj.html") e reescreve o artista
 * ("401 HCC" -> "harpa-crista"). Um acerto de 34% sem como saber quais 34%
 * gravaria cifra errada em silencio, que e pior do que campo vazio: o musico
 * descobre no ensaio. Cifra continua manual.
 *
 * ---------------------------------------------------------------------------
 * CREDENCIAIS
 * ---------------------------------------------------------------------------
 * Cada provedor so roda se a variavel dele existir; os outros seguem. Ponha
 * no `backend/.env` (que nao e versionado) -- nunca no codigo:
 *
 *   SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
 *       developer.spotify.com/dashboard -> Create app. So a busca e usada; o
 *       audio-features (tom, energia) foi descontinuado em 27/11/2024 e
 *       devolve 403 para aplicativos novos.
 *   YOUTUBE_API_KEY
 *       console.cloud.google.com -> YouTube Data API v3. A cota padrao e de
 *       10.000 unidades/dia e cada busca custa 100: da 100 musicas por dia.
 *       O script para sozinho ao chegar no limite (--limit ajusta).
 *
 * ---------------------------------------------------------------------------
 * O CRITERIO DE GRAVACAO
 * ---------------------------------------------------------------------------
 * So grava com casamento forte: titulo E artista batendo, comparados sem
 * acento e sem maiuscula. Musica sem artista cadastrado NAO e enriquecida --
 * 109 do acervo estao nessa situacao, e buscar so pelo titulo traz a versao
 * de outro artista. Link errado e pior que campo vazio.
 *
 * Nunca sobrescreve link existente e nunca toca em tom, andamento ou
 * hino/cantico. Rode com --dry-run primeiro: ele mostra o que faria.
 */
import { PrismaClient } from '@prisma/client';
import { buildSearchText } from '../src/modules/songs/song-search';
import { matches } from '../src/modules/songs/external/song-match';
import {
  bpmFromHtml,
  candidateUrls,
  keyFromHtml,
} from '../src/modules/songs/external/cifraclub.client';

const prisma = new PrismaClient();

type LinkField = 'spotifyUrl' | 'youtubeUrl' | 'chordsUrl';

interface SongRow {
  id: string;
  title: string;
  artist: string | null;
}

interface Candidate {
  url: string;
  title: string;
  /// Como o servico escreve o artista. Pode vir com varios juntos -- e o que
  /// o casamento compara.
  artist: string;
  /// Só o artista principal, com a grafia do servico. E o que vale gravar
  /// quando estamos recuperando o artista de uma musica: "Rebanhão" com til
  /// e melhor do que o "Rebanhao" que sai do endereco.
  primaryArtist?: string;
}

interface Provider {
  name: string;
  field: LinkField;
  /// Quanto esperar entre chamadas, em ms.
  delay: number;
  /// Teto de chamadas por execucao (cota diaria), 0 = sem teto.
  dailyCap: number;
  configured: boolean;
  missing: string;
  find(song: SongRow): Promise<Candidate | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/// Casamento forte: o titulo do candidato precisa conter o nosso titulo e o
/// artista precisa bater. "Consagracao" x "Consagração (Ao Vivo)" passa;
/// "Consagracao" do artista errado, nao.
/// O casamento titulo+artista, as URLs candidatas do CifraClub e a leitura de
/// tom e andamento moram em `src/modules/songs/external/`: a API usa os mesmos
/// na tela de cadastro, e duas copias divergiriam na primeira correcao. Este
/// script importa de la -- nao o contrario.

// ---------------------------------------------------------------- Spotify

let spotifyToken: string | null = null;

async function spotifyAuth(): Promise<string> {
  if (spotifyToken) return spotifyToken;

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(
      `Spotify recusou as credenciais (${response.status}). Confira SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET.`,
    );
  }

  const data = (await response.json()) as { access_token: string };
  spotifyToken = data.access_token;
  return spotifyToken;
}

const spotify: Provider = {
  name: 'spotify',
  field: 'spotifyUrl',
  delay: 200,
  dailyCap: 0,
  configured: Boolean(
    process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET,
  ),
  missing: 'SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET',
  async find(song) {
    const token = await spotifyAuth();
    const q = encodeURIComponent(`track:${song.title} artist:${song.artist}`);

    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      tracks?: {
        items?: {
          name: string;
          external_urls: { spotify: string };
          artists: { name: string }[];
        }[];
      };
    };

    const items = data.tracks?.items ?? [];
    for (const item of items) {
      const candidate: Candidate = {
        url: item.external_urls.spotify,
        title: item.name,
        artist: item.artists.map((a) => a.name).join(' '),
        primaryArtist: item.artists[0]?.name,
      };
      if (matches(song, candidate)) return candidate;
    }

    return null;
  },
};

// ---------------------------------------------------------------- YouTube

const youtube: Provider = {
  name: 'youtube',
  field: 'youtubeUrl',
  delay: 300,
  // 10.000 unidades/dia e 100 por busca.
  dailyCap: 100,
  configured: Boolean(process.env.YOUTUBE_API_KEY),
  missing: 'YOUTUBE_API_KEY',
  async find(song) {
    const q = encodeURIComponent(`${song.title} ${song.artist}`);

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${q}&key=${process.env.YOUTUBE_API_KEY}`,
    );

    const data = (await response.json()) as {
      error?: { errors?: { reason?: string }[]; message?: string };
      items?: {
        id: { videoId: string };
        snippet: { title: string; channelTitle: string };
      }[];
    };

    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason ?? 'desconhecido';

      // So a cota derruba o provedor: insistir depois dela e queimar 100
      // unidades por tentativa a toa. Os outros 403 sao passageiros -- chave
      // recem-criada no Google Cloud leva alguns minutos para propagar e
      // responde `accessNotConfigured` nesse meio-tempo. Nesses, pula a
      // musica e segue; quem parar a execucao inteira no primeiro tropeco
      // obriga a comecar tudo de novo.
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        throw new Error(
          `YouTube: cota do dia esgotada (${reason}). Ela zera à meia-noite do Pacífico; rode de novo amanhã.`,
        );
      }

      console.log(
        `    (YouTube ${response.status}/${reason} em "${song.title}" — pulando)`,
      );
      return null;
    }

    for (const item of data.items ?? []) {
      const candidate: Candidate = {
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        title: item.snippet.title,
        // O titulo do video costuma trazer o artista ("Aline Barros -
        // Consagracao"); o canal cobre o resto.
        artist: `${item.snippet.channelTitle} ${item.snippet.title}`,
      };
      if (matches(song, candidate)) return candidate;
    }

    return null;
  },
};

// -------------------------------------------------------------- CifraClub

const cifraclub: Provider = {
  name: 'cifraclub',
  field: 'chordsUrl',
  // Mais devagar que os outros: sao varias tentativas por musica e o site nao
  // tem API -- nao ha motivo para bater rapido em servidor de terceiro.
  delay: 700,
  dailyCap: 0,
  configured: true,
  missing: '',
  async find(song) {
    for (const url of candidateUrls(song.title, song.artist ?? '')) {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });

      // O 200 e a prova: nao existe casamento por texto aqui, existe a pagina
      // existindo ou nao. Slug errado da 404 -- foi verificado.
      if (response.ok) {
        return { url, title: song.title, artist: song.artist ?? '' };
      }

      await sleep(250);
    }

    return null;
  },
};

// ------------------------------------------- recuperacao do artista faltante

/// Cada site guarda o artista num lugar diferente do endereco. Só entram os
/// que sao previsiveis: onde o caminho pode trazer album ou categoria
/// ("album-noite-santa", "corinhos-evangelicos"), nao ha palpite -- e melhor
/// devolver nada do que sugerir "Album Noite Santa" como artista.
function artistFromUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.host.toLowerCase();
  const path = url.pathname.split('/').filter(Boolean);

  const asName = (slugValue: string | undefined): string | null => {
    if (!slugValue) return null;
    const words = slugValue.split('-').filter(Boolean);
    if (!words.length) return null;
    return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  };

  // artista no subdominio: fernandinho.lyrics.com.br
  if (host.endsWith('lyrics.com.br')) {
    const sub = host.replace('.lyrics.com.br', '');
    return sub && sub !== 'www' ? asName(sub) : null;
  }

  // primeiro trecho do caminho: vagalume.com.br/rebanhao/alfa-e-omega.html
  if (
    host.includes('vagalume') ||
    host.includes('letras.mus.br') ||
    host.includes('cifraclub')
  ) {
    return asName(path[0]);
  }

  // depois da pasta da letra inicial: letrasdemusica.com.br/a/alexandre-magnani/...
  if (host.includes('letrasdemusica') || host.includes('minhasletras')) {
    return asName(path[1]);
  }

  return null;
}

/// Preenche o artista de quem esta sem, a partir do endereco que a musica ja
/// carrega -- e só depois de confirmar que a musica existe com aquele artista.
///
/// O endereco e um palpite barato (nenhuma requisicao), a confirmacao e o que
/// manda: ou o Spotify acha a musica com aquele artista, ou a pagina do
/// CifraClub existe. Sem confirmacao, nada e gravado. E o mesmo criterio dos
/// links: palpite livre, gravacao so com prova.
///
/// Roda antes dos provedores de link de proposito: artista preenchido aqui
/// vira musica enriquecivel logo em seguida, na mesma execucao.
async function recoverArtists(
  teamId: string,
  dryRun: boolean,
  limit: number,
): Promise<void> {
  const songs = await prisma.song.findMany({
    where: {
      teamId,
      isArchived: false,
      artist: null,
      OR: [{ lyricsUrl: { not: null } }, { chordsUrl: { not: null } }],
    },
    select: {
      id: true,
      title: true,
      lyricsUrl: true,
      chordsUrl: true,
      spotifyUrl: true,
    },
    orderBy: { searchText: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`\n=== artista: ${songs.length} músicas sem artista e com link ===`);

  let confirmados = 0;
  let semPalpite = 0;
  let naoConfirmados = 0;

  for (const song of songs) {
    const guess = artistFromUrl(song.lyricsUrl ?? song.chordsUrl ?? '');

    if (!guess) {
      semPalpite++;
      continue;
    }

    const probe: SongRow = { id: song.id, title: song.title, artist: guess };
    let artist: string | null = null;
    let via = '';
    const extra: { spotifyUrl?: string; chordsUrl?: string } = {};

    if (spotify.configured) {
      const found = await spotify.find(probe);
      if (found) {
        // A grafia do Spotify e melhor que a do slug: vem com acento.
        artist = found.primaryArtist ?? guess;
        via = 'spotify';
        if (!song.spotifyUrl) extra.spotifyUrl = found.url;
      }
      await sleep(spotify.delay);
    }

    if (!artist) {
      const found = await cifraclub.find(probe);
      if (found) {
        artist = guess;
        via = 'cifraclub';
        if (!song.chordsUrl) extra.chordsUrl = found.url;
      }
      await sleep(cifraclub.delay);
    }

    if (!artist) {
      naoConfirmados++;
      console.log(`  ?  ${song.title} — "${guess}" não confirmado, deixando vazio`);
      continue;
    }

    console.log(`  ok ${song.title} — ${artist}  (confirmado por ${via})`);

    if (!dryRun) {
      await prisma.song.update({
        where: { id: song.id },
        data: {
          artist,
          ...extra,
          // searchText inclui o artista; sem refazer, procurar pelo nome do
          // artista nao acharia a musica que acabamos de completar.
          searchText: buildSearchText({ title: song.title, artist }),
        },
      });
    }
    confirmados++;
  }

  console.log(
    `  -> ${confirmados} ${dryRun ? 'seriam preenchidos' : 'preenchidos'}, ` +
      `${naoConfirmados} não confirmados, ${semPalpite} sem palpite no endereço`,
  );
}

// ------------------------------------------------ tom original da gravacao

/// Le tom e andamento da pagina do CifraClub, numa visita so.
///
/// Nao escreve em `defaultKey` nem em `pace` de proposito: aqueles campos sao
/// a decisao da equipe (em que tom ELA canta, como ELA sente a musica). Estes
/// dois sao o que o artista gravou, e servem de ponto de partida na tela --
/// um sugere, o outro decide.
async function recoverFromCifraClub(
  teamId: string,
  dryRun: boolean,
  limit: number,
): Promise<void> {
  const songs = await prisma.song.findMany({
    where: {
      teamId,
      isArchived: false,
      chordsUrl: { contains: 'cifraclub' },
      // Uma visita por musica: quem ja tem os dois nao e buscado de novo.
      OR: [{ originalKey: null }, { bpm: null }],
    },
    select: {
      id: true,
      title: true,
      chordsUrl: true,
      originalKey: true,
      bpm: true,
    },
    orderBy: { searchText: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`\n=== cifraclub (tom + bpm): ${songs.length} músicas ===`);

  let comTom = 0;
  let comBpm = 0;
  let vazias = 0;

  for (const song of songs) {
    try {
      const response = await fetch(song.chordsUrl!, {
        headers: {
          // Sem User-Agent de navegador a pagina vem diferente.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        },
      });

      if (!response.ok) {
        vazias++;
        await sleep(1000);
        continue;
      }

      const html = await response.text();
      const key = song.originalKey ?? keyFromHtml(html);
      const bpm = song.bpm ?? bpmFromHtml(html);

      const data: { originalKey?: string; bpm?: number } = {};
      if (!song.originalKey && key) data.originalKey = key;
      if (!song.bpm && bpm) data.bpm = bpm;

      if (!Object.keys(data).length) {
        vazias++;
      } else {
        // Só o que está sendo gravado agora: imprimir o valor que já estava
        // no banco faz o relatório parecer que fez mais do que fez.
        const novo = [
          data.originalKey ? `tom ${data.originalKey}` : null,
          data.bpm ? `${data.bpm} bpm` : null,
        ]
          .filter(Boolean)
          .join(', ');
        console.log(`  ${novo.padEnd(18)} ${song.title}`);
        if (!dryRun) {
          await prisma.song.update({ where: { id: song.id }, data });
        }
        if (data.originalKey) comTom++;
        if (data.bpm) comBpm++;
      }
    } catch {
      vazias++;
    }

    // A pagina inteira sao ~550 KB. Devagar.
    await sleep(1000);
  }

  console.log(
    `  -> tom: ${comTom}, bpm: ${comBpm}, ` +
      `${vazias} sem nada novo${dryRun ? ' (simulação)' : ''}`,
  );
}

// ------------------------------------------------------- link da letra

/// No CifraClub, a mesma pagina com `/letra/` no fim mostra so a letra. Como
/// a URL da cifra ja foi confirmada por 200, o link da letra sai de graca --
/// sem requisicao nenhuma. Verificado em 8 de 8 links reais do acervo.
///
/// Roda depois dos provedores, para pegar tambem as cifras achadas agora.
async function deriveLyricsUrls(teamId: string, dryRun: boolean): Promise<void> {
  const songs = await prisma.song.findMany({
    where: {
      teamId,
      isArchived: false,
      lyricsUrl: null,
      chordsUrl: { contains: 'cifraclub.com.br' },
    },
    select: { id: true, chordsUrl: true },
  });

  if (!songs.length) return;

  console.log(`\n=== link da letra: ${songs.length} derivados da cifra ===`);

  for (const song of songs) {
    const base = song.chordsUrl!.replace(/\/+$/, '');
    // Se a URL ja for a pagina de letra, nao duplica o sufixo.
    const lyricsUrl = base.endsWith('/letra') ? `${base}/` : `${base}/letra/`;

    if (!dryRun) {
      await prisma.song.update({ where: { id: song.id }, data: { lyricsUrl } });
    }
  }

  console.log(
    `  -> ${songs.length} ${dryRun ? 'seriam preenchidos' : 'preenchidos'} (sem requisição)`,
  );
}

// ---------------------------------------------------------------- execucao

async function main(): Promise<void> {
  const teamId = arg('team');
  const dryRun = process.argv.includes('--dry-run');
  const limit = Number(arg('limit') ?? 0);
  const offset = Number(arg('offset') ?? 0);
  const only = arg('only')?.split(',').map((s) => s.trim());

  if (!teamId) {
    throw new Error(
      'Uso: npm run enrich:songs -- --team=<uuid> [--dry-run] [--limit=N] [--only=artista,spotify,youtube,cifraclub]',
    );
  }

  // Antes dos links: artista preenchido aqui vira musica enriquecivel pelos
  // provedores logo abaixo, na mesma execucao.
  if (!only || only.some((o) => 'artista'.includes(o))) {
    await recoverArtists(teamId, dryRun, limit);
  }

  // Depois dos artistas e antes dos links: o provedor de cifra abaixo pode
  // descobrir chordsUrl novas, e essas so terao o tom lido na proxima
  // execucao -- e o suficiente, e evita duas passadas na mesma pagina.
  if (!only || only.some((o) => 'tom'.includes(o) || 'bpm'.includes(o))) {
    await recoverFromCifraClub(teamId, dryRun, limit);
  }

  const all: Provider[] = [spotify, youtube, cifraclub];
  const chosen = only
    ? all.filter((p) => only.some((o) => p.name.includes(o)))
    : all;

  const active = chosen.filter((p) => p.configured);
  const inactive = chosen.filter((p) => !p.configured);

  for (const p of inactive) {
    console.log(`- ${p.name}: pulado, falta ${p.missing} no .env`);
  }

  if (!active.length && inactive.length) {
    console.log('\nNenhum provedor de link configurado.');
  }

  for (const provider of active) {
    const cap = limit || provider.dailyCap || 0;

    const songs = await prisma.song.findMany({
      where: {
        teamId,
        isArchived: false,
        [provider.field]: null,
        // Sem artista o casamento nao tem como ser confiavel.
        artist: { not: null },
      },
      select: { id: true, title: true, artist: true },
      orderBy: { searchText: 'asc' },
      ...(cap ? { take: cap } : {}),
      // Quem falha continua na consulta -- musica que nao esta no YouTube nao
      // vai passar a estar. Sem pular, a execucao de amanha gastaria a cota
      // repetindo as falhas de hoje antes de chegar nas que faltam.
      ...(offset ? { skip: offset } : {}),
    });

    console.log(`\n=== ${provider.name}: ${songs.length} musicas sem o link ===`);

    let filled = 0;
    let missed = 0;

    for (const song of songs) {
      try {
        const found = await provider.find(song);

        if (!found) {
          missed++;
          continue;
        }

        console.log(`  ${song.title} — ${song.artist}\n    ${found.url}`);

        if (!dryRun) {
          await prisma.song.update({
            where: { id: song.id },
            data: { [provider.field]: found.url },
          });
        }
        filled++;
      } catch (error) {
        // Erro de credencial ou cota derruba o provedor inteiro, nao o script:
        // os outros ainda tem trabalho a fazer.
        console.error(
          `  ! ${provider.name} parou: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }

      await sleep(provider.delay);
    }

    console.log(
      `  -> ${filled} ${dryRun ? 'seriam preenchidos' : 'preenchidos'}, ${missed} sem casamento confiavel`,
    );
  }

  // Por ultimo: aproveita tambem as cifras que os provedores acabaram de
  // achar nesta mesma execucao. Nao depende de provedor nenhum -- e so
  // string, sem rede -- entao roda mesmo sem chave configurada.
  if (!only || only.some((o) => 'letra'.includes(o))) {
    await deriveLyricsUrls(teamId, dryRun);
  }

  const restantes = await prisma.song.count({
    where: { teamId, isArchived: false, artist: null },
  });
  if (restantes) {
    console.log(
      `\n${restantes} musicas sem artista nao foram tentadas (buscar so pelo titulo traz a versao errada). Preencha o artista e rode de novo.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
