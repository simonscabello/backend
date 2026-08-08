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

Concluídas: **0 a 7** — fundação, contas, equipe/membros/funções, convites,
cultos, escalação, músicas e acabamento (compartilhar no WhatsApp, duplicar
culto, cache de leitura, identidade visual verde com design tokens).

**Falta uma etapa**, cujo prompt continua válido em `docs/PROMPTS-CURSOR.md`:

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

## Músicas (Etapa 6)

`GET|POST /teams/:teamId/songs`, `GET|PATCH|DELETE .../songs/:songId`.
Qualquer integrante **lê** (o músico precisa achar a cifra e o tom antes do
ensaio); só `OWNER`/`LEADER` escreve.

No app, em `Equipe → Gerenciar → Repertório` (`/equipe/musicas`): lista com
busca e o filtro **"faltando dados"**, detalhe com letra e os quatro links, e
`/equipe/musicas/nova` — **uma caixa de busca, duas fontes**: primeiro o que
outras equipes já cadastraram (instantâneo e com letra), depois o Spotify.
A pessoa escolhe; casar automático erraria calado, porque "Aleluia" existe em
cinco versões.

O que **falta preencher** é o que nenhuma API responde — tom da equipe,
hino/cântico e andamento. Por isso a lista mostra o tom da gravação em cinza
ao lado do campo vazio e a edição tem um "Usar F#": o preenchimento vira um
toque em vez de pesquisa, feito quando a música entra numa escala.

Campos: `title`, `artist`, `composer`, `kind` (`HYMN`/`SONG`), `pace`
(`CALM`/`MODERATE`/`UPBEAT`), `defaultKey` e quatro links — `lyricsUrl`,
`chordsUrl`, `youtubeUrl`, `spotifyUrl`. A letra fica no banco (`lyrics`),
não só o link: site de letra sai do ar e não abre no meio do culto.

- **A lista não devolve `lyrics`** (são centenas de músicas); o `GET` de uma
  música devolve. Os campos que faltam preencher vêm na lista, porque é por
  eles que a tela vai filtrar.
- **`search_text`** é título + artista + compositor em minúsculas e sem
  acento, montado no serviço. É o que a busca compara: sem isso, procurar
  "coracao" não acha "Coração" — que é como o título está gravado e não é
  como as pessoas digitam. A ordenação também usa ele.
- Regra 20 (título+artista único por equipe, ignorando maiúsculas) e regra 21
  (**música usada em escala não se exclui, arquiva-se** — 409 `SONG_IN_USE`).
- **Não existe classificação** (redenção, justificação...). Foi adiada de
  propósito; entra como coluna nova quando for a hora.

### Busca externa (Spotify + CifraClub)

- `GET /teams/:teamId/songs/search-external?search=` — busca no Spotify.
- `POST /teams/:teamId/songs/from-external` — cria a música escolhida,
  resolvendo cifra, letra, tom e andamento no CifraClub (LEADER+).

**Duas etapas de propósito.** A busca é uma chamada só e responde rápido,
porque a pessoa está com o teclado na mão; resolver a cifra custa até oito
requisições ao CifraClub e só acontece para a música escolhida. Fazer isso
para os oito resultados deixaria a busca inutilizável.

- O cliente devolve no POST o que a busca entregou — assim o servidor não
  guarda estado entre a busca e a escolha.
- **Título do Spotify vem com subtítulo entre parênteses** ("Consagração
  (Ao Vivo)") e o CifraClub usa o título curto. As URLs candidatas incluem a
  versão sem parênteses: verificado, `consagracao-ao-vivo` dá 404 e
  `consagracao` dá 200.
- Não achou cifra? Cria só com o que tem. **Nunca inventa link.**
- `defaultKey` e `pace` nascem vazios: nenhum serviço externo sabe respondê-los.
- Sem `SPOTIFY_CLIENT_ID`/`SECRET` a busca devolve `[]` e a API sobe normal.
  **Em produção, definir no Railway** ou a tela de cadastro nasce cega.

O código vive em `src/modules/songs/external/` e é o mesmo que o
`prisma/enrich-songs.ts` usa — o script importa de lá, não o contrário.

### Repertório de outra equipe (catálogo)

- `GET /teams/:teamId/songs/catalog?search=` — procura a mesma música no
  repertório das **outras** equipes. Devolve `sourceSongId` e o que cada
  candidato traz (`hasLyrics`, `hasChords`...), **nunca a letra em si**.
- `POST /teams/:teamId/songs/from-catalog` — copia para esta equipe (LEADER+).

Existe porque **a maioria das igrejas não tem como exportar acervo de lugar
nenhum e nenhuma API devolve letra**: quem chega depois só tem letra se alguém
antes já tiver cadastrado aquela música. Não é tabela nova nem catálogo curado
— é a própria tabela consultada de lado.

- **Copia, não compartilha.** A partir daí as duas linhas seguem separadas.
- Copia só o universal. `defaultKey`, `pace` e `isArchived` nascem vazios: são
  a decisão desta equipe.
- `externalSource`/`externalId` viajam junto — é o que faz a identidade se
  propagar e a 10ª igreja reconhecer a música da 1ª.
- Busca com menos de 2 caracteres devolve vazio: isto lê repertório de
  terceiros, e despejar a tabela não é o propósito.
- **`@Get('catalog')` precisa vir antes de `@Get(':songId')`** no controller,
  senão o Nest casa "catalog" como id e o `ParseUUIDPipe` rejeita com 400.

### Levar o repertório para outro banco

```
docker compose exec api npm run export:songs -- --team=<uuid> --file=tmp/songs.json
docker compose exec -e DATABASE_URL="<url do Railway>" api npm run import:songs -- --team=<uuid de producao> --file=tmp/songs.json
```

Vai **direto ao banco, sem passar pela API**. O arquivo sai sem `id` e sem
`teamId` — quem decide a equipe de destino é o import, que casa por
`(equipe, origem, id externo)` e atualiza em vez de duplicar.

`--only-universal` deixa de fora `defaultKey`, `pace` e `isArchived`: use ao
dar repertório de partida para **outra igreja**; omita ao mover a base da
mesma igreja para produção.

Trocar o `team_id` das músicas por `UPDATE` também funciona — nada além da
própria linha guarda o vínculo. Mas **move em vez de copiar**, e depois de
existir escala com repertório deixa músicas ligadas a eventos de outra equipe.

### Import do Holyrics

```
docker compose exec api npm run import:holyrics -- --file=tmp/holyrics.js --team=<uuid> [--dry-run]
```

O arquivo é o backup "cleaned" do Holyrics (`window.CLEANED_SONGS = [...]`) —
`.js`, não `.json`, por isso o script recorta do primeiro `[` ao último `]` e
faz `JSON.parse` (nada é avaliado como código). Ele vai em `backend/tmp/`, que
é gitignored: são dados da igreja, não código.

**É repetível.** A chave é `(team, "holyrics", id do backup)`, então rodar de
novo atualiza em vez de duplicar — e a atualização **não toca em `defaultKey`,
`pace` nem `isArchived`**, que são o trabalho manual da equipe.

O que o backup de 288 músicas rendeu: 286 gravadas (2 títulos repetidos), 195
links de letra, 53 de cifra, 52 do YouTube, 42 do Spotify e 10 marcadas como
hino (o hinário vem escrito no campo de artista: "Cantor Cristão - 148").
Tom, andamento e hino/cântico do resto ficam vazios — chutar seria pior.

**Nenhuma API preenche esses campos.** O `audio-features` do Spotify, que dava
tom e energia, foi descontinuado em 27/11/2024 e devolve 403 para aplicativos
novos; o `bpm` do Deezer vem 0 para boa parte do gospel brasileiro. E o tom
que importa é o que a equipe canta, não o da gravação.

### Enriquecimento dos links

```
docker compose exec api npm run enrich:songs -- --team=<uuid> --dry-run
```

Completa `spotifyUrl` e `youtubeUrl` das músicas que estão sem eles. Cada
provedor só roda se a chave dele existir no `.env` (`SPOTIFY_CLIENT_ID`/
`SECRET`, `YOUTUBE_API_KEY`); sem chave ele é pulado e o outro segue. **A API
não precisa de nenhuma delas.**

**Letra não entra, e não é omissão:** 285 das 286 músicas já têm a letra
completa no banco e nenhuma está sem letra *e* sem link. Texto guardado é
melhor que link, que depende de rede e do site continuar no ar. A API do
Vagalume, que faria isso, responde **503 em qualquer caminho desde 08/2026** —
o `www` continua no ar, o `api.` não. Foi verificado; não suponha que voltou
sem testar.

- **Só grava com casamento forte**: o título tem que bater e as palavras do
  nome do artista têm que ser subconjunto das do outro, ignorando acento,
  maiúscula e conectivos (`de`, `da`, `e`...). O `e` importa — o Spotify lista
  "Aline Barros e Fernandinho" como dois artistas, e sem ignorá-lo o
  casamento falhava.
- **Música sem artista não é tentada** pelos provedores de link. Antes deles
  roda a **recuperação de artista**: 75 das 108 sem artista carregam o nome
  dele na própria URL que já têm (o Vagalume e o Letras.mus.br no primeiro
  trecho do caminho, o `*.lyrics.com.br` no subdomínio). O palpite sai do
  endereço sem gastar requisição, mas **só é gravado depois de confirmado** —
  ou o Spotify acha a música com aquele artista, ou a página do CifraClub
  existe. Sem confirmação, fica vazio.
- Quando o Spotify confirma, grava a **grafia dele** ("Rebanhão", não o
  "Rebanhao" que sai do slug), e refaz o `searchText`.
- Nunca sobrescreve link existente nem toca em tom/andamento/hino.
- O YouTube tem cota de ~100 músicas/dia (busca custa 100 de 10.000 unidades).
  **Só `quotaExceeded`/`dailyLimitExceeded` derruba o provedor**; os outros 403
  pulam a música e seguem — chave recém-criada no Google Cloud leva alguns
  minutos para propagar e responde 403 nesse meio-tempo. Já aconteceu aqui: a
  mesma busca que falhou voltou 200 minutos depois, sem mudar nada.

**Cifra funciona sem API e sem chave, por montagem de URL + verificação.** O
CifraClub não tem API pública, mas devolve **404 de verdade** para slug que não
existe (sem Cloudflare, sem página falsa de "não encontrado") — foi testado. O
provedor monta `cifraclub.com.br/<artista>/<música>/`, tenta as variações com e
sem artigos (o site derruba artigos: `eu-vejo-gloria`, `trazendo-arca`) e **só
grava a que responder 200**. É o 404 que torna o chute seguro: sem ele seria
adivinhação, com ele é verificação.

Medido contra os links reais do backup: das 29 que tinham cifra **e** artista,
achou **22 e errou 0** — três apontaram para a mesma música por outro caminho
(`trazendo-a-arca` × `trazendo-arca`, `cifras.com.br`, `cifraclub.com` sem
`.br`). A tentativa anterior, sem variações e sem conferir o 404, acertava 17.
As 7 falhas são cadastro ruim: artista preenchido com número de hinário
("Cantor Cristão - 439") ou abreviado ("Min. Koinonya de Louvor").

Não vale usar `github.com/code4music/cifraclub-api` para isso: ele recebe
`/artists/:artist/songs/:song`, ou seja **exige como entrada o slug que é
justamente o problema**, sobe um Selenium por requisição e devolve o conteúdo
da cifra (obra licenciada) — quando o que se quer é só a URL.

### Repertório dentro da escala — **um por culto**

`PUT /events/:eventId/songs` (LEADER+) substitui a lista inteira, na ordem
recebida, e **responde com a escala completa** — a tela do culto se atualiza
sem uma segunda chamada. Mesma forma do `PUT` de escalação, e pelo mesmo
motivo: a pessoa arrasta, tira, acrescenta e salva de uma vez; item a item
deixaria a escala pela metade se a rede caísse no meio.

**Cada item traz `serviceId`, e ele é obrigatório.** A manhã e a noite têm
repertórios próprios — é o caso real da igreja. `EventSong.serviceId` é
`NOT NULL`: toda escala tem pelo menos um culto, então não existe música de
escala que não seja de algum culto, e um nulo criaria um estado "sem culto
definido" para carregar na tela, nas consultas e no texto compartilhado.
Nulável também deixaria a chave única sem trava, porque no Postgres `NULL` é
distinto de `NULL` em índice único.

- **A mesma música nos dois cultos são duas linhas**, e isso é o certo: à noite
  pode ser outro tom, outra ordem, outro recado. A chave é
  `(eventId, serviceId, songId)`.
- **A posição é normalizada por culto**, em `0..n-1` dentro de cada um. O
  cliente manda ordem, não índice. Numerar a escala inteira faria o repertório
  da noite começar em 4 — e "3ª música da noite" é como a equipe fala.
- Música repetida **no mesmo culto** → 400 `DUPLICATE_SONG`. Culto de outra
  escala → 400 `INVALID_SERVICE`. Música de outra equipe → 400 `INVALID_SONG`
  (os ids vêm do cliente, e um id válido de outro lugar passaria pela
  validação de formato).
- Lista vazia limpa o repertório. É como se tira tudo.
- `duplicate` remapeia os cultos: cada música cai no culto correspondente da
  cópia, casado **pelo horário** (todos andaram o mesmo tanto), e não pela
  ordem do `create`, que o Prisma não promete.

#### O `update` da escala faz upsert dos cultos, e isso é obrigatório

`EventServiceDto` aceita `id`. Presente = "é o mesmo culto, só mudou o rótulo
ou o horário" → `update`; ausente = culto novo → `create`; o que sumiu da
lista é apagado.

Isto **não é refinamento**: a FK do repertório é `onDelete: Cascade`. Enquanto
o `update` fazia `deleteMany` + `createMany`, cada edição dava um `id` novo a
cada culto — e **mudar o horário da noite apagaria as músicas da noite**. O app
devolve o `id` em `_servicePayload`; note que `Event.displayServices` inventa
um culto com o **id da escala** quando não há culto gravado (fallback de cache
antigo), e devolver esse id dá 400 `INVALID_SERVICE`.

Apagar um culto de propósito continua levando o repertório dele — é o que
"tirei a noite desta semana" significa.
- `keyOverride` é o tom **desta escala**, sem alterar a música: a mesma canção
  sobe ou desce conforme quem canta. O servidor devolve `key` já resolvido
  (o da escala quando existe, senão o da equipe) — nem a tela nem o texto do
  WhatsApp repetem essa decisão.
- A escala **não** carrega a letra das músicas: são centenas de caracteres por
  música e essa já é a tela mais pesada. Título, artista, tom e links bastam.
- **A listagem da agenda devolve `songs: []`** de propósito: nenhum card mostra
  músicas, e carregá-las multiplicaria a resposta por evento. O compartilhar
  sai do detalhe, que tem tudo.

No app: `/agenda/:eventId/repertorio`, com um `ReorderableListView` **por
culto** (`shrinkWrap`, sem física própria, dentro da rolagem da tela). Use
**`onReorderItem`**, não `onReorder` — ele já entrega o índice de destino
corrigido, e compensar à mão erra por um ao arrastar para baixo. A `Key` de
cada linha é `culto:musica`, não só a música: a mesma canção pode estar nos
dois cultos.

- O **cabeçalho do culto aparece sempre**, mesmo com um culto só: some a dúvida
  de "para qual culto estou escolhendo" antes de ela existir.
- No **texto do WhatsApp** o cabeçalho só entra com 2+ cultos com repertório —
  a linha `⏰ Culto às 09:00` já está no topo, e repeti-la sobre a única lista
  seria ruído. A numeração recomeça em cada culto.
- `Event.songsByService` agrupa e é o que a tela, o texto e os testes usam.
  Culto sem música **continua na lista** (a tela mostra o que falta montar), e
  música sem `serviceId` — cache gravado antes desta versão — cai no primeiro
  culto, que é onde ela estava.

### Criar uma escala emenda em escalação e repertório

Criar não é o fim da tarefa: a escala nasce sem ninguém escalado e sem
repertório. Por isso o formulário de criação **não volta para a agenda** — ele
emenda em escalação e, dali, em repertório.

**Uma única chamada de navegação por passo**, sempre `pushReplacement`:

```
[agenda, novo]  →  [agenda, escalar]  →  [agenda, repertorio]  →  [agenda, detalhe]
```

- `?novo=1` é o que faz cada tela emendar em vez de voltar. Na escalação o
  botão também vira "Salvar e escolher músicas", para o passo seguinte não
  ser surpresa.
- `pushReplacement` e não `push` porque cada passo **já foi salvo**: voltar
  para ele só ofereceria salvá-lo de novo. Voltar em qualquer ponto cai na
  agenda, onde a escala nova já aparece.
- **Editar continua com `pop`.** O encadeamento é só da criação; quem foi
  editar o horário não quer ser levado para a escalação.
- A bandeira vai na **query**, não em `extra`: assim o encadeamento sobrevive a
  um recarregamento da rota, e a tela do repertório sabe buscar a escala
  sozinha quando chega por URL, sem o `extra`.

Por que não é `go` + `push`: ver a armadilha 11.

### Abrir a música de dentro da escala

Tocar numa música da escala abre `showEventSongSheet` (folha), **para MEMBER
também** — é justamente quem toca que precisa da cifra.

Folha e não navegação para `/equipe/musicas/:songId` por dois motivos: o tom
que vale ali é o **desta escala** (`keyOverride`), e aquela tela mostra o tom
da equipe; e ela usa a **equipe ativa**, não a equipe da escala (armadilha 10).
A folha recebe `event.teamId` e busca a letra por ele.

A escala não carrega `lyrics` (continua não carregando). A folha busca a música
inteira só quando alguém a abre, e falhar ali não esconde tom, recado nem
links, que já vieram com a escala.

### Edição da música: o que a equipe decide × o que veio de fora

`song_form_screen.dart` edita tudo, em duas camadas. Aberto: nome, nosso tom,
tipo e andamento — o que nenhuma API responde. **Recolhido**: artista,
compositor, tom da gravação, os quatro links e a letra, que vêm do import e do
enriquecimento. Fechado, o grupo resume o que já tem ("Tem cifra, letra,
YouTube") em vez de dizer "mais campos".

A letra **só é enviada quando muda** — são até 20 mil caracteres, e reenviá-los
a cada ajuste de tom é peso puro na rede da igreja.

Mudar artista ou título refaz `searchText` e passa pela regra 20 no servidor,
que responde 409 `SONG_ALREADY_EXISTS` — agora é possível esbarrar nela pela
tela, o que antes não acontecia.

### Cadastrar música durante a montagem da escala

O seletor do repertório tem "Cadastrar", que abre o `AddSongScreen` por
`Navigator.push` **sobre** a tela da escala — a escala em montagem continua
viva embaixo e volta intacta. `AddSongScreen` ganhou `onCreated`: nulo mantém o
caminho normal (vai para o detalhe da música); preenchido devolve a música para
quem pediu, que a põe no culto e reabre o seletor.

## Vocabulário: "escala", não "culto"

Na interface, a entidade que o líder cria chama-se **escala**. No código e no
banco ela continua sendo `Event` / `events` — renomear a tabela e o modelo não
traria benefício nenhum ao usuário e quebraria migrations. Ao escrever textos
novos, use "escala"; "culto" só sobrevive como rótulo do **horário** dentro da
escala (`Culto 09:00` × `Ensaio 19:00`), que é o sentido correto ali.

## Identidade visual e acessibilidade

Azul (`#1D4ED8`) é a marca. Âmbar (`tertiary`) é o papel de **atenção**: algo a
resolver, sem o susto do vermelho, que significa erro. Hoje marca a música sem
tom na lista do repertório — das 286 importadas a maioria chegou assim, e em
cinza o buraco lia-se como "está tudo certo".

Três regras sustentam `app_colors.dart`, e cada uma existe porque a versão
anterior falhava nela:

1. **O cartão fica um passo acima da página, nos dois temas.** No escuro isto
   inverte o Material 3 de propósito (lá `surfaceContainerLowest` é mais escuro
   que `surface`): o app usa esse token como "a superfície do cartão", e seguir
   o M3 fazia o cartão ficar **mais escuro** que a página — lido como buraco.
2. **Borda de controle tem 3:1** (WCAG 1.4.11). O `outline` antigo dava 1,45:1
   sobre o campo: existia no código e não na tela. `outline` é para o que se
   toca (campo, chip, botão contornado); `outlineVariant` é o fio decorativo
   entre blocos, que não precisa dos 3:1.
3. **Fundo e cartão se distinguem sem depender da borda.** O par antigo era
   1,055:1 no claro e 1,034:1 no escuro — a mesma cor.

**`test/theme_contrast_test.dart` mede tudo isso a cada `flutter test`.** Foi
verificado que ele falha ao restaurar o `outline` antigo. Se mexer na paleta e
ele reclamar, o número está certo e a cor está errada — olho não mede razão de
luminância.

Outros pontos do tema (`app_theme.dart`):

- **Foco visível** (`focusColor`) para teclado externo e controle adaptativo. O
  padrão do Flutter é um preto translúcido que some no tema escuro.
- **48dp de alvo de toque** em `IconButton` e em linha de lista
  (`minTileHeight`): uma `ListTile` `dense` chegava a ~40 e escapava do dedo de
  quem está com o instrumento na mão.
- **Um raio por papel**: `radiusMd` (12) para controles, `radiusLg` (16) para
  cartões, `radiusPill` para etiquetas. `radiusXl` e `radiusHero` saíram — o
  segundo nunca foi usado e o primeiro dava ao app três raios de cartão
  diferentes conforme a tela.
- A **sombra do `AppCard` não é o que faz o cartão existir**; é a cor. A sombra
  só arredonda a transição, e por isso o cartão continua legível com "reduzir
  animações" ligado.

## Os horários da escala na tela

`EventTimesList` (`features/events/presentation/event_times.dart`) desenha os
horários no cartão do detalhe **e** no cartão destacado da agenda: uma linha por
culto mais o ensaio, com o rótulo à esquerda e a hora à direita. Abrir a escala
não deve reapresentar a mesma informação num formato diferente.

- **Não volte às etiquetas coloridas.** Eram um `Wrap` de pílulas com
  `primaryContainer` de fundo, e saíram por dois motivos: o texto do ensaio
  estourava a largura, e aquele azul é **a mesma cor** da faixa de "alguém
  avisou que não pode" logo abaixo — três linhas de informação corriqueira com
  o peso visual de um alerta. A cor sobrou só no ícone do culto.
- Em coluna as horas caem na mesma vertical e ficam comparáveis de relance, que
  é a pergunta de quem abre a escala. Por isso `FontFeature.tabularFigures()`:
  sem ele os dois-pontos de "08:30" e "19:00" desalinham.
- **O ensaio usa `formatRehearsalTime`**, que dá `19:00` no mesmo dia da escala
  e `sáb 19:00` em outro. A data por extenso ("Ensaio Segunda-feira, 10 de
  agosto 00:30") era o que quebrava o layout. Há teste travando o formato.
- Esse rótulo já esteve duplicado em três lugares com formatos diferentes, e a
  listagem tinha um bug por isso: mostrava só a hora, então ensaio de sábado
  parecia ser no dia do culto. **Um formatador só, os três chamam.**
- No **item** da lista os horários seguem em linha corrida
  (`Manhã 08:30 · Noite 19:00 · Ensaio sáb 19:00`): ali a pergunta é "qual
  escala é esta?", e a coluna alinhada gastaria três linhas por item.

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

Contas de teste no banco local, ambas da equipe "Ministerio de Louvor":
`samuel@teste.com` / `senhaFinal789` (OWNER) e `maria@teste.com` /
`mariaTeste2026` (MEMBER — serve para conferir os 403 sem depender de ler o
código do guard).

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
5b. **`rootDir` é fixo em `./src`, e `prisma/` está fora do `include`.** Isto
   custou uma hora: o `include` trazia `prisma/**/*`, e bastou existir um `.ts`
   ali importando de `../src/` para o TypeScript recalcular a raiz — a saída
   migrou de `dist/main.js` para `dist/src/main.js` enquanto o nodemon seguia
   rodando o `dist/main.js` antigo. **A API ficou congelada num build velho
   sem um único erro aparecer**: `tsc` dizia "0 errors", o log do Nest mostrava
   as rotas antigas e a rota nova respondia 404. Se isso voltar a acontecer,
   compare a data de `dist/main.js` com a do fonte antes de procurar bug no
   código. **Mas compare com `main.ts`, não com o arquivo que você editou**: o
   build é incremental, e `dist/main.js` só é reemitido quando `main.ts` muda —
   editar um service deixa `dist/main.js` legitimamente mais velho que o fonte,
   o que parece o congelamento sem ser. O teste honesto é olhar o `.js`
   correspondente ao arquivo editado (`dist/modules/.../x.service.js`) e, se
   quiser certeza, `grep` nele por um identificador que você acabou de
   escrever. E apague o `tsconfig.tsbuildinfo` **da raiz do projeto** (não só o
   de `dist/`): o cache incremental sobrevive à troca de layout e faz o build
   se declarar atualizado sem emitir nada. Os scripts de `prisma/` rodam por
   `ts-node`, que já os typecheca ao executar.
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
11. **Não encadeie `go` e `push` no mesmo frame.** Foi a primeira tentativa do
    fluxo "criar escala → escalar → músicas": `go('/agenda/:id')` para montar
    agenda → detalhe e `push` da escalação por cima. **Não funciona.** As duas
    disparam análises de rota assíncronas, e o `push` toma como base a
    configuração de **antes** do `go`; a pilha sai indeterminada. O sintoma
    engana: a tela empilhada aparece normalmente, e o que falha é o passo
    seguinte, que parece não responder ao botão. Compila, passa no `analyze` e
    no `flutter test` — só aparece no aparelho. **Um passo, uma chamada de
    navegação.**

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
