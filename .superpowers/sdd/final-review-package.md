# Final review package — Etapa 4


## backend\src\common\guards\team-member.guard.ts
```
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TEAM_ROLES_KEY,
  type RequestWithMembership,
} from '../decorators/team-roles.decorator';

/// Resolve o vinculo do usuario com a equipe da rota e o injeta em
/// `req.membership`. Roda depois do JwtAuthGuard (que e global).
@Injectable()
export class TeamMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMembership>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Voce precisa estar autenticado.');
    }

    const rawTeamId = request.params?.teamId;
    const rawEventId = request.params?.eventId;
    let teamId = typeof rawTeamId === 'string' ? rawTeamId : undefined;

    // Rotas /events/:eventId nao trazem teamId; resolvemos pelo evento.
    // Quem nao e membro da equipe dona do evento recebe 404 (mesmo contrato).
    if (!teamId && typeof rawEventId === 'string') {
      const event = await this.prisma.event.findUnique({
        where: { id: rawEventId },
        select: { teamId: true },
      });
      if (!event) {
        throw new NotFoundException('Culto nao encontrado.');
      }
      teamId = event.teamId;
    }

    if (!teamId) {
      throw new InternalServerErrorException(
        'Rota protegida pelo TeamMemberGuard sem parametro :teamId ou :eventId.',
      );
    }

    const membership = await this.prisma.membership.findFirst({
      where: { teamId, userId: user.id, status: 'ACTIVE' },
    });

    // 404 e nao 403: nao confirmamos a existencia de equipes das quais o
    // usuario nao participa.
    if (!membership) {
      throw new NotFoundException('Equipe nao encontrada.');
    }

    request.membership = membership;

    const allowedRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      TEAM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'Voce nao tem permissao para fazer isso nesta equipe.',
      );
    }

    return true;
  }
}

```

## backend\src\modules\events\dto\event.dto.ts
```
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o titulo do culto.' })
  @MaxLength(200)
  title!: string;

  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt!: string;

  @IsOptional()
  @IsDateString({}, { message: 'Data do ensaio invalida.' })
  rehearsalAt?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorPalette?: string;
}

export class UpdateEventDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o titulo do culto.' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({}, { message: 'Data do ensaio invalida.' })
  rehearsalAt?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorPalette?: string | null;
}

export class ListEventsQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'past'], { message: 'Use scope=upcoming ou scope=past.' })
  scope?: 'upcoming' | 'past' = 'upcoming';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

```

## backend\src\modules\events\events.service.ts
```
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Event } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateEventDto, UpdateEventDto } from './dto/event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRehearsal(startsAt: Date, rehearsalAt?: Date | null) {
    if (rehearsalAt && rehearsalAt > startsAt) {
      throw new BadRequestException({
        code: 'REHEARSAL_AFTER_START',
        message: 'O ensaio precisa ser antes ou no mesmo horario do culto.',
      });
    }
  }

  private toPublic(event: Event & { team?: { timezone: string } }) {
    return {
      id: event.id,
      teamId: event.teamId,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      rehearsalAt: event.rehearsalAt?.toISOString() ?? null,
      location: event.location,
      notes: event.notes,
      colorPalette: event.colorPalette,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      timezone: event.team?.timezone,
      assignments: [] as const,
      songs: [] as const,
    };
  }

  async create(teamId: string, createdById: string, dto: CreateEventDto) {
    const startsAt = new Date(dto.startsAt);
    const rehearsalAt = dto.rehearsalAt ? new Date(dto.rehearsalAt) : null;
    this.assertRehearsal(startsAt, rehearsalAt);

    const event = await this.prisma.event.create({
      data: {
        teamId,
        createdById,
        title: dto.title,
        startsAt,
        rehearsalAt,
        location: dto.location,
        notes: dto.notes,
        colorPalette: dto.colorPalette,
        status: 'PUBLISHED',
      },
      include: { team: { select: { timezone: true } } },
    });
    return this.toPublic(event);
  }

  async list(teamId: string, scope: 'upcoming' | 'past', limit: number) {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        teamId,
        startsAt: scope === 'upcoming' ? { gte: now } : { lt: now },
      },
      orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: limit,
      include: { team: { select: { timezone: true } } },
    });
    return events.map((e) => this.toPublic(e));
  }

  async findOne(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { team: { select: { timezone: true } } },
    });
    if (!event) {
      throw new NotFoundException('Culto nao encontrado.');
    }
    return this.toPublic(event);
  }

  async update(eventId: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!existing) {
      throw new NotFoundException('Culto nao encontrado.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    let rehearsalAt = existing.rehearsalAt;
    if (dto.rehearsalAt !== undefined) {
      rehearsalAt =
        dto.rehearsalAt === null ? null : new Date(dto.rehearsalAt);
    }
    this.assertRehearsal(startsAt, rehearsalAt);

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.rehearsalAt !== undefined ? { rehearsalAt } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.colorPalette !== undefined
          ? { colorPalette: dto.colorPalette }
          : {}),
      },
      include: { team: { select: { timezone: true } } },
    });
    return this.toPublic(event);
  }

  async remove(eventId: string) {
    try {
      await this.prisma.event.delete({ where: { id: eventId } });
    } catch {
      throw new NotFoundException('Culto nao encontrado.');
    }
  }
}

```

## backend\src\modules\events\events.controller.ts
```
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

## backend\src\modules\events\events.module.ts
```
import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}

```

## backend\src\app.module.ts
```
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

## app\lib\features\events\domain\event_models.dart
```
class Event {
  const Event({
    required this.id,
    required this.teamId,
    required this.title,
    required this.startsAt,
    required this.rehearsalAt,
    required this.location,
    required this.notes,
    required this.colorPalette,
    required this.status,
    required this.timezone,
    required this.assignments,
    required this.songs,
  });

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['id'] as String,
      teamId: json['teamId'] as String,
      title: json['title'] as String,
      startsAt: DateTime.parse(json['startsAt'] as String).toUtc(),
      rehearsalAt: _parseUtcDateTime(json['rehearsalAt']),
      location: json['location'] as String?,
      notes: json['notes'] as String?,
      colorPalette: json['colorPalette'] as String?,
      status: json['status'] as String,
      timezone: json['timezone'] as String,
      assignments:
          (json['assignments'] as List<dynamic>? ?? const []).cast<Object?>(),
      songs: (json['songs'] as List<dynamic>? ?? const []).cast<Object?>(),
    );
  }

  final String id;
  final String teamId;
  final String title;
  final DateTime startsAt;
  final DateTime? rehearsalAt;
  final String? location;
  final String? notes;
  final String? colorPalette;
  final String status;
  final String timezone;
  final List<Object?> assignments;
  final List<Object?> songs;

  static DateTime? _parseUtcDateTime(Object? value) {
    if (value == null) {
      return null;
    }

    return DateTime.parse(value as String).toUtc();
  }
}

```

## app\lib\features\events\domain\event_datetime.dart
```
import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

DateTime eventLocalTime(DateTime utc, String timezone) {
  return tz.TZDateTime.from(utc, tz.getLocation(timezone));
}

String formatEventWeekdayDate(DateTime utc, String timezone) {
  final localTime = eventLocalTime(utc, timezone);
  return DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(localTime);
}

String formatEventTime(DateTime utc, String timezone) {
  final localTime = eventLocalTime(utc, timezone);
  return DateFormat('HH:mm', 'pt_BR').format(localTime);
}

```

## app\lib\features\events\data\event_repository.dart
```
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../domain/event_models.dart';

class EventRepository {
  const EventRepository(this._dio);

  final Dio _dio;

  Future<List<Event>> list(
    String teamId, {
    String scope = 'upcoming',
    int limit = 20,
  }) async {
    return _guard(() async {
      final response = await _dio.get<List<dynamic>>(
        '/teams/$teamId/events',
        queryParameters: {'scope': scope, 'limit': limit},
      );
      return response.data!
          .map((e) => Event.fromJson(e as Map<String, dynamic>))
          .toList();
    });
  }

  Future<Event> find(String eventId) async {
    return _guard(() async {
      final response =
          await _dio.get<Map<String, dynamic>>('/events/$eventId');
      return Event.fromJson(response.data!);
    });
  }

  Future<Event> create(
    String teamId, {
    required String title,
    required String startsAt,
    String? rehearsalAt,
    String? location,
    String? notes,
    String? colorPalette,
  }) async {
    return _guard(() async {
      final response = await _dio.post<Map<String, dynamic>>(
        '/teams/$teamId/events',
        data: {
          'title': title,
          'startsAt': startsAt,
          if (rehearsalAt != null) 'rehearsalAt': rehearsalAt,
          if (location != null && location.isNotEmpty) 'location': location,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          if (colorPalette != null && colorPalette.isNotEmpty)
            'colorPalette': colorPalette,
        },
      );
      return Event.fromJson(response.data!);
    });
  }

  Future<Event> update(
    String eventId, {
    String? title,
    String? startsAt,
    String? rehearsalAt,
    bool removeRehearsalAt = false,
    String? location,
    String? notes,
    String? colorPalette,
  }) async {
    return _guard(() async {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/events/$eventId',
        data: {
          if (title != null) 'title': title,
          if (startsAt != null) 'startsAt': startsAt,
          if (removeRehearsalAt) 'rehearsalAt': null,
          if (rehearsalAt != null) 'rehearsalAt': rehearsalAt,
          if (location != null) 'location': location,
          if (notes != null) 'notes': notes,
          if (colorPalette != null) 'colorPalette': colorPalette,
        },
      );
      return Event.fromJson(response.data!);
    });
  }

  Future<void> remove(String eventId) async {
    return _guard(() async {
      await _dio.delete<void>('/events/$eventId');
    });
  }

  Future<T> _guard<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final eventRepositoryProvider = Provider<EventRepository>((ref) {
  return EventRepository(ref.watch(dioProvider));
});

typedef EventsQuery = (String teamId, String scope);

final eventsProvider =
    FutureProvider.autoDispose.family<List<Event>, EventsQuery>(
  (ref, query) {
    final (teamId, scope) = query;
    return ref.watch(eventRepositoryProvider).list(teamId, scope: scope);
  },
);

final eventProvider =
    FutureProvider.autoDispose.family<Event, String>((ref, eventId) {
  return ref.watch(eventRepositoryProvider).find(eventId);
});

```

## app\lib\features\events\presentation\main_shell.dart
```
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isAgenda = GoRouterState.of(context).uri.path.startsWith('/agenda');

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: isAgenda ? 0 : 1,
        onDestinationSelected: (index) {
          if (index == 0) {
            context.go('/agenda');
            return;
          }

          context.go('/equipe');
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Agenda',
          ),
          NavigationDestination(
            icon: Icon(Icons.groups_outlined),
            selectedIcon: Icon(Icons.groups),
            label: 'Equipe',
          ),
        ],
      ),
    );
  }
}

```

## app\lib\features\events\presentation\agenda_screen.dart
```
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/application/auth_controller.dart';
import '../../team/data/team_repository.dart';
import '../data/event_repository.dart';
import '../domain/event_datetime.dart';
import '../domain/event_models.dart';

class AgendaScreen extends ConsumerStatefulWidget {
  const AgendaScreen({super.key});

  @override
  ConsumerState<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends ConsumerState<AgendaScreen> {
  String _scope = 'upcoming';

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final teamId = ref.watch(activeTeamIdProvider);

    if (auth.teams.isEmpty || teamId == null) {
      return const _AgendaOnboarding();
    }

    final events = ref.watch(eventsProvider((teamId, _scope)));
    final canManage = auth.teams.first.canManage;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      floatingActionButton: canManage
          ? FloatingActionButton(
              tooltip: 'Criar culto',
              onPressed: () => context.push('/agenda/novo'),
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'upcoming', label: Text('Proximos')),
                ButtonSegment(value: 'past', label: Text('Passados')),
              ],
              selected: {_scope},
              onSelectionChanged: (selection) {
                setState(() => _scope = selection.first);
              },
            ),
          ),
          Expanded(
            child: events.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _EventsErrorState(
                onRetry: () => ref.invalidate(eventsProvider((teamId, _scope))),
              ),
              data: (events) => _EventsList(
                events: events,
                showFeaturedEvent: _scope == 'upcoming',
                onRefresh: () =>
                    ref.refresh(eventsProvider((teamId, _scope)).future),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AgendaOnboarding extends ConsumerWidget {
  const _AgendaOnboarding();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(authControllerProvider.notifier).reloadTeams(),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Ola, ${user?.firstName ?? ''}',
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: 32),
            const _OnboardingCards(),
          ],
        ),
      ),
    );
  }
}

class _OnboardingCards extends StatelessWidget {
  const _OnboardingCards();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.groups_outlined, color: theme.colorScheme.primary),
                const SizedBox(height: 12),
                Text(
                  'Sou o lider da equipe',
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  'Crie a equipe e cadastre os integrantes. Ninguem precisa ter conta ainda.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.push('/equipe/nova'),
                  child: const Text('Criar equipe'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.link, color: theme.colorScheme.primary),
                const SizedBox(height: 12),
                Text('Recebi um convite', style: theme.textTheme.titleMedium),
                const SizedBox(height: 6),
                Text(
                  'Cole o codigo que o lider da equipe enviou para voce.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                FilledButton.tonal(
                  onPressed: () => context.push('/convite'),
                  child: const Text('Entrar com codigo'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EventsList extends StatelessWidget {
  const _EventsList({
    required this.events,
    required this.showFeaturedEvent,
    required this.onRefresh,
  });

  final List<Event> events;
  final bool showFeaturedEvent;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          children: const [
            SizedBox(height: 160),
            Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Nenhum culto cadastrado. Toque em + para criar o primeiro.',
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final featuredEvent = showFeaturedEvent ? events.first : null;
    final remainingEvents = showFeaturedEvent ? events.skip(1) : events;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        children: [
          if (featuredEvent != null) ...[
            _FeaturedEventCard(event: featuredEvent),
            if (remainingEvents.isNotEmpty) const SizedBox(height: 16),
          ],
          ...remainingEvents.map(
            (event) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _EventTile(event: event),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeaturedEventCard extends StatelessWidget {
  const _FeaturedEventCard({required this.event});

  final Event event;

  @override
  Widget build(BuildContext context) {
    final timezone =
        event.timezone.isEmpty ? 'America/Sao_Paulo' : event.timezone;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/agenda/${event.id}'),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                formatEventWeekdayDate(event.startsAt, timezone),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 8),
              Text(
                event.title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text('Culto ${formatEventTime(event.startsAt, timezone)}'),
              if (event.rehearsalAt != null)
                Text('Ensaio ${formatEventTime(event.rehearsalAt!, timezone)}'),
            ],
          ),
        ),
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});

  final Event event;

  @override
  Widget build(BuildContext context) {
    final timezone =
        event.timezone.isEmpty ? 'America/Sao_Paulo' : event.timezone;

    return Card(
      child: ListTile(
        title: Text(event.title),
        subtitle: Text(
          '${formatEventWeekdayDate(event.startsAt, timezone)} â€” '
          'Culto ${formatEventTime(event.startsAt, timezone)}'
          '${event.rehearsalAt == null ? '' : ' Â· Ensaio ${formatEventTime(event.rehearsalAt!, timezone)}'}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/agenda/${event.id}'),
      ),
    );
  }
}

class _EventsErrorState extends StatelessWidget {
  const _EventsErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FilledButton.tonal(
        onPressed: onRetry,
        child: const Text('Tentar novamente'),
      ),
    );
  }
}

```

## app\lib\features\events\presentation\event_form_screen.dart
```
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/form_scaffold.dart';
import '../../team/data/team_repository.dart';
import '../data/event_repository.dart';
import '../domain/event_datetime.dart';
import '../domain/event_models.dart';

class EventFormScreen extends ConsumerStatefulWidget {
  const EventFormScreen({super.key, this.eventId});

  final String? eventId;

  @override
  ConsumerState<EventFormScreen> createState() => _EventFormScreenState();
}

class _EventFormScreenState extends ConsumerState<EventFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _location = TextEditingController();
  final _notes = TextEditingController();
  final _colorPalette = TextEditingController();

  late DateTime _startsAt;
  DateTime? _rehearsalAt;
  bool _populated = false;
  bool _loading = false;
  String? _error;

  bool get _isEditing => widget.eventId != null;

  @override
  void initState() {
    super.initState();
    _startsAt = DateTime.now();
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _notes.dispose();
    _colorPalette.dispose();
    super.dispose();
  }

  void _populate(Event event) {
    if (_populated) return;

    _populated = true;
    _title.text = event.title;
    _location.text = event.location ?? '';
    _notes.text = event.notes ?? '';
    _colorPalette.text = event.colorPalette ?? '';
    _startsAt = eventLocalTime(event.startsAt, _timezone(event.timezone));
    _rehearsalAt = event.rehearsalAt == null
        ? null
        : eventLocalTime(event.rehearsalAt!, _timezone(event.timezone));
  }

  String _timezone(String value) {
    if (value.isEmpty) return 'America/Sao_Paulo';
    return value;
  }

  Future<void> _pickDate({required bool rehearsal}) async {
    final current = rehearsal ? _rehearsalAt ?? _startsAt : _startsAt;
    final selected = await showDatePicker(
      context: context,
      locale: const Locale('pt', 'BR'),
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (selected == null || !mounted) return;

    setState(() {
      final updated = DateTime(
        selected.year,
        selected.month,
        selected.day,
        current.hour,
        current.minute,
      );
      if (rehearsal) {
        _rehearsalAt = updated;
        return;
      }
      _startsAt = updated;
    });
  }

  Future<void> _pickTime({required bool rehearsal}) async {
    final current = rehearsal ? _rehearsalAt ?? _startsAt : _startsAt;
    final selected = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (selected == null || !mounted) return;

    setState(() {
      final updated = DateTime(
        current.year,
        current.month,
        current.day,
        selected.hour,
        selected.minute,
      );
      if (rehearsal) {
        _rehearsalAt = updated;
        return;
      }
      _startsAt = updated;
    });
  }

  DateTime _toUtc(DateTime dateTime, String timezone) {
    final location = tz.getLocation(timezone);
    return tz.TZDateTime(
      location,
      dateTime.year,
      dateTime.month,
      dateTime.day,
      dateTime.hour,
      dateTime.minute,
    ).toUtc();
  }

  Future<String> _createTimezone(String teamId) async {
    final team = await ref.read(teamRepositoryProvider).find(teamId);
    return _timezone(team.timezone);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final activeTeamId = ref.read(activeTeamIdProvider);
    if (!_isEditing && activeTeamId == null) {
      setState(() => _error = 'Nenhuma equipe ativa foi encontrada.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final event = _isEditing
          ? await ref.read(eventRepositoryProvider).find(widget.eventId!)
          : null;
      final timezone = event == null
          ? await _createTimezone(activeTeamId!)
          : _timezone(event.timezone);
      final startsAt = _toUtc(_startsAt, timezone).toIso8601String();
      final rehearsalAt = _rehearsalAt == null
          ? null
          : _toUtc(_rehearsalAt!, timezone).toIso8601String();
      final repository = ref.read(eventRepositoryProvider);

      if (event != null) {
        await repository.update(
          event.id,
          title: _title.text.trim(),
          startsAt: startsAt,
          rehearsalAt: rehearsalAt,
          removeRehearsalAt: _rehearsalAt == null,
          location: _location.text.trim(),
          notes: _notes.text.trim(),
          colorPalette: _colorPalette.text.trim(),
        );
        ref.invalidate(eventsProvider((event.teamId, 'upcoming')));
        ref.invalidate(eventsProvider((event.teamId, 'past')));
        ref.invalidate(eventProvider(event.id));
      } else {
        final createdEvent = await repository.create(
          activeTeamId!,
          title: _title.text.trim(),
          startsAt: startsAt,
          rehearsalAt: rehearsalAt,
          location: _location.text.trim(),
          notes: _notes.text.trim(),
          colorPalette: _colorPalette.text.trim(),
        );
        ref.invalidate(eventsProvider((createdEvent.teamId, 'upcoming')));
        ref.invalidate(eventsProvider((createdEvent.teamId, 'past')));
        ref.invalidate(eventProvider(createdEvent.id));
      }

      if (mounted) context.pop();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eventAsync = _isEditing ? ref.watch(eventProvider(widget.eventId!)) : null;

    if (eventAsync != null && eventAsync.isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (eventAsync != null && eventAsync.hasError) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: FilledButton.tonal(
            onPressed: () => ref.invalidate(eventProvider(widget.eventId!)),
            child: const Text('Tentar novamente'),
          ),
        ),
      );
    }

    final event = eventAsync?.valueOrNull;
    if (event != null) _populate(event);

    return FormScaffold(
      appBar: AppBar(),
      title: _isEditing ? 'Editar culto' : 'Novo culto',
      subtitle: 'Informe os horarios e os detalhes do culto.',
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _title,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Titulo do culto'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Informe o titulo do culto.'
                    : null,
              ),
              const SizedBox(height: 24),
              Text('Culto', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              _DateTimeFields(
                dateTime: _startsAt,
                enabled: !_loading,
                onPickDate: () => _pickDate(rehearsal: false),
                onPickTime: () => _pickTime(rehearsal: false),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Ensaio (opcional)',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (_rehearsalAt != null)
                    IconButton(
                      tooltip: 'Limpar ensaio',
                      onPressed: _loading
                          ? null
                          : () => setState(() => _rehearsalAt = null),
                      icon: const Icon(Icons.clear),
                    ),
                ],
              ),
              if (_rehearsalAt == null)
                OutlinedButton.icon(
                  onPressed: _loading
                      ? null
                      : () => setState(() => _rehearsalAt = _startsAt),
                  icon: const Icon(Icons.add),
                  label: const Text('Adicionar ensaio'),
                )
              else
                _DateTimeFields(
                  dateTime: _rehearsalAt!,
                  enabled: !_loading,
                  onPickDate: () => _pickDate(rehearsal: true),
                  onPickTime: () => _pickTime(rehearsal: true),
                ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _location,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Local (opcional)'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _notes,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Observacoes (opcional)'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _colorPalette,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Paleta de cores (opcional)',
                  hintText: 'Preto e dourado',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 28),
        if (_error != null) FormErrorBanner(message: _error!),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(_isEditing ? 'Salvar' : 'Criar culto'),
        ),
      ],
    );
  }
}

class _DateTimeFields extends StatelessWidget {
  const _DateTimeFields({
    required this.dateTime,
    required this.enabled,
    required this.onPickDate,
    required this.onPickTime,
  });

  final DateTime dateTime;
  final bool enabled;
  final VoidCallback onPickDate;
  final VoidCallback onPickTime;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: enabled ? onPickDate : null,
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text(DateFormat('dd/MM/yyyy', 'pt_BR').format(dateTime)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: enabled ? onPickTime : null,
            icon: const Icon(Icons.schedule_outlined),
            label: Text(DateFormat('HH:mm', 'pt_BR').format(dateTime)),
          ),
        ),
      ],
    );
  }
}

```

## app\lib\features\events\presentation\event_detail_screen.dart
```
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import '../data/event_repository.dart';
import '../domain/event_datetime.dart';
import '../domain/event_models.dart';

class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventAsync = ref.watch(eventProvider(eventId));
    final canManage = ref.watch(authControllerProvider).teams.firstOrNull?.canManage ?? false;

    return eventAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: FilledButton.tonal(
            onPressed: () => ref.invalidate(eventProvider(eventId)),
            child: const Text('Tentar novamente'),
          ),
        ),
      ),
      data: (event) => Scaffold(
        appBar: AppBar(
          title: const Text('Culto'),
          actions: [
            if (canManage)
              IconButton(
                tooltip: 'Editar culto',
                onPressed: () => context.push('/agenda/${event.id}/editar'),
                icon: const Icon(Icons.edit_outlined),
              ),
            if (canManage)
              IconButton(
                tooltip: 'Excluir culto',
                onPressed: () => _confirmDelete(context, ref, event),
                icon: const Icon(Icons.delete_outline),
              ),
          ],
        ),
        body: _EventDetailBody(event: event),
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Event event,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Excluir culto?'),
        content: Text('O culto "${event.title}" sera removido.'),
        actions: [
          TextButton(
            onPressed: () => dialogContext.pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => dialogContext.pop(true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(eventRepositoryProvider).remove(event.id);
      ref.invalidate(eventsProvider((event.teamId, 'upcoming')));
      ref.invalidate(eventsProvider((event.teamId, 'past')));
      ref.invalidate(eventProvider(event.id));
      if (context.mounted) context.pop();
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }
}

class _EventDetailBody extends StatelessWidget {
  const _EventDetailBody({required this.event});

  final Event event;

  @override
  Widget build(BuildContext context) {
    final timezone =
        event.timezone.isEmpty ? 'America/Sao_Paulo' : event.timezone;
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
      children: [
        Text(event.title, style: theme.textTheme.headlineMedium),
        const SizedBox(height: 24),
        _DetailItem(
          icon: Icons.calendar_today_outlined,
          label: 'Culto',
          value:
              '${formatEventWeekdayDate(event.startsAt, timezone)} Ã s ${formatEventTime(event.startsAt, timezone)}',
        ),
        if (event.rehearsalAt != null) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.schedule_outlined,
            label: 'Ensaio',
            value:
                '${formatEventWeekdayDate(event.rehearsalAt!, timezone)} Ã s ${formatEventTime(event.rehearsalAt!, timezone)}',
          ),
        ],
        if (event.location?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.location_on_outlined,
            label: 'Local',
            value: event.location!,
          ),
        ],
        if (event.notes?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.notes_outlined,
            label: 'Observacoes',
            value: event.notes!,
          ),
        ],
        if (event.colorPalette?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.palette_outlined,
            label: 'Paleta',
            value: event.colorPalette!,
          ),
        ],
        const SizedBox(height: 32),
        const _ComingSoonSection(
          icon: Icons.groups_outlined,
          title: 'Equipe escalada â€” em breve',
        ),
        const SizedBox(height: 16),
        const _ComingSoonSection(
          icon: Icons.music_note_outlined,
          title: 'Musicas â€” em breve',
        ),
      ],
    );
  }
}

class _DetailItem extends StatelessWidget {
  const _DetailItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 2),
              Text(value, style: Theme.of(context).textTheme.bodyLarge),
            ],
          ),
        ),
      ],
    );
  }
}

class _ComingSoonSection extends StatelessWidget {
  const _ComingSoonSection({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
      ),
    );
  }
}

```

## app\lib\core\router\app_router.dart
```
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/change_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/events/presentation/agenda_screen.dart';
import '../../features/events/presentation/event_detail_screen.dart';
import '../../features/events/presentation/event_form_screen.dart';
import '../../features/events/presentation/main_shell.dart';
import '../../features/health/presentation/health_screen.dart';
import '../../features/invites/presentation/invites_screen.dart';
import '../../features/invites/presentation/join_team_screen.dart';
import '../../features/team/data/team_repository.dart';
import '../../features/team/domain/team_models.dart';
import '../../features/team/presentation/create_team_screen.dart';
import '../../features/team/presentation/member_form_screen.dart';
import '../../features/team/presentation/members_screen.dart';

/// Rotas acessiveis sem sessao.
const _publicRoutes = {'/login', '/cadastro', '/diagnostico'};

/// Enquanto a senha nao for trocada, so estas rotas respondem -- espelha o que
/// o backend permite via @SkipPasswordChangeCheck.
const _passwordChangeRoutes = {'/trocar-senha', '/diagnostico'};

/// Faz o go_router reavaliar o redirect sempre que o estado de auth muda.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    _subscription = ref.listen<AuthState>(
      authControllerProvider,
      (_, __) => notifyListeners(),
    );
  }

  late final ProviderSubscription<AuthState> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefreshNotifier(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final status = ref.read(authControllerProvider).status;
      final location = state.matchedLocation;

      switch (status) {
        case AuthStatus.unknown:
          return location == '/' ? null : '/';

        case AuthStatus.unauthenticated:
          return _publicRoutes.contains(location) ? null : '/login';

        case AuthStatus.mustChangePassword:
          return _passwordChangeRoutes.contains(location)
              ? null
              : '/trocar-senha';

        case AuthStatus.authenticated:
          final isEntryRoute = location == '/' ||
              _publicRoutes.contains(location) ||
              location == '/trocar-senha';
          if (isEntryRoute && location != '/diagnostico') {
            return '/agenda';
          }
          return null;
      }
    },
    routes: [
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/cadastro', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/trocar-senha',
        builder: (_, __) => const ChangePasswordScreen(),
      ),
      GoRoute(path: '/home', redirect: (_, __) => '/agenda'),
      GoRoute(path: '/diagnostico', builder: (_, __) => const HealthScreen()),
      GoRoute(
        path: '/equipe/nova',
        builder: (_, __) => const CreateTeamScreen(),
      ),
      GoRoute(path: '/convite', builder: (_, __) => const JoinTeamScreen()),
      GoRoute(
        path: '/equipe/convites',
        builder: (_, __) =>
            _withActiveTeam(ref, (id) => InvitesScreen(teamId: id)),
      ),
      ShellRoute(
        builder: (_, __, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: '/agenda',
            builder: (_, __) => const AgendaScreen(),
            routes: [
              GoRoute(
                path: 'novo',
                builder: (_, __) => const EventFormScreen(),
              ),
              GoRoute(
                path: ':eventId',
                builder: (_, state) => EventDetailScreen(
                  eventId: state.pathParameters['eventId']!,
                ),
                routes: [
                  GoRoute(
                    path: 'editar',
                    builder: (_, state) => EventFormScreen(
                      eventId: state.pathParameters['eventId'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/equipe',
            builder: (_, __) =>
                _withActiveTeam(ref, (id) => MembersScreen(teamId: id)),
            routes: [
              GoRoute(
                path: 'membros/novo',
                builder: (_, __) =>
                    _withActiveTeam(ref, (id) => MemberFormScreen(teamId: id)),
              ),
              GoRoute(
                path: 'membros/editar',
                builder: (_, state) => _withActiveTeam(
                  ref,
                  (id) => MemberFormScreen(
                    teamId: id,
                    member: state.extra as Member?,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

/// As telas de equipe dependem da equipe ativa. Se ela ainda nao carregou,
/// mostramos um aviso em vez de quebrar a navegacao.
Widget _withActiveTeam(Ref ref, Widget Function(String teamId) build) {
  final teamId = ref.read(activeTeamIdProvider);

  if (teamId == null) {
    return const Scaffold(
      body: Center(child: Text('Voce ainda nao faz parte de uma equipe.')),
    );
  }

  return build(teamId);
}

```

## app\test\event_datetime_test.dart
```
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:louvor_app/features/events/domain/event_datetime.dart';
import 'package:louvor_app/features/events/domain/event_models.dart';
import 'package:timezone/data/latest.dart' as tzdata;

void main() {
  setUpAll(() async {
    tzdata.initializeTimeZones();
    await initializeDateFormatting('pt_BR');
  });

  test('fromJson mapeia datas ISO UTC', () {
    final event = Event.fromJson({
      'id': 'e1',
      'teamId': 't1',
      'title': 'Culto',
      'startsAt': '2026-08-09T12:00:00.000Z',
      'rehearsalAt': '2026-08-08T22:00:00.000Z',
      'location': null,
      'notes': 'Chegar cedo',
      'colorPalette': 'Preto e dourado',
      'status': 'PUBLISHED',
      'timezone': 'America/Sao_Paulo',
      'assignments': [],
      'songs': [],
    });

    expect(event.startsAt.isUtc, isTrue);
    expect(event.startsAt.hour, 12);
    expect(event.rehearsalAt, isNotNull);
    expect(event.colorPalette, 'Preto e dourado');
  });

  test('formata dia da semana e horario em portugues no TZ da equipe', () {
    final utc = DateTime.parse('2026-08-09T12:00:00.000Z');

    final label = formatEventWeekdayDate(utc, 'America/Sao_Paulo');
    final time = formatEventTime(utc, 'America/Sao_Paulo');

    expect(label.toLowerCase(), contains('domingo'));
    expect(time, '09:00');
  });
}

```
