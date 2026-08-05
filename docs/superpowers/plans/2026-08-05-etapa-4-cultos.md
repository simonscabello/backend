# Etapa 4 — Cultos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de cultos na API e agenda como tela principal do app pós-login.

**Architecture:** Estender `TeamMemberGuard` para resolver `teamId` a partir de `:eventId`. Módulo Nest `events` com rotas mistas (`/teams/:teamId/events` e `/events/:eventId`). App Flutter feature-first com shell Agenda | Equipe; datas UTC na API e formatação com timezone da equipe.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL; Flutter + Riverpod + go_router + Dio + intl + timezone.

**Spec:** `docs/superpowers/specs/2026-08-05-etapa-4-cultos-design.md`

## Global Constraints

- Domínio/código em inglês; mensagens ao usuário em português (sem forçar acentos nesta etapa).
- Sem freezed/build_runner/CQRS; modelos Dart à mão.
- Sem migration Prisma (schema já tem `Event`).
- `status` sempre `PUBLISHED`; sem `duplicate`.
- Não-membro → **404**; MEMBER em mutação → **403**.
- Validação `rehearsalAt <= startsAt` só no service (`REHEARSAL_AFTER_START`, HTTP 400).
- Backend só via Docker (`docker compose exec api ...`).
- Flutter: prefixar PATH com `C:\Users\Acer\flutter\bin`.
- **Não criar commits** a menos que o usuário peça; pular passos de commit.

## File map

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/common/guards/team-member.guard.ts` | Resolver teamId via `:teamId` ou `:eventId` |
| `backend/src/modules/events/dto/event.dto.ts` | Create/Update + query de lista |
| `backend/src/modules/events/events.service.ts` | Regras + Prisma |
| `backend/src/modules/events/events.controller.ts` | Rotas HTTP |
| `backend/src/modules/events/events.module.ts` | Wiring |
| `backend/src/app.module.ts` | Import EventsModule |
| `app/pubspec.yaml` | Dependência `timezone` |
| `app/lib/main.dart` | Inicializar timezone DB |
| `app/lib/features/events/domain/event_models.dart` | `Event` + fromJson |
| `app/lib/features/events/domain/event_datetime.dart` | UTC → team TZ + labels pt_BR |
| `app/lib/features/events/data/event_repository.dart` | Dio + providers |
| `app/lib/features/events/presentation/agenda_screen.dart` | Lista + destaque |
| `app/lib/features/events/presentation/event_form_screen.dart` | Criar/editar |
| `app/lib/features/events/presentation/event_detail_screen.dart` | Detalhe + placeholders |
| `app/lib/features/events/presentation/main_shell.dart` | BottomNav Agenda \| Equipe |
| `app/lib/core/router/app_router.dart` | Rotas shell; redirect `/agenda` |
| `app/test/event_datetime_test.dart` | Testes de data/formato |
| `app/lib/features/home/presentation/home_screen.dart` | Onboarding sem equipe (reuso) |

---

### Task 1: Estender TeamMemberGuard

**Files:**
- Modify: `backend/src/common/guards/team-member.guard.ts`

**Interfaces:**
- Consumes: `request.params.teamId` ou `request.params.eventId`
- Produces: `request.membership` (Membership ACTIVE) ou 404

- [ ] **Step 1: Substituir a resolução de teamId**

No `canActivate`, após obter `user`, substituir o bloco que exige só `teamId` por:

```typescript
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
```

Manter o restante (lookup membership ACTIVE, 404 se ausente, `@TeamRoles`) igual.

- [ ] **Step 2: Typecheck**

Run: `docker compose exec api npx tsc --noEmit -p tsconfig.json`  
Expected: sem erros.

---

### Task 2: DTOs e EventsService

**Files:**
- Create: `backend/src/modules/events/dto/event.dto.ts`
- Create: `backend/src/modules/events/events.service.ts`

**Interfaces:**
- Produces:
  - `EventsService.create(teamId, membershipId, dto) → public event`
  - `list(teamId, scope, limit) → public event[]`
  - `findOne(eventId) → public event + assignments: [] + songs: [] + timezone`
  - `update(eventId, dto)`, `remove(eventId)`

- [ ] **Step 1: Criar DTOs**

```typescript
// backend/src/modules/events/dto/event.dto.ts
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

  /// null limpa o ensaio; omitido nao altera. Usar @ValidateIf para aceitar null.
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

Nota: se `scope` com default via propriedade falhar no ValidationPipe, aplicar default no service (`dto.scope ?? 'upcoming'`).

- [ ] **Step 2: Criar EventsService**

Implementar:

```typescript
// Esqueleto — completar no arquivo
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
    const rehearsalAt =
      dto.rehearsalAt === undefined
        ? existing.rehearsalAt
        : dto.rehearsalAt === null
          ? null
          : new Date(dto.rehearsalAt);
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

Usar early return / guard clauses; evitar `else` após `return` (convenção do projeto).

- [ ] **Step 3: Typecheck**

Run: `docker compose exec api npx tsc --noEmit -p tsconfig.json`  
Expected: sem erros (módulo ainda não registrado — ok se só estes arquivos compilam no projeto inteiro; se faltarem imports de controller, completar Task 3 antes).

---

### Task 3: Controller, Module e registro

**Files:**
- Create: `backend/src/modules/events/events.controller.ts`
- Create: `backend/src/modules/events/events.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `EventsService`, `TeamMemberGuard`, `@TeamRoles`, `@CurrentMembership`
- Produces: rotas listadas na spec

- [ ] **Step 1: Controller**

```typescript
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

- [ ] **Step 2: Module + AppModule**

```typescript
@Module({
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
```

Em `app.module.ts`: `imports: [..., EventsModule]`.

- [ ] **Step 3: Typecheck + rotas no log**

Run:
```
docker compose up -d
docker compose exec api npx tsc --noEmit -p tsconfig.json
docker compose logs api --tail 80
```
Expected: tsc limpo; log Nest lista `POST /api/v1/teams/:teamId/events`, `GET ...`, etc.

- [ ] **Step 4: curl — caminho feliz e erros**

Login (ajustar se o path de auth for outro; conferir `auth.controller.ts`):

```bash
# 1) Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"samuel@teste.com","password":"senhaFinal789"}' | jq -r .accessToken)

# Descobrir teamId
TEAMS=$(curl -s http://localhost:3000/api/v1/auth/me -H "Authorization: Bearer $TOKEN")
TEAM_ID=$(echo "$TEAMS" | jq -r '.teams[0].teamId')

# 2) Criar culto OK
EVENT=$(curl -s -X POST "http://localhost:3000/api/v1/teams/$TEAM_ID/events" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Culto Domingo","startsAt":"2026-08-10T12:00:00.000Z","rehearsalAt":"2026-08-09T22:00:00.000Z","colorPalette":"Preto e dourado"}')
echo "$EVENT" | jq .
EVENT_ID=$(echo "$EVENT" | jq -r .id)

# 3) Ensaio depois do culto → 400 REHEARSAL_AFTER_START
curl -s -o /tmp/err.json -w "%{http_code}" -X POST "http://localhost:3000/api/v1/teams/$TEAM_ID/events" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Ruim","startsAt":"2026-08-10T12:00:00.000Z","rehearsalAt":"2026-08-11T12:00:00.000Z"}'
cat /tmp/err.json

# 4) Listar upcoming / past
curl -s "http://localhost:3000/api/v1/teams/$TEAM_ID/events?scope=upcoming&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5) Detalhe
curl -s "http://localhost:3000/api/v1/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 6) Evento UUID aleatorio → 404
curl -s -o /tmp/404.json -w "%{http_code}" \
  "http://localhost:3000/api/v1/events/00000000-0000-4000-8000-000000000000" \
  -H "Authorization: Bearer $TOKEN"

# 7) MEMBER sem permissao: usar conta MEMBER da equipe se existir; senão criar membro+login e esperar 403 no POST
```

Mostrar saídas reais no relatório final. No PowerShell, usar `curl.exe` ou equivalente e extrair JSON com o que estiver disponível.

---

### Task 4: Modelos Dart + formatação de datas (TDD)

**Files:**
- Modify: `app/pubspec.yaml` (add `timezone: ^0.10.1` ou versão compatível)
- Modify: `app/lib/main.dart`
- Create: `app/lib/features/events/domain/event_models.dart`
- Create: `app/lib/features/events/domain/event_datetime.dart`
- Create: `app/test/event_datetime_test.dart`

**Interfaces:**
- Produces:
  - `class Event` com `fromJson`
  - `DateTime eventLocalTime(DateTime utc, String timezone)`
  - `String formatEventWeekdayDate(DateTime utc, String timezone)`
  - `String formatEventTime(DateTime utc, String timezone)` → ex. `09:00`

- [ ] **Step 1: Escrever testes que falham**

```dart
// app/test/event_datetime_test.dart
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
      'startsAt': '2026-08-09T12:00:00.000Z', // 09:00 em America/Sao_Paulo
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
    // Domingo 09/08/2026 09:00 BRT
    expect(label.toLowerCase(), contains('domingo'));
    expect(time, '09:00');
  });
}
```

- [ ] **Step 2: Rodar e ver falha**

```
$env:PATH = 'C:\Users\Acer\flutter\bin;' + $env:PATH
cd app; flutter test test/event_datetime_test.dart
```
Expected: FAIL (arquivo/símbolos inexistentes).

- [ ] **Step 3: Implementar modelos + helper + timezone**

1. `cd app; flutter pub add timezone`
2. Em `main.dart`, após `WidgetsFlutterBinding`:
```dart
import 'package:timezone/data/latest.dart' as tzdata;
tzdata.initializeTimeZones();
```
3. Implementar `Event` e funções de formatação com `TZDateTime.from(utc, getLocation(tz))` e `DateFormat` `pt_BR` (ex. `EEEE, d 'de' MMMM` + `HH:mm`).

- [ ] **Step 4: Testes passam**

Run: `flutter test test/event_datetime_test.dart`  
Expected: All tests passed.

---

### Task 5: EventRepository e providers

**Files:**
- Create: `app/lib/features/events/data/event_repository.dart`

**Interfaces:**
- Produces:
  - `list(teamId, {scope, limit})`
  - `find(eventId)`
  - `create(teamId, {...})`
  - `update(eventId, {...})`
  - `remove(eventId)`
  - `eventsProvider(teamId, scope)` FutureProvider.family
  - `eventProvider(eventId)` FutureProvider.family

- [ ] **Step 1: Repository espelhando TeamRepository**

```dart
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
  // find, create, update, remove — mesmo padrao _guard
}
```

Providers: `eventRepositoryProvider`,  
`eventsProvider = FutureProvider.autoDispose.family` com record `(String teamId, String scope)` ou dois providers `upcomingEventsProvider` / `pastEventsProvider`.

---

### Task 6: Shell de navegação + Agenda

**Files:**
- Create: `app/lib/features/events/presentation/main_shell.dart`
- Create: `app/lib/features/events/presentation/agenda_screen.dart`
- Modify: `app/lib/core/router/app_router.dart`
- Keep: `home_screen.dart` para onboarding sem equipe (embutido na Agenda ou rota `/home` redirecionada)

**Interfaces:**
- Redirect autenticado: `/agenda` (em vez de `/home`)
- BottomNav: índice 0 Agenda, 1 Equipe

- [ ] **Step 1: MainShell**

`Scaffold` com `body: child`, `BottomNavigationBar` itens Agenda / Equipe; `onTap` → `context.go('/agenda'|'/equipe')`. Logout no AppBar da Agenda.

- [ ] **Step 2: AgendaScreen**

- Se `auth.teams.isEmpty`: reutilizar UI de onboarding da `HomeScreen` (extrair widget ou navegar conteúdo equivalente).
- Senão: `DefaultTabController` ou SegmentedButton próximos/passados; carregar `eventsProvider`.
- Primeiro item upcoming em card de destaque; resto em lista.
- Cada tile: weekday + data + horário culto + ensaio via `event_datetime`.
- FAB `+` se `canManage` → `/agenda/novo`.
- Empty: `Nenhum culto cadastrado. Toque em + para criar o primeiro.`
- Tap item → `/agenda/:eventId`

- [ ] **Step 3: Router**

Usar `ShellRoute` (ou `StatefulShellRoute.indexedStack`):

```dart
ShellRoute(
  builder: (context, state, child) => MainShell(child: child),
  routes: [
    GoRoute(
      path: '/agenda',
      builder: (_, __) => const AgendaScreen(),
      routes: [
        GoRoute(path: 'novo', builder: ... EventFormScreen create),
        GoRoute(path: ':eventId', builder: ... EventDetailScreen,
          routes: [
            GoRoute(path: 'editar', builder: ... EventFormScreen edit),
          ],
        ),
      ],
    ),
    GoRoute(path: '/equipe', ... existing MembersScreen ...),
  ],
)
```

Atualizar redirect autenticado: `return '/agenda'`.  
Manter `/home` → redirect `/agenda` para não quebrar links antigos.  
Preservar `/equipe/membros/...`, convites, etc. fora ou dentro do shell conforme já funciona (convites podem ficar sem bottom bar via rotas irmãs).

---

### Task 7: Formulário e detalhe do culto

**Files:**
- Create: `app/lib/features/events/presentation/event_form_screen.dart`
- Create: `app/lib/features/events/presentation/event_detail_screen.dart`

- [ ] **Step 1: EventFormScreen**

`FormScaffold` + campos: título, date/time culto, date/time ensaio (opcional, clearável), local, notas, paleta (`hintText: 'Preto e dourado'`).  
Pickers: `showDatePicker` / `showTimePicker` com locale `pt_BR`.  
Montar `DateTime` no timezone da equipe e enviar `toUtc().toIso8601String()`.  
Salvar: create ou update; invalidar providers; `context.pop`.  
Erros: `FormErrorBanner` com `ApiException.message`.

- [ ] **Step 2: EventDetailScreen**

Mostrar título, data/hora culto, ensaio, local, notas, paleta.  
Seções placeholder:
- "Equipe escalada — em breve"
- "Musicas — em breve"  
AppBar: editar (LEADER+) → form; excluir com diálogo de confirmação.  
Usar `eventProvider(eventId)`.

---

### Task 8: Verificação final

- [ ] **Step 1: Backend**

```
docker compose exec api npx tsc --noEmit -p tsconfig.json
```
Repetir curls da Task 3 se ainda não rodaram nesta sessão; colar saídas.

- [ ] **Step 2: App**

```
$env:PATH = 'C:\Users\Acer\flutter\bin;' + $env:PATH
cd app
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:3000
```
Expected: analyze "No issues found!"; tests pass; APK gera.

- [ ] **Step 3: Relatório**

Listar o que passou e o que **não** foi verificado (ex.: UI no emulador, conta MEMBER se não houver).

---

## Self-review (plano vs spec)

| Spec | Task |
|---|---|
| Guard estendido teamId/eventId + 404 | Task 1 |
| CRUD rotas mistas | Tasks 2–3 |
| scope/limit, ordenação | Task 2 |
| REHEARSAL_AFTER_START no service | Task 2 |
| status PUBLISHED, sem duplicate | Task 2 |
| assignments/songs [] | Task 2 |
| Agenda + BottomNav + form + detalhe | Tasks 6–7 |
| Formatação pt_BR + testes | Task 4 |
| curl + analyze + test + APK | Tasks 3, 8 |

Sem placeholders TBD. `UpdateEventDto.rehearsalAt: null` limpa ensaio — comportamento explícito.
