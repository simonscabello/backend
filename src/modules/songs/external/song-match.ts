import { normalizeSearch } from '../song-search';

export interface ExternalCandidate {
  title: string;
  /// Como o servico escreve o artista. Pode trazer varios juntos.
  artist: string;
}

/// Conectivos: sao o que faz "Comunidade Vila" nao bater com "Comunidade da
/// Vila", e nao distinguem artista nenhum.
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the', 'of']);

function significantWords(value: string): string[] {
  return normalizeSearch(value)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/// Todas as palavras do nome mais curto precisam aparecer no mais longo.
///
/// Comparar por "um contem o outro" quebrava no mundo real: o cadastro da
/// igreja tem "Comunidade Vila" e o Spotify tem "Comunidade da Vila"; uma
/// palavra de diferenca descartava a musica. Palavra a palavra resolve sem
/// abrir mao da exigencia -- continua sendo subconjunto exato, nao
/// semelhanca aproximada, entao "Aline Barros" nunca casa com "Fernandinho".
export function artistMatches(ours: string, theirs: string): boolean {
  const mine = significantWords(ours);
  const yours = significantWords(theirs);

  if (!mine.length || !yours.length) return false;

  const [shorter, longer] =
    mine.length <= yours.length ? [mine, yours] : [yours, mine];

  return shorter.every((word) => longer.includes(word));
}

/// Casamento forte entre uma musica nossa e um resultado de servico externo.
/// Musica sem artista nunca casa: buscar so pelo titulo traz a versao de
/// outro artista, e link errado e pior do que campo vazio -- o musico
/// descobre no ensaio.
export function matches(
  song: { title: string; artist: string | null },
  candidate: ExternalCandidate,
): boolean {
  if (!song.artist) return false;

  const title = normalizeSearch(song.title);
  const foundTitle = normalizeSearch(candidate.title);
  const titleOk = foundTitle.includes(title) || title.includes(foundTitle);

  return titleOk && artistMatches(song.artist, candidate.artist);
}
