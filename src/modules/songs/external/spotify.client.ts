import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../../config/env';

export interface SpotifyTrack {
  title: string;
  /// Todos os artistas juntos -- e o que o casamento compara.
  artist: string;
  /// So o principal, com a grafia do Spotify ("Rebanhão", com til).
  primaryArtist: string;
  url: string;
  album: string | null;
  year: string | null;
}

/// Busca no Spotify. **Só a busca** -- o `audio-features`, que dava tom e
/// energia, foi descontinuado em 27/11/2024 e devolve 403 para aplicativos
/// novos. Tom e andamento vêm do CifraClub.
@Injectable()
export class SpotifyClient {
  private readonly logger = new Logger(SpotifyClient.name);
  private token: { value: string; expiresAt: number } | null = null;

  get configured(): boolean {
    return Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);
  }

  async search(query: string, limit = 8): Promise<SpotifyTrack[]> {
    if (!this.configured || !query.trim()) return [];

    const token = await this.authenticate();
    if (!token) return [];

    const url =
      'https://api.spotify.com/v1/search' +
      `?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      this.logger.warn(`Spotify respondeu ${response.status} na busca.`);
      return [];
    }

    const data = (await response.json()) as {
      tracks?: {
        items?: {
          name: string;
          external_urls: { spotify: string };
          artists: { name: string }[];
          album?: { name?: string; release_date?: string };
        }[];
      };
    };

    return (data.tracks?.items ?? []).map((item) => ({
      title: item.name,
      artist: item.artists.map((a) => a.name).join(' '),
      primaryArtist: item.artists[0]?.name ?? '',
      url: item.external_urls.spotify,
      album: item.album?.name ?? null,
      year: item.album?.release_date?.slice(0, 4) ?? null,
    }));
  }

  /// Client credentials: sem usuário, só a aplicação. O token dura uma hora;
  /// guardar evita uma ida a mais a cada busca.
  private async authenticate(): Promise<string | null> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }

    const credentials = Buffer.from(
      `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`,
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
      this.logger.error(
        `Spotify recusou as credenciais (${response.status}). Confira SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET.`,
      );
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.token = {
      value: data.access_token,
      // Um minuto de folga para não usar um token que expira no caminho.
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return this.token.value;
  }
}
