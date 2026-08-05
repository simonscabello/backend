import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AssignmentsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
