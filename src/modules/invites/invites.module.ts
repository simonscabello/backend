import { Module } from '@nestjs/common';
import {
  InvitesController,
  TeamInvitesController,
} from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  controllers: [TeamInvitesController, InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
