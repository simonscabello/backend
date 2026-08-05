# Review package — Task 3

## Stat
 events.controller.ts | created
 events.module.ts | created
 app.module.ts | modified

## events.controller.ts
```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Membership } from '@prisma/client';
import {
  CurrentMembership,
  TeamRoles,
} from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { EventsService } from './events.service';
import {
  CreateEventDto,
  ListEventsQueryDto,
  UpdateEventDto,
} from './dto/event.dto';

@Controller()
@UseGuards(TeamMemberGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @TeamRoles('OWNER', 'LEADER')
  @Post('teams/:teamId/events')
  create(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentMembership() membership: Membership,
    @Body() dto: CreateEventDto,
  ) {
    return this.events.create(teamId, membership.id, dto);
  }

  @Get('teams/:teamId/events')
  list(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query() query: ListEventsQueryDto,
  ) {
    return this.events.list(
      teamId,
      query.scope ?? 'upcoming',
      query.limit ?? 20,
    );
  }

  @Get('events/:eventId')
  findOne(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.findOne(eventId);
  }

  @TeamRoles('OWNER', 'LEADER')
  @Patch('events/:eventId')
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(eventId, dto);
  }

  @TeamRoles('OWNER', 'LEADER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('events/:eventId')
  remove(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.remove(eventId);
  }
}

```

## events.module.ts
```typescript
import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}

```

## app.module.ts (after)
```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TeamsModule } from './modules/teams/teams.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PositionsModule } from './modules/positions/positions.module';
import { InvitesModule } from './modules/invites/invites.module';
import { EventsModule } from './modules/events/events.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    TeamsModule,
    MembershipsModule,
    PositionsModule,
    InvitesModule,
    EventsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Autenticacao obrigatoria por padrao: rotas abertas precisam de @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```
