# Sistema de Escalas de Louvor — Análise de Arquitetura (MVP)

> Documento de decisão anterior à implementação. Fonte da verdade para o escopo do MVP.
> Data: 2026-08-05

---

## 1. O problema real

O problema declarado é "organizar escalas". O problema real, observado em praticamente toda equipe de louvor, é:

1. **A escala vive no WhatsApp e some.** Alguém manda uma imagem no grupo; três dias depois ninguém acha. Não existe uma "fonte da verdade".
2. **Quem toca o quê fica implícito.** "Domingo de manhã é você" — mas no violão ou no vocal?
3. **O ensaio é uma informação separada da escala** e costuma se perder.
4. **A lista de músicas muda até a última hora** e nem todos ficam sabendo.
5. **O líder refaz trabalho manual toda semana**, quase sempre copiando a escala anterior.

Consequência prática para o produto: **o valor do MVP não está no CRUD, está na tela de leitura da escala.** O membro abre o app, vê "Domingo 09h — você, guitarra. Ensaio sábado 19h. 5 músicas." em 2 segundos. Todo o resto (cadastros, convites, backend) existe para viabilizar essa tela.

Métrica de sucesso do teste na igreja: **a escala da semana deixou de ser postada como imagem no grupo.** Se continuarem postando a imagem, o MVP falhou, mesmo que tudo funcione.

### Não-objetivos do MVP
Escalação automática/sugestão inteligente, controle de disponibilidade, cifras/tonalidades avançadas, anexos de áudio, multi-ministério (mídia, recepção), relatórios, notificações push, web app, publicação em lojas.

---

## 2. Entidades principais

| Entidade | Papel no domínio |
|---|---|
| **User** | Conta de acesso (e-mail + senha). Independente de equipe. |
| **Team** | A equipe de louvor (na prática, a igreja). Fronteira de isolamento de todos os dados. |
| **Membership** | Vínculo User ↔ Team, com papel administrativo e nome de exibição. **Pode existir sem User** (membro cadastrado pelo líder que ainda não instalou o app). |
| **Position** | Função/instrumento (Vocalista, Bateria, Baixo, Guitarra, Teclado, Violão). Catálogo por equipe, extensível. |
| **MembershipPosition** | Funções que um membro *sabe* exercer (N:N). |
| **Invite** | Convite por link/código. Pode ser genérico ou vinculado a um Membership específico. |
| **Event** | O culto/evento. Entidade central. Data, horário do culto, horário do ensaio, paleta, observações. |
| **Assignment** | Escalação: quem toca o quê neste evento (Event × Membership × Position). |
| **Song** | Música do repertório da equipe. Estrutura mínima. |
| **EventSong** | Música dentro de um evento, com ordem e tom opcional. |

### Decisões de modelagem que merecem destaque

**a) `Membership.user_id` é nullable.**
O líder precisa cadastrar a equipe inteira na primeira sessão e criar a escala imediatamente — não dá para esperar todo mundo instalar o app. Portanto o membro existe primeiro como *placeholder* (só nome + funções) e depois é "reivindicado" por uma conta via convite individual. Isso custa uma coluna nullable agora; sem isso, o produto não sobrevive ao primeiro dia de uso real.

**b) O catálogo de `Position` é por equipe, com seed automático na criação.**
Alternativa seria um catálogo global imutável. Por equipe é melhor: permite renomear ("Teclado" → "Piano"), desativar o que não se usa e adicionar "Sax", "Cajon", "Ministração" sem migration. Custo: 6 linhas inseridas ao criar a equipe.

**c) Membro pode ter várias funções, inclusive no mesmo culto.**
Violonista que também canta é a regra, não a exceção. `Assignment` é (evento, membro, função) — o mesmo membro pode aparecer duas vezes com funções diferentes. Também não limito uma pessoa por função (duas vocalistas, dois violões).

**d) Ensaio é campo do evento, não entidade.**
`rehearsal_at` (timestamptz, nullable) resolve 100% dos casos reais, inclusive ensaio em outro dia. Se um dia precisarem de múltiplos ensaios por culto, promove-se para tabela — a migration é trivial e não vale antecipar.

**e) Datas em `timestamptz`, timezone no Team.**
Guarda-se UTC; o `Team.timezone` (`America/Sao_Paulo`) define a renderização. Evita a classe inteira de bugs de "o culto aparece 3h mais tarde".

**f) `color_palette` como texto livre no evento.** *(decidido)*
Campo de texto simples — "Preto e dourado", "Social branco". O app apenas exibe junto às observações. Virar JSONB ou tabela depois é uma migration trivial; antecipar estrutura aqui não pagaria.

---

## 3. Estrutura do banco (PostgreSQL)

### Escolha: PostgreSQL, não MySQL

Justificativa curta e honesta — para o volume deste MVP os dois funcionam igualmente bem; a escolha é por **para onde o produto vai**:

- **JSONB de verdade.** Paleta de cores agora, e principalmente metadados de música vindos de uma base externa depois (o usuário já sinalizou essa intenção). O JSON do MySQL é funcional, mas o JSONB com índices GIN é outra categoria.
- **Busca textual nativa.** Quando o repertório crescer, `tsvector` + `unaccent` resolve busca de música com acento e sem acento dentro do próprio banco, sem subir um Elasticsearch.
- **`ENUM`, `CHECK`, índices parciais e `UNIQUE` com expressão** funcionam bem e são usados de fato no schema abaixo (ex.: um único OWNER ativo por equipe).
- **Ecossistema NestJS.** Prisma e TypeORM tratam Postgres como cidadão de primeira classe; recursos avançados de migration e tipos chegam antes e com menos arestas.
- **Hospedagem barata.** Neon, Supabase, Railway e Render têm tiers gratuitos/baratos de Postgres. O deploy do MVP para teste real na igreja fica mais simples e barato.
- **Não há nada em MySQL** que este projeto precise e o Postgres não tenha.

Imagem: `postgres:16-alpine`.

### ORM: Prisma

Recomendação: **Prisma**. Migrations declarativas e previsíveis, tipagem end-to-end, `prisma studio` para inspecionar dados durante o desenvolvimento (útil demais em MVP), e schema legível como documentação viva. TypeORM é mais "nativo" ao Nest e tem decorators mais familiares, mas seu histórico de migrations e de comportamento de `synchronize` gera mais retrabalho.

Ponto de atenção com Docker no Windows: os engines do Prisma são binários por plataforma. O `node_modules` **não** pode ser compartilhado entre host e container — resolvido com volume anônimo no compose (ver §7).

### Schema

```
users
  id                    uuid pk
  name                  text not null
  email                 citext not null unique
  password_hash         text not null
  must_change_password  bool not null default false   -- após reset pelo OWNER
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null

teams
  id              uuid pk
  name            text not null
  timezone        text not null default 'America/Sao_Paulo'
  created_by      uuid fk -> users.id
  created_at, updated_at

memberships
  id              uuid pk
  team_id         uuid fk -> teams.id            on delete cascade
  user_id         uuid fk -> users.id  NULL      -- placeholder até ser reivindicado
  display_name    text not null                  -- nome dentro da equipe
  role            enum('OWNER','LEADER','MEMBER') not null default 'MEMBER'
  status          enum('ACTIVE','REMOVED')       not null default 'ACTIVE'
  phone           text NULL
  joined_at       timestamptz NULL
  created_at, updated_at
  UNIQUE (team_id, user_id) WHERE user_id IS NOT NULL
  UNIQUE (team_id) WHERE role = 'OWNER' AND status = 'ACTIVE'
  INDEX (team_id, status)

positions                                        -- funções / instrumentos
  id              uuid pk
  team_id         uuid fk -> teams.id            on delete cascade
  name            text not null                  -- 'Vocalista', 'Guitarra'
  category        enum('VOCAL','INSTRUMENT','OTHER') not null
  sort_order      int not null default 0
  is_active       bool not null default true
  UNIQUE (team_id, name)

membership_positions                             -- o que o membro sabe fazer
  membership_id   uuid fk -> memberships.id      on delete cascade
  position_id     uuid fk -> positions.id        on delete cascade
  PRIMARY KEY (membership_id, position_id)

invites
  id              uuid pk
  team_id         uuid fk -> teams.id            on delete cascade
  membership_id   uuid fk -> memberships.id NULL -- convite individual (claim de placeholder)
  code            text not null unique           -- >= 96 bits de entropia
  created_by      uuid fk -> memberships.id
  expires_at      timestamptz not null
  max_uses        int NULL                       -- null = ilimitado
  uses            int not null default 0
  revoked_at      timestamptz NULL
  created_at

events                                           -- culto / evento
  id              uuid pk
  team_id         uuid fk -> teams.id            on delete cascade
  title           text not null                  -- 'Culto de Domingo (manhã)'
  starts_at       timestamptz not null           -- horário do culto
  rehearsal_at    timestamptz NULL               -- horário do ensaio
  location        text NULL
  notes           text NULL                      -- observações livres
  color_palette   text NULL                      -- texto livre: 'Preto e dourado'
  status          enum('DRAFT','PUBLISHED') not null default 'PUBLISHED'
  created_by      uuid fk -> memberships.id
  created_at, updated_at
  INDEX (team_id, starts_at)
  CHECK (rehearsal_at IS NULL OR rehearsal_at <= starts_at)

assignments                                      -- a escala propriamente dita
  id              uuid pk
  event_id        uuid fk -> events.id           on delete cascade
  membership_id   uuid fk -> memberships.id      on delete cascade
  position_id     uuid fk -> positions.id        on delete restrict
  note            text NULL
  created_at
  UNIQUE (event_id, membership_id, position_id)
  INDEX (event_id)
  INDEX (membership_id)

songs
  id              uuid pk
  team_id         uuid fk -> teams.id            on delete cascade
  title           text not null
  artist          text NULL
  default_key     text NULL                      -- 'G', 'Am'
  reference_url   text NULL                      -- YouTube/Spotify por enquanto
  external_id     text NULL                      -- gancho p/ base de músicas futura
  external_source text NULL
  is_archived     bool not null default false
  created_at, updated_at
  UNIQUE (team_id, lower(title), coalesce(lower(artist),''))

event_songs
  id              uuid pk
  event_id        uuid fk -> events.id           on delete cascade
  song_id         uuid fk -> songs.id            on delete restrict
  position        int not null                   -- ordem no repertório
  key_override    text NULL
  note            text NULL
  UNIQUE (event_id, song_id)
  INDEX (event_id, position)

refresh_tokens
  id              uuid pk
  user_id         uuid fk -> users.id            on delete cascade
  token_hash      text not null
  expires_at      timestamptz not null
  revoked_at      timestamptz NULL
  created_at
```

### Relacionamentos (resumo)

```
User 1 ──── N Membership N ──── 1 Team
                  │
                  ├── N MembershipPosition N ── Position ──N──1 Team
                  │
                  └── N Assignment N ── 1 Event ──N──1 Team
                             │
                             └── 1 Position

Event 1 ── N EventSong N ── 1 Song ──N──1 Team
Team  1 ── N Invite (0..1 Membership)
```

Regra estrutural: **tudo pendura em `Team`.** Nenhuma consulta atravessa equipes.

---

## 4. Arquitetura do backend (NestJS)

Módulos por feature, três camadas (`controller → service → prisma`). **Sem** CQRS, event bus, repositórios genéricos ou DDD tático — nada disso paga o próprio custo em um MVP deste tamanho, e todos são adicionáveis depois sem reescrever.

```
backend/
├─ docker/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/
│  │  ├─ decorators/        CurrentUser, CurrentMembership, TeamRoles
│  │  ├─ guards/            JwtAuthGuard, TeamMemberGuard, TeamRoleGuard
│  │  ├─ filters/           HttpExceptionFilter (formato de erro único)
│  │  ├─ interceptors/      LoggingInterceptor
│  │  └─ pipes/             ValidationPipe global (whitelist + transform)
│  ├─ config/               ConfigModule + validação de env (zod/joi)
│  ├─ prisma/               PrismaModule, PrismaService
│  └─ modules/
│     ├─ auth/              register, login, refresh, logout
│     ├─ users/             perfil próprio
│     ├─ teams/             criar equipe, dados da equipe
│     ├─ memberships/       membros, papéis, funções do membro
│     ├─ positions/         catálogo de funções/instrumentos
│     ├─ invites/           gerar, listar, revogar, aceitar
│     ├─ events/            CRUD de cultos + view da escala
│     ├─ assignments/       escalação (bulk)
│     └─ songs/             repertório + setlist do evento
└─ test/
```

**Ponto central: `TeamMemberGuard`.** Toda rota escopada carrega `:teamId` (ou resolve o team a partir de `:eventId`). O guard carrega o `Membership` ativo do usuário naquela equipe, injeta em `req.membership` e devolve 404 (não 403) se não houver — não vaza a existência de equipes alheias. `TeamRoleGuard` complementa com `@TeamRoles('OWNER','LEADER')`.

Transversais: `@nestjs/config` com validação de env no boot, `class-validator` + `ValidationPipe({ whitelist: true, transform: true })`, `@nestjs/throttler` em `/auth/*` e `/invites/*/accept`, `helmet`, CORS liberado só para o necessário, Swagger em `/docs` apenas fora de produção, `/health` para o healthcheck do compose.

**Auth:** JWT de acesso (1h) + refresh token opaco persistido com hash (60 dias, rotativo). O app mobile precisa de sessão longa; refresh token permite revogação e é ~40 linhas de código. Senha com `argon2` (ou `bcrypt` cost 12).

---

## 5. Estrutura do app Flutter

Feature-first, espelhando os módulos do backend.

```
app/
├─ lib/
│  ├─ main.dart
│  ├─ core/
│  │  ├─ config/          AppConfig (API_BASE_URL via --dart-define)
│  │  ├─ network/         DioClient, AuthInterceptor (refresh automático), ApiException
│  │  ├─ storage/         SecureStorage (tokens), Prefs (equipe ativa)
│  │  ├─ router/          go_router + redirect por estado de auth
│  │  └─ theme/           tema, cores, tipografia
│  ├─ shared/             widgets reutilizáveis, formatadores de data
│  └─ features/
│     ├─ auth/            {data, domain, presentation}
│     ├─ onboarding/      criar equipe | entrar com convite
│     ├─ team/            membros, funções, convites
│     ├─ events/          lista (agenda) + detalhe (a escala) + form
│     ├─ assignments/     seletor de escalação
│     └─ songs/           repertório + setlist
└─ test/
```

**Stack:** `flutter_riverpod` (estado + injeção), `go_router` (navegação + guarda de rota), `dio` (HTTP), `flutter_secure_storage` (tokens), `freezed` + `json_serializable` (modelos), `intl` (datas em pt_BR).

Por que Riverpod e não Bloc: menos boilerplate para o tamanho do app, e `AsyncValue` cobre loading/erro/dados sem cerimônia.

**Cache offline:** fora do MVP. Mitigação barata e suficiente: manter o último JSON da lista de eventos e do evento aberto em `shared_preferences` e exibi-lo com um selo "atualizado às HH:mm" quando a rede falhar. Sem SQLite, sem sincronização.

---

## 6. Endpoints da API

Prefixo `/api/v1`. Autenticado salvo indicação contrária.

### Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | público — cria conta, devolve tokens |
| POST | `/auth/login` | público |
| POST | `/auth/refresh` | público (usa refresh token) |
| POST | `/auth/logout` | revoga o refresh token |
| GET | `/auth/me` | usuário + equipes das quais participa |

### Equipes e membros
| Método | Rota | Descrição |
|---|---|---|
| POST | `/teams` | cria equipe (criador vira OWNER) + seed de posições |
| GET | `/teams/:teamId` | dados da equipe |
| PATCH | `/teams/:teamId` | LEADER+ |
| GET | `/teams/:teamId/members` | lista com funções e status |
| POST | `/teams/:teamId/members` | LEADER+ — cria membro placeholder (sem conta) |
| PATCH | `/teams/:teamId/members/:id` | LEADER+ — nome, papel, funções |
| DELETE | `/teams/:teamId/members/:id` | LEADER+ — soft remove (`status=REMOVED`) |
| POST | `/teams/:teamId/members/:id/reset-password` | **OWNER** — gera senha temporária (exibida uma única vez) |
| POST | `/auth/change-password` | troca a própria senha (obrigatória se `must_change_password`) |

### Funções / instrumentos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/teams/:teamId/positions` | |
| POST | `/teams/:teamId/positions` | LEADER+ |
| PATCH | `/teams/:teamId/positions/:id` | LEADER+ (renomear, ordenar, desativar) |

### Convites
| Método | Rota | Descrição |
|---|---|---|
| POST | `/teams/:teamId/invites` | LEADER+ — `{ membershipId? }` → `{ code, url, expiresAt }` |
| GET | `/teams/:teamId/invites` | LEADER+ |
| DELETE | `/teams/:teamId/invites/:id` | LEADER+ — revoga |
| GET | `/invites/:code` | **público** — preview: nome da equipe, quem convidou |
| POST | `/invites/accept` | autenticado — código **no corpo**, não na URL: assim ele não vai parar em log de acesso, histórico de proxy nem no Referer |

### Eventos (cultos)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/teams/:teamId/events` | LEADER+ |
| GET | `/teams/:teamId/events?from&to&scope=upcoming\|past` | agenda |
| GET | `/events/:eventId` | **a escala completa**: evento + assignments + músicas |
| PATCH | `/events/:eventId` | LEADER+ |
| DELETE | `/events/:eventId` | LEADER+ |
| POST | `/events/:eventId/duplicate` | LEADER+ — copia escalação e repertório para nova data |

### Escalação
| Método | Rota | Descrição |
|---|---|---|
| PUT | `/events/:eventId/assignments` | LEADER+ — substitui a lista inteira, em transação |

Bulk (`PUT` com o array completo) em vez de POST/DELETE item a item: a tela de escalação é um formulário único, salvo de uma vez. Menos round-trips, menos estados intermediários inconsistentes.

### Músicas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/teams/:teamId/songs?search=` | repertório |
| POST | `/teams/:teamId/songs` | |
| PATCH | `/teams/:teamId/songs/:id` | |
| PUT | `/events/:eventId/songs` | LEADER+ — setlist ordenada, bulk |

`GET /events/:eventId` é o endpoint mais importante da API: devolve tudo que a tela da escala precisa em **uma** chamada.

---

## 7. Regras de negócio

**Isolamento e permissões**
1. Todo recurso pertence a exatamente uma equipe; acesso exige `Membership` ativo. Sem membership → 404.
2. Papéis: `OWNER` (1 por equipe, transferível), `LEADER` (mesmos poderes operacionais), `MEMBER` (leitura + edição do próprio perfil).
3. O último `OWNER` ativo não pode ser removido nem rebaixado sem transferir a posse.
4. Um usuário pode participar de várias equipes; o app mantém uma "equipe ativa".

**Convites**
5. Código de 20 caracteres em **base32 de Crockford** (sem I, L, O e U), 100 bits de entropia, exibido em grupos de 5. A normalização aceita minúsculas, hífens, espaços e as trocas clássicas (I/L→1, O→0) — o código é lido em voz alta e digitado à mão. Expiração padrão de 7 dias, `max_uses` opcional, revogável.
6. Aceitar convite já sendo membro é **idempotente** (200, sem duplicar) — inclusive quando o convite já expirou ou esgotou. A checagem de "já é membro" vem **antes** da validação de validade, senão tocar no link duas vezes ou reinstalar o app vira erro.
7. Convite individual (`membership_id` presente) só pode ser aceito se aquele membership ainda não tiver `user_id`; ao aceitar, vincula a conta e preserva funções e histórico de escalas do placeholder.
8. Convite expirado/revogado/esgotado → 410 Gone com mensagem clara.

**Membros e funções**
9. `display_name` é obrigatório e independente do nome da conta (apelidos são a norma).
10. Remover membro é *soft* (`status=REMOVED`): escalas passadas continuam íntegras. Escalações **futuras** são removidas na mesma transação.
11. Desativar uma `Position` não apaga assignments existentes; ela apenas some dos seletores.

**Eventos**
12. `starts_at` obrigatório; `rehearsal_at` opcional e, se presente, `<= starts_at`.
13. Datas gravadas em UTC; exibição pelo `timezone` da equipe.
14. Excluir evento remove assignments e setlist em cascata (hard delete no MVP).

**Escalação**
15. `membership` e `position` do assignment devem pertencer à mesma equipe do evento.
16. O mesmo membro pode ocupar várias funções no mesmo evento; a mesma função pode ter vários membros.
17. Não se pode escalar membro `REMOVED`.
18. Escalar alguém para uma função que ele não tem em `membership_positions` é **permitido, com aviso** no app — a realidade fura o cadastro toda semana.
19. Mesma pessoa escalada em dois eventos no mesmo dia: permitido, com aviso.

**Músicas**
20. Música pertence à equipe; título+artista únicos por equipe (case-insensitive) para evitar duplicatas óbvias.
21. Música usada em algum evento não pode ser excluída — apenas arquivada.
22. `position` (ordem) do setlist é normalizada no servidor (0..n-1) a cada `PUT`.

**Segurança**
23. E-mail único global, case-insensitive (`citext`).
24. Senha mínima de 8 caracteres, hash `argon2id`.
25. Rate limit em `/auth/login`, `/auth/register` e `/invites/:code/accept`.
26. Nenhum endpoint aceita `teamId` no corpo — sempre pela rota, sempre validado pelo guard.
27. **Reset de senha pelo OWNER** *(decidido — substitui recuperação por e-mail no MVP)*: apenas o `OWNER` da equipe, apenas para membros ativos dela. Gera senha temporária aleatória, retornada **uma única vez** na resposta (nunca persistida em claro), marca `must_change_password=true` e **revoga todos os refresh tokens** do usuário. No próximo login o app força a troca via `/auth/change-password`.
    *Ressalva:* isso dá ao OWNER acesso efetivo à conta do membro, que pode participar de outras equipes. Para uma igreja só, o risco é aceitável; quando houver múltiplas equipes independentes, isto precisa virar recuperação por e-mail. Fica registrado como dívida consciente.

---

## 8. Experiência do usuário e fluxos

### Fluxo A — Líder, primeira vez (meta: escala pronta em < 10 min)
```
Registrar → "Criar equipe" → nome da equipe
  → Tela "Monte sua equipe": adicionar membros (nome + funções), rápido, sem e-mail
  → "Convidar": gera um link por membro, botão Compartilhar → WhatsApp
  → "Novo culto": título, data/hora, ensaio, observações, paleta
  → "Escalar": lista de funções; toca na função, escolhe os membros
  → "Músicas": busca no repertório ou cria na hora
  → "Compartilhar escala" → texto formatado no grupo do WhatsApp (com link)
```
O botão **Compartilhar escala como texto** é o cavalo de Troia do produto: é o que faz a equipe migrar do grupo para o app sem sentir. Vale mais que qualquer notificação push no MVP.

### Fluxo B — Membro recebe o convite
```
Toca no link → página web simples com o código e o nome da equipe
  → "Baixar o app" (APK) / "Já tenho o app"
  → No app: "Entrar com código" → cola/digita o código
  → Cria conta ou faz login → entra na equipe (ou reivindica seu cadastro)
  → Cai direto na próxima escala
```

**Decisão consciente:** sem publicação em loja, deep links (Android App Links) exigem verificação de domínio e dão trabalho desproporcional. O MVP usa **código curto colável** + landing page estática. Custa um passo a mais ao membro e economiza dias de configuração.

### Fluxo C — Membro no dia a dia (95% do uso)
```
Abre o app → Home = próximo evento em destaque:
  "DOM 10/08 · 09h00 — Culto da Manhã"
  "VOCÊ: Guitarra"
  "Ensaio: SÁB 09/08 19h00"
  "Equipe: 6 pessoas"  · "5 músicas"  · Observações
  → toca → escala completa, com nomes por função e a lista de músicas na ordem
```
Regra de ouro da tela: **"onde eu apareço" precisa estar visível sem rolar.**

### Fluxo D — Semana seguinte
```
Lista de eventos → menu do último culto → "Duplicar"
  → nova data → ajusta 2 membros → salva
```
Duplicar é a funcionalidade que mais reduz trabalho do líder por linha de código escrita. Entra no MVP.

---

## 9. Ambiente de desenvolvimento (Windows nativo + Docker no backend)

```
Windows (edição de código, Flutter, Android SDK)
   └── Docker Desktop
        ├── api  (Node 22 + NestJS, hot reload)
        └── db   (PostgreSQL 16, volume persistente)
```

```
cd backend
docker compose up -d     # sobe api + db
```

`backend/compose.yaml` (esboço):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      retries: 10

  api:
    build:
      context: ./backend
      target: development
    command: npm run start:dev
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      CHOKIDAR_USEPOLLING: "true"      # bind mount do Windows não propaga inotify
      CHOKIDAR_INTERVAL: "500"
    ports: ["3000:3000"]
    volumes:
      - ./backend:/app
      - /app/node_modules              # volume anônimo: engines Linux != Windows
    depends_on:
      db: { condition: service_healthy }

volumes:
  pgdata:
```

**Armadilhas do Windows encontradas e resolvidas na etapa 0** (todas verificadas na máquina, não presumidas):

1. **O watcher não vê as alterações.** Bind mount do Windows não entrega eventos inotify ao container. `CHOKIDAR_USEPOLLING` — a receita que circula na internet — **não resolve**: quem observa os arquivos no `nest start --watch` é o watcher do TypeScript, não o chokidar. O que funciona é `watchOptions` com polling em `backend/tsconfig.json`.
2. **O processo antigo não solta a porta 3000.** O engine do Prisma registra seus próprios handlers de sinal e o processo Node passa a **ignorar SIGTERM**; a cada reload o processo anterior sobrevive e o novo morre com `EADDRINUSE`. Resolvido rodando a API sob `nodemon` com `"signal": "SIGKILL"` (`backend/nodemon.json`), com `nest build --watch` compilando em paralelo — mantém a checagem de tipos incremental e garante o restart.
3. **`node_modules` corrompido** — instalar no Windows e montar no container quebra binários nativos (Prisma, argon2). O volume anônimo isola o `node_modules` do container.
4. **Emulador Android não enxerga `localhost`** — dentro do emulador, a API está em `http://10.0.2.2:3000`; em celular físico, no IP LAN da máquina (`http://192.168.x.x:3000`), com a porta 3000 liberada no Firewall do Windows. Configurável por `--dart-define=API_BASE_URL=...`.
5. **`enableShutdownHooks()` só em produção** — em desenvolvimento ele agrava o item 2.

**Armadilhas do Android encontradas na etapa 1:**

6. **O APK de release não fala HTTP em texto claro.** Desde a API 28 o Android bloqueia, e o Flutter só adiciona `usesCleartextTraffic` ao manifesto de *debug* — o build de release falhava com "Nao foi possivel conectar ao servidor" enquanto o debug funcionava. Resolvido com um `network_security_config.xml` que libera texto claro apenas para `10.0.2.2`, `localhost` e `127.0.0.1`; produção (HTTPS no Railway) segue sob a regra estrita.
7. **O armazenamento seguro trabalha na thread principal no Android.** Ler o token do Keystore a cada requisição HTTP é caminho curto para ANR em aparelho lento. O `TokenStorage` mantém os tokens em cache na memória depois da primeira leitura.
8. **Timeout curto no bootstrap desloga quem tinha sessão válida.** Um `timeout(5s)` colocado como rede de segurança na leitura do token derrubou a sessão em aparelho lento. Falhas reais viram exceção e são tratadas; esperar é preferível a deslogar.

Observação: Docker Desktop usa o backend WSL2 internamente, mas isso é transparente — o código fica em `C:\`, é editado no Windows e nenhum comando precisa ser rodado dentro do WSL.

Comandos de rotina (a partir de `backend/`):
```
docker compose up -d
docker compose logs -f api
docker compose exec api npx prisma migrate dev --name <nome>
docker compose exec api npm run seed
docker compose exec api npx prisma studio
```

`.env.example` versionado em `backend/`, `.env` no `.gitignore`. Um `README.md` com o caminho "clonar → copiar .env → subir → seed → rodar o app" em cinco linhas.

---

## 10. Decisões

**Resolvidas em 2026-08-05:**

1. **Paleta de cores → campo de texto livre.** Sem seletor de cores, sem JSON estruturado. O app exibe o texto junto às observações da escala.
2. **Hospedagem → Railway** (backend + PostgreSQL gerenciado). Consequências que já entram no projeto desde a etapa 0: `DATABASE_URL` sempre lida do ambiente (o Railway injeta a sua), `PORT` dinâmica, `sslmode=require` no banco gerenciado, HTTPS e domínio do Railway na allowlist de CORS, e `Dockerfile` multi-stage com alvo `production` além do `development`.
3. **Recuperação de senha → reset pelo OWNER** (regra 27). Sem serviço de e-mail no MVP.
4. **Todas as decisões de modelagem da §2 aprovadas** (placeholder sem conta, catálogo de posições por equipe, ensaio como campo, múltiplas funções por membro).

**Decisões técnicas tomadas (mudáveis, mas com custo):**

5. PostgreSQL + Prisma (§3).
6. Sem cache offline real; apenas último-estado em cache (§5).
7. Sem deep link; código colável + landing estática (§8).
8. Domínio e código em inglês, interface em português.

**Ainda em aberto:**

9. **Confirmação de presença ("aceito/não posso").** Recomendação mantida: **fora da v1**, adicionar logo após o primeiro teste real. O modelo suporta com uma coluna `status` em `assignments`. Decidir depois da etapa 5.

**Riscos assumidos conscientemente:**

10. **Distribuição do APK.** Sem loja, atualizar significa reenviar o arquivo. Mitigação barata: endpoint `/version` e aviso "versão nova disponível" no app. Guarde o keystore de release desde o primeiro build — perdê-lo inviabiliza atualizar sobre a instalação existente.
11. **Sem notificações push.** O compartilhamento em texto para o WhatsApp cobre a lacuna no MVP.
12. **Reset de senha dá ao OWNER acesso à conta do membro** (ver ressalva na regra 27).
13. **Sem auditoria de alterações.** "Quem me tirou da escala?" vai aparecer. Fora do MVP.

---

## 11. Ordem de implementação

Fatias **verticais**: cada etapa entrega backend + app funcionando juntos e testável de ponta a ponta. Nada de "3 semanas de backend antes de ver uma tela".

| Etapa | Entrega | Critério de pronto |
|---|---|---|
| **0 — Fundação** | Pastas `backend/` e `app/` como projetos independentes, compose em `backend/` com api+db, Nest scaffold, Prisma conectado, `/health`, `.env.example`, README. Projeto Flutter criado, Dio + go_router + Riverpod ligados, tela batendo em `/health`. | `cd backend; docker compose up -d` sobe tudo; o app mostra "API ok". |
| **1 — Contas** | Backend: register/login/refresh/me/change-password, guards JWT. App: splash, login, cadastro, sessão persistida, troca de senha obrigatória, logout. | Criar conta no celular, fechar e reabrir o app, continuar logado. |
| **2 — Equipe e membros** | Backend: criar equipe (+seed de posições), listar/criar/editar membros placeholder, funções, papéis e `TeamMemberGuard`. App: onboarding "criar equipe / tenho convite", tela de membros, adicionar membro com funções. | Líder monta a equipe inteira sozinho, sem ninguém mais ter conta. |
| **3 — Convites** | Backend: gerar/listar/revogar/preview/aceitar, geral e individual. App: tela de convites com botão Compartilhar, tela "Entrar com código". Landing page estática. | Segunda pessoa recebe link no WhatsApp e entra na equipe. |
| **4 — Cultos** | Backend: CRUD de eventos com validações. App: agenda (próximos/passados), formulário de culto (data, culto, ensaio, observações), detalhe básico. | Culto criado aparece para todos os membros. |
| **5 — Escalação** ⭐ | Backend: `PUT /events/:id/assignments`, `GET /events/:id` completo. App: tela de escalação por função, tela da escala com "VOCÊ: Guitarra" em destaque. | O membro abre o app e sabe onde toca — **aqui o produto passa a existir.** |
| **6 — Músicas** | Backend: repertório + `PUT /events/:id/songs`. App: busca/criação de música, setlist ordenada (arrastar). | Escala mostra as músicas na ordem. |
| **7 — Acabamento** | Paleta de cores aplicada ao card, **compartilhar escala como texto**, **duplicar culto**, estados vazios, tratamento de erro, pull-to-refresh, cache de último estado. | A escala postada no grupo vem do app. |
| **8 — Distribuição** | Keystore de release, `flutter build apk --release --dart-define`, deploy no **Railway** (serviço a partir do `Dockerfile` alvo `production` + PostgreSQL gerenciado, `prisma migrate deploy` no start), seed da equipe real, endpoint `/version`. | APK instalado nos celulares da equipe, apontando para o servidor real. |

**Ponto de decisão:** ao final da etapa 5 o MVP já resolve o problema central. Vale usar uma semana real na igreja *antes* de construir a 6 e a 7 — o feedback dessa semana provavelmente reordena o resto.
