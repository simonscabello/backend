import { Injectable } from '@nestjs/common';
import { SpotifyClient } from './spotify.client';
import { CifraClubClient } from './cifraclub.client';

export interface ExternalSearchResult {
  title: string;
  artist: string;
  spotifyUrl: string;
  album: string | null;
  year: string | null;
}

/// Busca a música nos serviços externos, para a tela de cadastro.
///
/// **Dividida em duas etapas de propósito.** A busca é uma chamada só e
/// responde rápido, porque a pessoa está esperando com o teclado na mão. A
/// resolução da cifra custa até quatro requisições ao CifraClub e só acontece
/// para a música que ela escolheu -- fazer isso para os oito resultados
/// deixaria a busca inutilizável.
@Injectable()
export class ExternalSearchService {
  constructor(
    private readonly spotify: SpotifyClient,
    private readonly cifraclub: CifraClubClient,
  ) {}

  get spotifyConfigured(): boolean {
    return this.spotify.configured;
  }

  async search(query: string): Promise<ExternalSearchResult[]> {
    const tracks = await this.spotify.search(query);

    return tracks.map((track) => ({
      title: track.title,
      artist: track.primaryArtist,
      spotifyUrl: track.url,
      album: track.album,
      year: track.year,
    }));
  }

  /// Completa o que dá para completar a partir de título e artista.
  ///
  /// Nunca devolve `defaultKey` nem `pace`: aqueles são a decisão da equipe
  /// -- em que tom ELA canta, como ELA sente a música. O que vem daqui é o
  /// que o artista gravou.
  /// Quem garante que a página é desta música é o próprio 404: o slug encoda
  /// título e artista, e o CifraClub responde 404 para o que não existe.
  async resolve(title: string, artist: string) {
    return this.cifraclub.find(title, artist);
  }
}
