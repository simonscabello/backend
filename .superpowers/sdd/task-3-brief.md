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

- [ ] **Step 4: curl â€” caminho feliz e erros**

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

# 3) Ensaio depois do culto â†’ 400 REHEARSAL_AFTER_START
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

# 6) Evento UUID aleatorio â†’ 404
curl -s -o /tmp/404.json -w "%{http_code}" \
  "http://localhost:3000/api/v1/events/00000000-0000-4000-8000-000000000000" \
  -H "Authorization: Bearer $TOKEN"

# 7) MEMBER sem permissao: usar conta MEMBER da equipe se existir; senÃ£o criar membro+login e esperar 403 no POST
```

Mostrar saÃ­das reais no relatÃ³rio final. No PowerShell, usar `curl.exe` ou equivalente e extrair JSON com o que estiver disponÃ­vel.

---
