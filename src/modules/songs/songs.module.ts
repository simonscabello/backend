import { Module } from '@nestjs/common';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { ExternalSearchService } from './external/external-search.service';
import { SpotifyClient } from './external/spotify.client';
import { CifraClubClient } from './external/cifraclub.client';

@Module({
  controllers: [SongsController],
  providers: [
    SongsService,
    ExternalSearchService,
    SpotifyClient,
    CifraClubClient,
  ],
})
export class SongsModule {}
