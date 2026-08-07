import { Injectable } from '@nestjs/common';
import { normalizeSearch } from '../song-search';

export interface CifraClubResult {
  chordsUrl: string;
  /// A mesma página com `/letra/` no fim mostra só a letra. Verificado em 8
  /// de 8 links reais do acervo -- sai de graça, sem requisição a mais.
  lyricsUrl: string;
  /// Tom da gravação. Sugestão, não decisão: o tom que a equipe canta é dela.
  originalKey: string | null;
  /// Andamento da gravação. Só existe quando alguém transcreveu a batida --
  /// medido em ~27% das páginas.
  bpm: number | null;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/// O CifraClub derruba artigos do slug: "Eu Vejo a Gloria" vira
/// "eu-vejo-gloria", "Trazendo a Arca" vira "trazendo-arca".
const ARTICLES = new Set(['a', 'o', 'as', 'os', 'um', 'uma']);

/// O que o site aceita como tom. Descarta lixo se a página mudar de formato:
/// melhor gravar nada do que gravar um pedaço de HTML.
const KEY_FORMAT = /^[A-G][#b]?m?$/;

function slug(value: string, dropArticles: boolean): string {
  const words = normalizeSearch(value)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(' ')
    .filter(Boolean);

  return (dropArticles ? words.filter((w) => !ARTICLES.has(w)) : words).join('-');
}

/// O Spotify carrega subtítulo entre parênteses ("Consagração (Ao Vivo)",
/// "Oceanos (Onde meus pés podem falhar)") e o CifraClub usa o título curto.
/// Verificado: `consagracao-ao-vivo` dá 404, `consagracao` dá 200.
function withoutParenthetical(title: string): string {
  return title.replace(/\s*[([].*$/, '').trim();
}

export function candidateUrls(title: string, artist: string): string[] {
  const urls = new Set<string>();
  const titles = [title, withoutParenthetical(title)].filter(Boolean);

  // O Set desduplica: título sem parênteses gera as mesmas URLs duas vezes e
  // não custa requisição a mais. Ordem importa -- a primeira que responder
  // 200 encerra a busca.
  for (const variant of titles) {
    for (const dropArtist of [false, true]) {
      for (const dropTitle of [false, true]) {
        const a = slug(artist, dropArtist);
        const t = slug(variant, dropTitle);
        if (a && t) urls.add(`https://www.cifraclub.com.br/${a}/${t}/`);
      }
    }
  }

  return [...urls];
}

/// **Ancorar no `data-anchor="--chord-tone"`, nunca na classe**: as classes
/// (`ebNp`, `eVroG`) são geradas no build deles e mudam a cada deploy; o
/// atributo é semântico e tende a sobreviver.
///
/// Se um dia parar de achar, é aqui que se olha: abra a página, procure o
/// texto "Tom" no HTML cru e veja em que atributo ele mora agora.
export function keyFromHtml(html: string): string | null {
  const match = html.match(/data-anchor="--chord-tone"[^>]*>([^<]+)</);
  const value = match?.[1]?.trim();
  return value && KEY_FORMAT.test(value) ? value : null;
}

/// O andamento vem de um JSON embutido, uma entrada por seção da batida.
/// Pega o mais frequente: introdução com andamento próprio não arrasta o
/// número da música inteira.
export function bpmFromHtml(html: string): number | null {
  const found = [...html.matchAll(/\\?"bpm\\?":\s*(\d{2,3})/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 40 && n <= 240);

  if (!found.length) return null;

  const contagem = new Map<number, number>();
  for (const n of found) contagem.set(n, (contagem.get(n) ?? 0) + 1);

  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/// Acha a cifra montando a URL e conferindo se a página existe.
///
/// **O 404 é o que torna o palpite seguro**: o CifraClub devolve 404 de
/// verdade para slug inexistente (sem Cloudflare, sem página falsa de "não
/// encontrado"), então só o que responde 200 é gravado. Sem essa checagem
/// seria adivinhação -- medido: 22 acertos e 0 erros nos links reais do
/// acervo, contra 17 do chute cego.
@Injectable()
export class CifraClubClient {
  async find(title: string, artist: string): Promise<CifraClubResult | null> {
    for (const url of candidateUrls(title, artist)) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          redirect: 'follow',
        });
      } catch {
        continue;
      }

      if (!response.ok) continue;

      // A página já veio; ler tom e andamento não custa requisição nova.
      const html = await response.text();

      return {
        chordsUrl: url,
        lyricsUrl: `${url.replace(/\/+$/, '')}/letra/`,
        originalKey: keyFromHtml(html),
        bpm: bpmFromHtml(html),
      };
    }

    return null;
  }
}
