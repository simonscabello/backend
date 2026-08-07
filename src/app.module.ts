import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PositionsModule } from './modules/positions/positions.module';
import { ServiceTemplatesModule } from './modules/service-templates/service-templates.module';
import { InvitesModule } from './modules/invites/invites.module';
import { UnavailabilitiesModule } from './modules/unavailabilities/unavailabilities.module';
import { EventsModule } from './modules/events/events.module';
import { SongsModule } from './modules/songs/songs.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    MembershipsModule,
    PositionsModule,
    ServiceTemplatesModule,
    InvitesModule,
    EventsModule,
    SongsModule,
    AssignmentsModule,
    UnavailabilitiesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Autenticacao obrigatoria por padrao: rotas abertas precisam de @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
