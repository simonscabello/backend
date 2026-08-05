# Task 2 Report — DTOs e EventsService

## Status

**Concluída.** Arquivos criados e typecheck passou sem erros.

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `backend/src/modules/events/dto/event.dto.ts` | `CreateEventDto`, `UpdateEventDto`, `ListEventsQueryDto` |
| `backend/src/modules/events/events.service.ts` | `EventsService` com CRUD + validação de ensaio |

## Implementação

### DTOs

- `CreateEventDto`: title, startsAt, rehearsalAt opcional, location, notes, colorPalette — com `@Transform(trim)` e mensagens em português.
- `UpdateEventDto`: campos opcionais; `rehearsalAt`, `location`, `notes`, `colorPalette` aceitam `null` para limpar; `@ValidateIf` em `rehearsalAt` para permitir `null`.
- `ListEventsQueryDto`: `scope` (`upcoming`|`past`, default `upcoming`), `limit` (1–100, default 20).

### EventsService

| Método | Comportamento |
|--------|---------------|
| `create(teamId, createdById, dto)` | Valida ensaio, cria com `status: 'PUBLISHED'`, retorna `toPublic` |
| `list(teamId, scope, limit)` | Filtra por `startsAt` vs `now`, ordena asc/desc conforme scope |
| `findOne(eventId)` | 404 se ausente |
| `update(eventId, dto)` | Merge parcial; `rehearsalAt: null` limpa ensaio; revalida ensaio |
| `remove(eventId)` | Delete; 404 em falha (registro inexistente) |

### Regras de negócio

- **`REHEARSAL_AFTER_START`**: `BadRequestException` 400 quando `rehearsalAt > startsAt`.
- **`toPublic`**: inclui `timezone` da equipe, `assignments: []`, `songs: []`, datas em ISO string.
- **Status**: sempre `PUBLISHED` na criação (sem migration).

### Convenções seguidas

- Padrão de `BadRequestException({ code, message })` como em `memberships.service.ts`.
- `PrismaService` injetado; sem controller/module (Task 3).
- Guard clause em `findOne`/`update`; lógica de `rehearsalAt` no update sem ternário aninhado.

## Verificação

```bash
docker compose exec api npx tsc --noEmit -p tsconfig.json
# Exit code: 0 — sem erros
```

- Linter IDE: sem issues nos arquivos novos.
- **Não testado via curl** — controller ainda não existe (Task 3).
- **Sem commit** — conforme instrução.

## Self-review

| Critério | OK? |
|----------|-----|
| DTOs conforme skeleton do brief | Sim |
| Códigos de erro verbatim (`REHEARSAL_AFTER_START`) | Sim |
| `toPublic` com assignments/songs/timezone | Sim |
| Sem migration | Sim |
| Sem controller/module/app.module | Sim |
| Typecheck Docker | Sim |

## Observações para Task 3

- Controller deve aplicar default `dto.scope ?? 'upcoming'` e `dto.limit ?? 20` se ValidationPipe não propagar defaults de propriedade.
- `create` recebe `createdById = membership.id` do guard.
- `remove` retorna void/204 — service não retorna corpo.

## Commits

N/A (não solicitado).
