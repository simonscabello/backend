# Etapa 4 — Cultos (design)

Data: 2026-08-05  
Escopo: backend + app. Sem migration nova (schema Prisma já tem `events`).

## Objetivo

O líder cadastra cultos; a agenda vira a tela principal pós-login. Escala e músicas ficam reservadas no detalhe (etapas 5 e 6).

## Decisão de autorização

Estender o `TeamMemberGuard` existente:

1. Se a rota tem `:teamId`, resolve membership como hoje.
2. Senão, se tem `:eventId`, busca o evento, obtém `teamId`, e segue o mesmo fluxo.
3. Sem membership ativo → **404** (nunca 403 por isolamentoimento).
4. `@TeamRoles` continua funcionando.
5. Sem `:teamId` nem `:eventId` → erro interno (como hoje).

Justificativa: alinha com `ARQUITETURA-MVP.md` (lista em `/teams/:teamId/events`, detalhe em `/events/:eventId`) e prepara as rotas das etapas 5–6 sem duplicar guard.

## Backend

Módulo `src/modules/events/` (controller → service → Prisma).

| Método | Rota | Quem | Comportamento |
|---|---|---|---|
| POST | `/teams/:teamId/events` | LEADER+ | Cria culto |
| GET | `/teams/:teamId/events` | membro | Agenda com `scope` e `limit` |
| GET | `/events/:eventId` | membro | Detalhe do culto |
| PATCH | `/events/:eventId` | LEADER+ | Edita |
| DELETE | `/events/:eventId` | LEADER+ | Exclui (cascata em assignments/event_songs via Prisma) |

Fora do escopo: `POST .../duplicate` (Etapa 7).

### Campos de criação/edição

- `title` (obrigatório)
- `startsAt` (obrigatório, ISO UTC)
- `rehearsalAt` (opcional)
- `location` (opcional)
- `notes` (opcional)
- `colorPalette` (opcional, texto livre)

`status` sempre `PUBLISHED` no MVP (coluna existe; rascunho não entra).

### Lista (agenda)

- Query: `scope=upcoming|past` (obrigatório ou default `upcoming`), `limit` (default 20, máximo razoável ex. 100).
- `upcoming`: `startsAt >= now` (UTC), ordem crescente.
- `past`: `startsAt < now`, ordem decrescente.
- Filtros `from`/`to` do documento de arquitetura: **não** nesta etapa (o prompt pede só `scope` + `limit`).

### Validação — regra 12

Validar no **service**: se `rehearsalAt` presente, deve ser `<= startsAt`.  
Código de erro: `REHEARSAL_AFTER_START`.  
Não adicionar CHECK no banco nesta etapa (evita migration só para isso; o CHECK do doc nunca foi criado).

Datas: gravar e devolver em UTC (`timestamptz`). Exibição no app usa `team.timezone`.

### Resposta do detalhe (Etapa 4)

Dados do culto + metadados úteis ao app (`teamId`, timezone da equipe se conveniente).  
Slots para escalação e músicas: arrays vazios ou omitidos até as etapas 5–6 — preferir campos estáveis `assignments: []` e `songs: []` para o app não mudar o contrato depois.

### Erros

| Situação | HTTP | code |
|---|---|---|
| Não membro / evento inexistente | 404 | (padrão Nest / mensagem PT) |
| MEMBER tenta criar/editar/excluir | 403 | (Forbidden padrão do guard) |
| Ensaio depois do culto | 400 | `REHEARSAL_AFTER_START` |

Mensagens ao usuário em português.

## App

Feature `lib/features/events/{data,domain,presentation}`.

### Navegação

- `BottomNavigationBar`: Agenda | Equipe.
- Pós-login redireciona para Agenda (substitui home provisória).
- Logout e rotas de equipe/convites preservados; `redirect` do `go_router` intacto.

### Telas

1. **Agenda** — próximo culto em destaque; lista dos demais; filtro/abas próximos | passados; FAB `+` para LEADER+; estado vazio: "Nenhum culto cadastrado. Toque em + para criar o primeiro."
2. **Formulário** — date/time culto e ensaio, local, notas, paleta (`hintText`: "Preto e dourado"); criar e editar.
3. **Detalhe** — dados do culto, observações, paleta; seções reservadas para equipe escalada e músicas.

### Formatação

- Dia da semana, data, horários em português (`intl` já com `pt_BR`).
- Converter UTC → timezone da equipe ativa para exibição.
- Nunca persistir horário “local” sem timezone; envio à API sempre ISO UTC.

### Camada de dados

- Modelos escritos à mão com `fromJson`.
- `EventRepository` com `_guard` → `ApiException`.
- Providers Riverpod no padrão existente (`family` por `teamId` / `eventId`).

## Testes e verificação

**Backend (curl):** caminho feliz (criar, listar upcoming/past, detalhe, editar, excluir); ensaio depois do culto; evento de outra equipe (404); MEMBER sem permissão (403).

**App:** testes de mapeamento de datas e formatação em português; `flutter analyze` limpo; `flutter test` passa; APK release compila.

**Typecheck:** `docker compose exec api npx tsc --noEmit -p tsconfig.json`.

Relatar o que não foi verificado.

## Fora de escopo

- Duplicar culto, compartilhar escala, cache offline, acentos globais (Etapa 7).
- Escalação e setlist (etapas 5–6).
- Migration / CHECK no Postgres.
- freezed, build_runner, CQRS, reescrita dos guards além da extensão acordada.
