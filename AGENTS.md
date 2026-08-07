# Contexto do projeto para assistentes de código

> Este arquivo é lido automaticamente pelo Cursor (e por outros agentes) em toda
> sessão. Ele descreve o que já existe, as convenções e as armadilhas que já
> custaram tempo. **Leia antes de escrever código.**

## O que é

Sistema de escalas para equipes de louvor de igreja. O líder organiza cultos,
quem toca o quê, horário do ensaio e as músicas; os integrantes abrem o app e
veem onde estão escalados.

**O valor do produto está na tela de leitura da escala**, não no CRUD. O membro
precisa ver "Domingo 09h — você, guitarra. Ensaio sábado 19h" em 2 segundos.
Todo o resto existe para viabilizar essa tela.

Documento de arquitetura e decisões: `docs/ARQUITETURA-MVP.md`. Ele é a fonte da
verdade sobre entidades, regras de negócio numeradas e ordem das etapas.

## Estrutura — dois projetos independentes

**Não é monorepo.** Não há workspace npm/pnpm, Melos, Nx nem dependências
compartilhadas de build. `app/` e `backend/` são projetos separados que só se
comunicam por HTTP. No futuro cada um pode virar um repositório Git próprio.

```
sistemas/                  pasta de trabalho (não é um pacote)
├─ docs/                   arquitetura e prompts (produto)
├─ backend/                NestJS 11 + Prisma 6 + PostgreSQL 16 (Docker)
│  ├─ compose.yaml
│  ├─ .env.example
│  └─ ...
└─ app/                    Flutter 3.44 + Riverpod + go_router + Dio
```

## Como rodar

### Backend

Tudo em Docker, a partir de `backend/`:

- `cd backend; docker compose up -d` — sobe api (3000) e db (5432)
- `docker compose logs -f api` — logs
- `docker compose exec api npx prisma migrate dev --name x` — migration
- `docker compose exec api npx tsc --noEmit -p tsconfig.json` — typecheck
- `docker compose exec api npm install <pkg>` — instalar dependência (**dentro** do container, nunca no Windows)

O `.env` vive em `backend/` (copie de `backend/.env.example`).

### App

Flutter roda nativo no Windows, a partir de `app/`. O `flutter` **não está no
PATH global**; prefixe a sessão do PowerShell:

- `$env:PATH = 'C:\Users\Acer\flutter\bin;' + $env:PATH`
- `cd app; flutter analyze` — precisa terminar com "No issues found!"
- `cd app; flutter test`
- APK para o celular (aponta para produção):
  `cd app; flutter build apk --release --dart-define=API_BASE_URL=https://backend-production-b304.up.railway.app`
- APK contra o backend local (só serve no emulador):
  `cd app; flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:3000`
- instalar no emulador: `C:\Users\Acer\AppData\Local\Android\sdk\platform-tools\adb.exe -s emulator-5554 install -r app\build\app\outputs\flutter-apk\app-release.apk`

**A URL da API em produção é `https://backend-production-b304.up.railway.app`**
— sem barra no fim e sem `/api/v1`, que o `AppConfig` já concatena. Ela não
tem default no código de propósito (`AppConfig.apiBaseUrl` cai em `10.0.2.2`),
então todo build de release precisa passar o `--dart-define`.

## Estado atual

Concluídas: **0 a 5 e 7** — fundação, contas, equipe/membros/funções, convites,
cultos, escalação e acabamento (compartilhar no WhatsApp, duplicar culto, cache
de leitura, identidade visual verde com design tokens).

**Faltam duas etapas**, cujos prompts continuam válidos em
`docs/PROMPTS-CURSOR.md`:

- **Etapa 6 — Músicas.** Não existe módulo `songs` no backend nem feature de
  músicas no app. A tela de detalhe do culto tem um card "Em breve — repertório
  do culto" reservando o espaço, e `Event.songs` é um `List<Object?>` solto que
  deve virar um modelo tipado quando a etapa for feita. O texto de
  compartilhamento (`schedule_share_text.dart`) já tem o bloco de músicas
  pronto, lendo defensivamente do mapa.
- **Etapa 8 — Distribuição.** Não existe `docs/DEPLOY.md`, `GET /version` nem
  keystore de release configurado.

## Conta do usuário: dados, senha e foto

Cada pessoa cuida da própria conta em `Perfil`. Nada disso tem `:id` na rota —
todas as três agem sobre o dono do token:

- `PATCH /users/me` — nome e e-mail (o e-mail é o login; duplicado dá 409
  `EMAIL_ALREADY_USED`). Mudar o nome também acerta o `displayName` na equipe,
  **mas só quando ninguém o personalizou** (o líder pode ter trocado "José
  Carlos da Silva" por "Zeca", e corrigir o nome da conta não deve desfazer).
- `POST /users/me/avatar` — `multipart/form-data`, campo `file`.
- `DELETE /users/me/avatar`.
- Trocar a senha continua em `POST /auth/change-password`, que exige a atual e
  derruba as outras sessões. No app tem dois caminhos para a mesma tela:
  `/trocar-senha` (obrigatória, regra 27) e `/perfil/senha` (voluntária,
  `ChangePasswordScreen(forced: false)`).

### Fotos em disco — o Volume do Railway

As imagens ficam no **disco**, não no banco nem em S3. `STORAGE_DIR` é a raiz;
dentro dela só existe `avatars/`. O banco guarda o caminho relativo
(`users.avatar_path`), e a API devolve `avatarUrl` **relativo ao host**
(`/uploads/avatars/<uuid>.jpg`) — quem monta o endereço final é o `AppAvatar`,
porque o mesmo registro responde em `10.0.2.2` no emulador e no domínio do
Railway.

- **Local:** `STORAGE_DIR=/app/storage` (no compose). Como `backend/` é bind
  mount, os arquivos aparecem em `backend/storage/` no Windows. Está no
  `.gitignore` e no `.dockerignore`.
- **Railway:** o sistema de arquivos do container é descartado a cada deploy.
  Crie um **Volume no serviço da API com mount path `/data`** e defina
  `STORAGE_DIR=/data`. Não monte dentro de `/app` (a raiz do build). O Volume
  só acompanha uma réplica — daí `numReplicas = 1` no `railway.toml`.

Os arquivos são servidos pelo express (`useStaticAssets` em `main.ts`), fora do
`/api/v1` e **sem JWT**: `Image.network` não manda `Authorization`. O que
protege é o nome ser um UUID v4, não enumerável. Validação em
`storage.service.ts`: assinatura do arquivo (JPEG/PNG/WebP — não o `mimetype`
declarado, que é escrito por quem envia) e 5 MB. O app já reduz para 1024px /
qualidade 85 antes de enviar, o que também reencoda HEIC em JPEG.

## Vocabulário: "escala", não "culto"

Na interface, a entidade que o líder cria chama-se **escala**. No código e no
banco ela continua sendo `Event` / `events` — renomear a tabela e o modelo não
traria benefício nenhum ao usuário e quebraria migrations. Ao escrever textos
novos, use "escala"; "culto" só sobrevive como rótulo do **horário** dentro da
escala (`Culto 09:00` × `Ensaio 19:00`), que é o sentido correto ali.

## Regras de escalação

Duas regras vêm da prática do culto e são validadas **no backend** (o app só
impede antes, para o líder não descobrir o erro ao salvar):

1. **Um instrumento por pessoa por escala.** Vocal acumula com um instrumento
   (canta e toca violão); dois instrumentos, nunca.
2. **Multimídia e som ficam fora da banda.** Quem está em função `TECH` não
   pode estar em `VOCAL` nem `INSTRUMENT` na mesma escala.

A categoria da `Position` é o que sustenta isso: `VOCAL`, `INSTRUMENT`, `TECH`
e `OTHER`. Multimídia e Som são semeadas como `TECH` em toda equipe nova.
Códigos de erro: `MULTIPLE_INSTRUMENTS` e `TECH_WITH_BAND`.

## Convidados

Músico de fora chamado para uma ocasião: `Membership` com `isGuest = true`,
sem conta e sem convite. **Não aparece na lista de integrantes** — a listagem
só o inclui com `?includeGuests=true`, usada pela tela de escalação. Ele entra
na escala e no texto compartilhado, que é como recebe as informações, já que
não tem o app.

## Indisponibilidade

O modelo é **avisar antes**, não confirmar depois. Não existe aceitar/recusar
escala: o integrante marca em `Perfil → Minha disponibilidade` os dias em que
não pode, e quem monta a escala vê a etiqueta na hora de escalar.

- Tabela `unavailabilities` guarda **dia civil** (`@db.Date`), não timestamp.
- `GET /events/:id` devolve `unavailable[]` (quem não pode naquele dia) e
  `warnings.unavailableAssigned[]` (quem foi escalado mesmo assim).
- **Indisponível não bloqueia escalar** — o líder às vezes já combinou a troca
  por fora. A tela sinaliza em vermelho e o aviso reaparece depois de salvar.
- LEADER+ pode marcar indisponibilidade por outra pessoa; MEMBER, só a própria.

## Feature flags

`app/lib/core/config/feature_flags.dart` esconde funcionalidades prontas em vez
de removê-las. Hoje: `duplicateSchedule = false` — o endpoint, o diálogo e o
teste continuam funcionando; só a entrada no menu some.

**O schema Prisma já contém TODAS as tabelas do MVP**, incluindo `events`,
`assignments`, `songs` e `event_songs`. As etapas 4 a 6 normalmente **não
precisam de migration nova** — só se você acrescentar campos.

Conta de teste no banco local: `samuel@teste.com` / `senhaFinal789`, dono da
equipe "Ministerio de Louvor" com quatro integrantes.

## Convenções do backend

- Módulos por feature em `src/modules/<nome>/` com `*.controller.ts`,
  `*.service.ts`, `*.module.ts` e `dto/`. Três camadas: controller → service →
  Prisma. **Sem** CQRS, event bus, repositório genérico ou DDD tático.
- Rotas de negócio sob `/api/v1`. `/health` fica fora do prefixo.
- Domínio e código em **inglês**; mensagens ao usuário em **português**.
- Tabelas e colunas em `snake_case` via `@map`; modelos em `PascalCase`.

### Autenticação e autorização

- `JwtAuthGuard` é global. Rota aberta precisa de `@Public()`.
- `@SkipPasswordChangeCheck()` libera a rota para quem está com
  `mustChangePassword` (só `/auth/me` e `/auth/change-password` usam).
- `@UseGuards(TeamMemberGuard)` no controller carrega o `Membership` ativo em
  `req.membership` e devolve **404** (não 403) para quem não é da equipe.
  **O guard exige um parâmetro `:teamId` na rota.**
- `@TeamRoles('OWNER', 'LEADER')` restringe por papel.
- `@CurrentUser()` e `@CurrentMembership()` injetam nos handlers.

### Erros

Filtro global em `src/common/filters/http-exception.filter.ts` normaliza tudo
para `{ statusCode, code, message, path, timestamp }`. Para um erro com código
próprio, lance com objeto:

`throw new ConflictException({ code: 'CANNOT_REMOVE_OWNER', message: 'O dono da equipe nao pode ser removido.' })`

O app usa `code` para reagir e `message` para exibir.

### Validação

`ValidationPipe` global com `whitelist: true` e `forbidNonWhitelisted: true` —
campo desconhecido no corpo vira 400. DTOs com `class-validator`, mensagens em
português, `@Transform` para `trim`/lowercase. Use `ParseUUIDPipe` nos params.

## Convenções do app

- Feature-first: `lib/features/<nome>/{data,domain,presentation}`, mais
  `application/` quando há controller de estado.
- Riverpod: `Provider` para repositórios, `FutureProvider.autoDispose.family`
  para listas por `teamId`, `StateNotifierProvider` para sessão.
- **Modelos escritos à mão** com `fromJson`. Não use freezed/build_runner — o
  passo de codegen não paga o próprio custo neste MVP.
- Repositórios envolvem chamadas em `_guard` e lançam `ApiException`
  (`core/network/api_exception.dart`). Telas capturam e exibem.
- Formulários usam `FormScaffold` e `FormErrorBanner`
  (`shared/widgets/form_scaffold.dart`).
- Navegação em `core/router/app_router.dart`, com `redirect` por estado de auth.
  Telas que dependem da equipe usam o helper `_withActiveTeam`.
- Equipe ativa: `activeTeamIdProvider` (`features/team/data/team_repository.dart`).

## Armadilhas já pagas — não repita

1. **Android release não fala HTTP em texto claro.** Resolvido em
   `app/android/app/src/main/res/xml/network_security_config.xml`. Para testar em
   celular físico, adicione o IP da máquina lá.
2. **Não coloque timeout curto na leitura do armazenamento seguro.** Um
   `timeout(5s)` no bootstrap deslogava quem tinha sessão válida em aparelho
   lento. Falha real vira exceção e é tratada.
3. **`TokenStorage` mantém cache em memória.** No Android o plugin trabalha na
   thread principal; ler o Keystore a cada requisição causou ANR.
4. **`enableShutdownHooks()` só em produção** — em dev quebra o hot reload.
5. **Hot reload do Nest depende de polling** configurado em
   `backend/tsconfig.json` (`watchOptions`) e `backend/nodemon.json`
   (`legacyWatch` + `signal: SIGKILL`). Não mexa sem entender o porquê:
   `CHOKIDAR_USEPOLLING` **não** resolve, e o engine do Prisma faz o processo
   ignorar SIGTERM.
6. **String vazia não passa em `z.string().url().optional()`.** O compose sempre
   define a variável; use `z.preprocess` para tratar `''` como ausente.
7. **O emulador Android desta máquina é muito lento** (1–2 min para abrir em
   debug). Automação de UI por `adb input` é pouco confiável — os toques caem
   antes da tela renderizar. Prefira validar por `curl` (backend) e
   `flutter test` (app), e peça verificação visual ao usuário.
8. **Datas em `timestamptz` (UTC) no banco.** A exibição usa `team.timezone`
   (`America/Sao_Paulo`). Nunca guarde horário local.
9. **A fonte é empacotada, não baixada.** O pacote `google_fonts` foi removido:
   ele buscava a Plus Jakarta Sans em `fonts.gstatic.com` na primeira execução,
   o que fazia o app depender de um segundo servidor além da API e degradar
   para a fonte do sistema em rede ruim. Os `.ttf` estão em `app/assets/fonts`
   e declarados no `pubspec.yaml` como família `PlusJakartaSans`. **Não
   reintroduza `google_fonts`.**
10. **Permissão e identidade vêm da equipe do recurso**, não de `teams.first`.
    O app assume uma equipe por usuário em vários pontos, mas onde há um
    `teamId` no objeto (evento, por exemplo), use-o para achar o
    `Membership` correto — senão quem participa de duas equipes vê o menu de
    líder onde é apenas membro.

## Definição de pronto

Uma etapa só está pronta quando:

- `cd backend; docker compose exec api npx tsc --noEmit -p tsconfig.json` não acusa nada;
- as rotas novas aparecem no log do Nest;
- **cada regra de negócio foi exercitada por `curl`**, inclusive os casos de
  erro (não basta o caminho feliz);
- `cd app; flutter analyze` termina com "No issues found!";
- `cd app; flutter test` passa;
- o APK release compila.

Relate o que **não** foi verificado. Não afirme que algo funciona sem ter
executado.

## Dívidas conhecidas

- **Strings sem acento.** As mensagens de UI e os comentários estão sem acentos
  ("Voce", "Funcoes") por causa de problemas de encoding no shell do Windows
  durante o desenvolvimento inicial. Flutter e Postgres lidam com UTF-8 sem
  problema — vale uma passada acertando os acentos das strings visíveis ao
  usuário. Faça isso de uma vez só, não etapa por etapa.
- **Transferência de posse de equipe** não existe. `PATCH` de membro só aceita
  `LEADER`/`MEMBER`; promover a `OWNER` exigiria operação atômica própria por
  causa do índice único parcial `memberships_one_active_owner_per_team`.
- **Sem página pública de convite.** `INVITE_BASE_URL` é opcional; sem ela a API
  devolve `url: null` e o app compartilha só o código.
- **Sem cache offline real.** Planejado para a Etapa 7: guardar o último JSON e
  exibir com selo "atualizado às HH:mm".
- **Sem confirmação de presença** ("aceito/não posso"). Fora do MVP por decisão;
  o modelo suporta com uma coluna `status` em `assignments`.
