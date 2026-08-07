/// Texto comparavel: minusculas, sem acento e sem espaco sobrando.
///
/// Existe porque ninguem digita acento no celular. Sem isto, procurar
/// "coracao" nao acharia "Coração" -- e "Coração" e como o titulo esta
/// gravado. A alternativa seria a extensao `unaccent` do Postgres, que
/// obriga a busca a sair do Prisma e virar SQL cru; para um repertorio de
/// algumas centenas de musicas, a coluna normalizada resolve igual.
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    // NFD separa a letra do acento; U+0300..U+036F sao os acentos soltos.
    // Escapados de proposito: o caractere literal e invisivel no editor e
    // nao sobrevive a uma copia descuidada entre shells do Windows.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/// O que a busca de uma musica compara: titulo, artista e compositor juntos.
export function buildSearchText(song: {
  title: string;
  artist?: string | null;
  composer?: string | null;
}): string {
  return normalizeSearch(
    [song.title, song.artist, song.composer].filter(Boolean).join(' '),
  );
}
