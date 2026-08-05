# Task 3 — Controller, Module e registro

## Implementação

- Criados `EventsController` e `EventsModule`.
- Registrado `EventsModule` em `AppModule`.
- Todas as rotas usam `TeamMemberGuard`; POST, PATCH e DELETE restringem a `OWNER` e `LEADER`.
- A listagem aplica `scope ?? 'upcoming'` e `limit ?? 20`; DELETE responde 204.

## Compilação e rotas

`docker compose exec api npx tsc --noEmit -p tsconfig.json` concluiu sem erros.

O log do Nest confirmou:

```text
Mapped {/api/v1/teams/:teamId/events, POST} route
Mapped {/api/v1/teams/:teamId/events, GET} route
Mapped {/api/v1/events/:eventId, GET} route
Mapped {/api/v1/events/:eventId, PATCH} route
Mapped {/api/v1/events/:eventId, DELETE} route
```

## Saídas reais do curl.exe

```text
CREATE 201
{"id":"4e1c31b4-7543-4266-9e35-b642a998d1e6","teamId":"10beae0f-7286-48e0-bb06-af0a3d79d88f","title":"Culto Task 3","startsAt":"2026-08-10T12:00:00.000Z","rehearsalAt":"2026-08-09T22:00:00.000Z","location":null,"notes":null,"colorPalette":"Preto e dourado","status":"PUBLISHED","createdAt":"2026-08-05T20:50:13.516Z","updatedAt":"2026-08-05T20:50:13.516Z","timezone":"America/Sao_Paulo","assignments":[],"songs":[]}

BAD 400
{"statusCode":400,"code":"REHEARSAL_AFTER_START","message":"O ensaio precisa ser antes ou no mesmo horario do culto.","path":"/api/v1/teams/10beae0f-7286-48e0-bb06-af0a3d79d88f/events","timestamp":"2026-08-05T20:50:13.595Z"}

LIST 200
[{"id":"4e1c31b4-7543-4266-9e35-b642a998d1e6","teamId":"10beae0f-7286-48e0-bb06-af0a3d79d88f","title":"Culto Task 3","startsAt":"2026-08-10T12:00:00.000Z","rehearsalAt":"2026-08-09T22:00:00.000Z","location":null,"notes":null,"colorPalette":"Preto e dourado","status":"PUBLISHED","createdAt":"2026-08-05T20:50:13.516Z","updatedAt":"2026-08-05T20:50:13.516Z","timezone":"America/Sao_Paulo","assignments":[],"songs":[]}]

DETAIL 200
{"id":"4e1c31b4-7543-4266-9e35-b642a998d1e6","teamId":"10beae0f-7286-48e0-bb06-af0a3d79d88f","title":"Culto Task 3","startsAt":"2026-08-10T12:00:00.000Z","rehearsalAt":"2026-08-09T22:00:00.000Z","location":null,"notes":null,"colorPalette":"Preto e dourado","status":"PUBLISHED","createdAt":"2026-08-05T20:50:13.516Z","updatedAt":"2026-08-05T20:50:13.516Z","timezone":"America/Sao_Paulo","assignments":[],"songs":[]}

RANDOM 404
{"statusCode":404,"code":"NOT_FOUND","message":"Culto nao encontrado.","path":"/api/v1/events/00000000-0000-4000-8000-000000000000","timestamp":"2026-08-05T20:50:13.793Z"}

FOREIGN 404
{"statusCode":404,"code":"NOT_FOUND","message":"Equipe nao encontrada.","path":"/api/v1/events/303c145a-302b-4f58-b4d3-b7b3c45f5cbe","timestamp":"2026-08-05T20:50:14.150Z"}

MEMBER_POST 403
{"statusCode":403,"code":"FORBIDDEN","message":"Voce nao tem permissao para fazer isso nesta equipe.","path":"/api/v1/teams/10beae0f-7286-48e0-bb06-af0a3d79d88f/events","timestamp":"2026-08-05T20:50:14.469Z"}

DELETE 204
```

## Observações

- O teste MEMBER criou uma conta temporária, aceitou convite de uso único e confirmou 403 no POST.
- O teste de evento estrangeiro criou uma equipe externa e confirmou 404 para o dono da equipe original.
- Não há infraestrutura de testes automatizados configurada no `backend/package.json`; a validação desta tarefa foi feita por typecheck e curl.exe.
