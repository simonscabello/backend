import { Module } from '@nestjs/common';
import { UnavailabilitiesController } from './unavailabilities.controller';
import { UnavailabilitiesService } from './unavailabilities.service';

@Module({
  controllers: [UnavailabilitiesController],
  providers: [UnavailabilitiesService],
  exports: [UnavailabilitiesService],
})
export class UnavailabilitiesModule {}
