import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { EventSongsController } from './event-songs.controller';
import { EventSongsService } from './event-songs.service';
import { ExternalSearchService } from './external/external-search.service';
import { SpotifyClient } from './external/spotify.client';
import { CifraClubClient } from './external/cifraclub.client';

@Module({
  // O repertório da escala responde com a escala completa depois de salvar,
  // e quem sabe montá-la é o AssignmentsService.
  imports: [AssignmentsModule],
  controllers: [SongsController, EventSongsController],
  providers: [
    SongsService,
    EventSongsService,
    ExternalSearchService,
    SpotifyClient,
    CifraClubClient,
  ],
})
export class SongsModule {}
