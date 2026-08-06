import { Module } from '@nestjs/common';
import { UnavailabilitiesModule } from '../unavailabilities/unavailabilities.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [UnavailabilitiesModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
