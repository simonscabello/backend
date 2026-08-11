/**
 * Coletaneas do CifraClub: as paginas que agrupam o que nao tem artista.
 *
 * Usado por `enrich-songs.ts` (achar cifra para o que ja esta no acervo) e por
 * `import-collection.ts` (trazer o que falta). Mora aqui, e nao dentro de um
 * deles, porque duas copias divergiriam na primeira correcao -- e as correcoes
 * aqui foram caras: cada guarda abaixo nasceu de um falso positivo real.
 */
import { normalizeSearch } from '../src/modules/songs/song-search';

/// As coletaneas que valem para este acervo.
export const COLECOES = ['corinhos-evangelicos', 'harpa-crista'] as const;

/// Como cada coletanea assina a musica no repertorio.
export const ARTISTA_DA_COLECAO: Record<string, string> = {
  'corinhos-evangelicos': 'Corinhos Evangélicos',
  'harpa-crista': 'Harpa Cristã',
};

export interface ItemDaColecao {
  url: string;
  /// Como o indice escreve, para o relatorio.
  titulo: string;
  /// Sem o numero do hino no fim, para comparar.
  comparavel: string;
  colecao: string;
}

/// Palavras que valem comparacao: as de tres letras para cima.
///
/// O corte era em quatro e estava errado. "Rei", "paz", "ceu", "luz" carregam o
/// sentido do titulo, e sem elas "Jesus E o REI da Gloria" virava {jesus,
/// gloria} e casava 100% com "Gloria ao Meu Jesus" -- musica diferente. Ficam
/// de fora so artigo e preposicao ("a", "o", "de", "em"), que aparecem em tudo.
export const palavrasDe = (valor: string): Set<string> =>
  new Set(
    normalizeSearch(valor)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 3),
  );

/// Jaccard: comuns sobre o total de palavras distintas.
///
/// Nao e sobreposicao simples (como em `enrich-hymns.ts`): la o NUMERO do hino
/// ja tinha identificado a musica e o titulo so fazia a guarda. Aqui o titulo e
/// a unica prova, e sobreposicao simples aceitaria "Cantai" dentro de "Cantai
/// ao Senhor com Alegria" -- que pode ser outra musica. Jaccard pune a
/// diferenca de tamanho, que e exatamente o risco.
///
/// **Titulo de uma palavra so nao pontua.** Com as palavras curtas descartadas,
/// "Com Jesus" vira {jesus} e casa 100% com "Jesus"; "AQUELE" vira {aquele} e
/// casa 100% com "Aquele Que Foi". Os dois aconteceram na medicao e os dois
/// estavam errados. Quando sobra uma palavra de cada lado, so a igualdade
/// literal do titulo inteiro vale.
export function semelhanca(a: string, b: string): number {
  const pa = palavrasDe(a);
  const pb = palavrasDe(b);
  if (pa.size < 2 || pb.size < 2) return 0;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;

  return comuns / (pa.size + pb.size - comuns);
}

/// As mesmas palavras, na ordem trocada.
///
/// "Espirito Santo" e "Santo Espirito" sao musicas diferentes, e para qualquer
/// medida por conjunto elas sao identicas. Nao da para decidir por titulo --
/// entao nao se decide.
///
/// Compara a SEQUENCIA, e nao o conjunto. "Alfa, Omega" e "Alfa e Omega" tem o
/// mesmo conjunto e a mesma ordem -- mudou a virgula, e virgula nao troca
/// musica. So a ordem diferente e suspeita.
export function mesmasPalavrasOutraOrdem(a: string, b: string): boolean {
  const sequencia = (valor: string) =>
    normalizeSearch(valor)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 3);

  const sa = sequencia(a);
  const sb = sequencia(b);
  if (sa.length < 2 || sa.length !== sb.length) return false;
  if (sa.join(' ') === sb.join(' ')) return false;

  return [...sa].sort().join(' ') === [...sb].sort().join(' ');
}

/// A coletanea que o artista da musica indica, quando indica alguma.
///
/// Serve para desempatar: "A Mensagem da Cruz" existe no corinhos E na Harpa, e
/// sem isto vence a que aparecer primeiro no indice -- sorteio, nao decisao. Se
/// o acervo diz "Harpa Crista", a pagina da Harpa e a certa.
export function colecaoDoArtista(artist: string | null): string | null {
  const a = normalizeSearch(artist ?? '');
  if (/harpa crist/.test(a)) return 'harpa-crista';
  if (/corinho/.test(a)) return 'corinhos-evangelicos';
  return null;
}

/// Baixa o indice de uma coletanea inteira: uma requisicao, centenas de paginas.
export async function baixarColecao(slug: string): Promise<ItemDaColecao[]> {
  const response = await fetch(
    `https://www.cifraclub.com.br/${slug}/musicas.html`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    },
  );

  if (!response.ok) {
    console.log(`    (${slug} respondeu ${response.status} — pulando)`);
    return [];
  }

  const html = await response.text();
  const paginas = new Map<string, string>();

  // O CifraClub e Next.js: a lista vem no payload do React Server Components,
  // com as aspas escapadas -- nao em `<a href>`. O regex e literal de
  // proposito: montado por concatenacao de string, o escape sai errado e o
  // resultado e zero pagina em silencio (aconteceu).
  for (const m of html.matchAll(
    /\\"primaryLabel\\":\\"((?:[^\\"]|\\.){1,120}?)\\"[\s\S]{0,200}?\\"href\\":\\"(\/[a-z0-9-]+\/[^\\"]+)\\"/g,
  )) {
    if (!m[2].startsWith(`/${slug}/`)) continue;
    const titulo = m[1].replace(/\\\\"/g, '"').replace(/\\"/g, '"').trim();
    const url = `https://www.cifraclub.com.br${m[2]}`;
    if (!paginas.has(url)) paginas.set(url, titulo);
  }

  return [...paginas.entries()].map(([url, titulo]) => ({
    url,
    titulo,
    // A Harpa poe o numero do hino no fim de todos os 624 titulos ("A Mensagem
    // da Cruz - 291"). Ele e enfeite do indice, nao parte do nome: deixado
    // dentro, empurra a semelhanca para baixo do corte e a musica escapa para
    // a coletanea errada.
    comparavel: titulo.replace(/\s*[-–—]\s*\d{1,3}\s*$/, '').trim(),
    colecao: slug,
  }));
}

/// No CifraClub, a mesma pagina com `/letra/` no fim mostra so a letra. Sai de
/// graca, sem requisicao -- verificado em 8 de 8 links reais do acervo.
export function urlDaLetra(chordsUrl: string): string {
  const base = chordsUrl.replace(/\/+$/, '');
  return base.endsWith('/letra') ? `${base}/` : `${base}/letra/`;
}
