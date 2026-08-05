# Task 5 — EventRepository e providers

## Status

Concluída sem commits.

## Implementação

Arquivo criado: `app/lib/features/events/data/event_repository.dart`

- `EventRepository` com `_guard` + `ApiException.fromDio`, espelhando `TeamRepository`.
- Métodos: `list`, `find`, `create`, `update`, `remove`.
- Rotas: `/teams/$teamId/events` (list/create), `/events/$eventId` (find/update/remove).
- Providers: `eventRepositoryProvider`, `eventsProvider` (family com record `EventsQuery`), `eventProvider`.

## Self-review

- Padrão de imports, Dio e Riverpod alinhado a `team_repository.dart` e `invite_repository.dart`.
- `Event.fromJson` reutilizado do domínio; sem modelos duplicados.
- `create` omite campos opcionais vazios; `update` envia apenas campos alterados.
- `removeRehearsalAt` permite limpar ensaio via `PATCH` com `rehearsalAt: null` (contrato do backend).
- Record `(teamId, scope)` como chave do `eventsProvider` — equality estrutural do Dart 3.

## Verificações

- `flutter analyze lib/features/events/data/event_repository.dart`: `No issues found!`
- `flutter test`: não executado (fora do escopo desta tarefa).

## Pendências e preocupações

- `update` não distingue “não enviar” vs “limpar” para `location`, `notes` e `colorPalette` — só `rehearsalAt` tem flag explícita; o form (Task 6) pode precisar estender isso.
- Providers ainda não consumidos pelas telas (Tasks 6–7).
