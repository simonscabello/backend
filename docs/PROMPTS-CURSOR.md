# Prompts para o Cursor — Etapas 4 a 8

## Como usar

1. Abra a pasta `sistemas/` no Cursor. O arquivo `AGENTS.md` da raiz é carregado
   automaticamente e já contém stack, convenções, comandos e as armadilhas que
   custaram tempo. **Não repita esse conteúdo nos prompts.**
2. Suba o ambiente antes de cada sessão: `cd backend; docker compose up -d`.
3. Cole **um prompt por vez**, na ordem. Cada etapa depende da anterior.
4. Ao final de cada etapa, exija a verificação: peça que o agente mostre a saída
   real dos `curl` e do `flutter analyze`/`flutter test`. Se ele disser que
   funciona sem mostrar a saída, peça para executar.
5. Se o agente propuser freezed, build_runner, CQRS ou reescrever os guards,
   recuse — `AGENTS.md` explica por quê.

> **Antes de tudo:** o schema Prisma já tem `events`, `assignments`, `songs` e
> `event_songs`. As etapas 4, 5 e 6 não precisam de migration nova, salvo se
> você acrescentar campos. Confira `backend/prisma/schema.prisma` antes de
> assumir que falta algo.

---

## Prompt — Etapa 4: Cultos

Implemente a Etapa 4 (cultos/eventos) do projeto, backend e app, seguindo o `AGENTS.md` e a seção 6 do `docs/ARQUITETURA-MVP.md`.

**Decisão de arquitetura que você precisa tomar primeiro.** O `TeamMemberGuard` atual exige um parâmetro `:teamId` na rota, mas as rotas de evento previstas no documento são `/events/:eventId` (sem teamId). Resolva isso antes de escrever os endpoints. Opções: (a) aninhar tudo em `/teams/:teamId/events/:eventId`; (b) estender o guard para resolver o `teamId` a partir do `:eventId` consultando o banco. Escolha uma, justifique em uma frase no código, e mantenha a garantia atual: quem não é membro ativo da equipe recebe **404**, nunca 403 nem 200. Se estender o guard, cuide para que ele continue funcionando nas rotas que já usam `:teamId` e não faça consulta desnecessária.

**Backend.** Módulo `events` com:
- criar culto (LEADER+): `title`, `startsAt`, `rehearsalAt` (opcional), `location` (opcional), `notes` (opcional), `colorPalette` (texto livre, opcional);
- listar a agenda da equipe com filtro `scope=upcoming|past` e paginação simples por `limit`, ordenando os próximos por data crescente e os passados por decrescente;
- detalhe de um culto;
- editar (LEADER+);
- excluir (LEADER+), com cascata em `assignments` e `event_songs`.

Regras de negócio (numeradas no documento): `startsAt` é obrigatório; `rehearsalAt` é opcional e, se presente, deve ser menor ou igual a `startsAt` (regra 12) — **atenção: o `CHECK` descrito no documento não existe no banco**, só o índice único parcial de OWNER foi criado por SQL manual; portanto valide no service, ou adicione o CHECK numa migration com SQL bruto (diga qual caminho escolheu). Datas chegam e são gravadas em UTC (`timestamptz`); a exibição usa `team.timezone` (regra 13).

Deixe `status` (`DRAFT`/`PUBLISHED`) sempre em `PUBLISHED` por enquanto — a coluna existe, mas rascunho não entra no MVP. Não implemente ainda `POST /events/:id/duplicate`; ele entra na Etapa 7.

**App.** Feature `events` com:
- agenda como tela principal pós-login, substituindo a home provisória: próximo culto em destaque no topo e os demais em lista, com abas ou filtro para "próximos" e "passados";
- cada item mostra dia da semana, data, horário do culto e horário do ensaio, em português (`intl` já está inicializado com `pt_BR` no `main.dart`);
- formulário de culto com seletor de data e hora para culto e ensaio, campo de observações e campo de paleta (texto livre, com `hintText` tipo "Preto e dourado");
- tela de detalhe do culto mostrando os dados, observações e paleta — deixe o espaço reservado para a equipe escalada e as músicas, que chegam nas etapas 5 e 6;
- estados vazios com texto útil ("Nenhum culto cadastrado. Toque em + para criar o primeiro.").

Mantenha o acesso à tela de equipe e a saída (logout); reorganize a navegação como achar melhor (uma `BottomNavigationBar` com Agenda e Equipe é uma opção razoável), mas não quebre o `redirect` do router nem as rotas existentes.

**Pronto quando:** o typecheck passa, as rotas aparecem no log do Nest, você exercitou por `curl` o caminho feliz e os erros (ensaio depois do culto, evento de outra equipe, membro sem permissão tentando criar), `flutter analyze` termina limpo, `flutter test` passa e o APK release compila. Escreva testes para o mapeamento de datas e para a formatação em português. Relate o que não conseguiu verificar.

---

## Prompt — Etapa 5: Escalação

Implemente a Etapa 5 (escalação) do projeto, backend e app, seguindo o `AGENTS.md` e o `docs/ARQUITETURA-MVP.md`.

**Esta é a etapa em que o produto passa a existir.** Até aqui o app é cadastro; a partir daqui o membro abre e sabe onde toca. Trate a tela de leitura da escala como o entregável principal, não como consequência do endpoint.

**Backend.**
- `PUT` da escalação de um evento (LEADER+): recebe a **lista completa** de `{ membershipId, positionId, note? }` e substitui tudo numa transação. Bulk, não item a item — a tela é um formulário salvo de uma vez.
- O detalhe do evento (`GET`) passa a devolver **tudo que a tela da escala precisa em uma única chamada**: dados do culto, escalação agrupada por função (com nome de exibição de cada membro) e a lista de músicas (vazia até a Etapa 6). Este é o endpoint mais importante da API.

Regras: `membership` e `position` do assignment têm de pertencer à mesma equipe do evento (regra 15) — valide com uma consulta só, não uma por item; o mesmo membro pode ocupar **várias funções** no mesmo culto e a mesma função pode ter **vários membros** (regra 16); não se pode escalar membro com `status = REMOVED` (regra 17); o par `(event, membership, position)` é único. Escalar alguém para função que ele não tem cadastrada em `membership_positions` é **permitido** — a realidade fura o cadastro toda semana —, mas devolva essa informação para o app poder avisar (regra 18). Idem para a pessoa escalada em dois cultos no mesmo dia (regra 19): permitido, com aviso.

**App.**
- Tela de escalação: lista as funções ativas da equipe e, em cada uma, permite escolher os membros. Mostre primeiro quem tem aquela função cadastrada, e deixe claro (sem bloquear) quando a escolha foge do cadastro. Salvar envia a lista inteira.
- Tela da escala (detalhe do culto): **regra de ouro — "onde eu apareço" tem que estar visível sem rolar.** Se o usuário logado está escalado, destaque isso no topo ("VOCÊ: Guitarra"), antes da lista completa por função. Use o `membershipId` do usuário na equipe ativa para descobrir.
- Membro comum vê a escala; só LEADER+ vê o botão de editar.

**Pronto quando:** typecheck limpo; `curl` exercitando substituição completa, membro de outra equipe, função de outra equipe, membro removido, duplicata e o caso de duas funções para a mesma pessoa; `flutter analyze` limpo; `flutter test` passando, incluindo um teste que garante que o destaque "VOCÊ" aparece quando o usuário está escalado e não aparece quando não está; APK release compilando.

Ao terminar, pare e recomende ao usuário testar com a equipe real por uma semana antes de seguir para a Etapa 6 — o feedback provavelmente reordena o resto.

---

## Prompt — Etapa 6: Músicas

Implemente a Etapa 6 (músicas) do projeto, backend e app, seguindo o `AGENTS.md` e o `docs/ARQUITETURA-MVP.md`.

**Escopo deliberadamente pequeno.** O dono do projeto pretende integrar uma base de músicas externa no futuro; as colunas `externalId` e `externalSource` já existem em `songs` como gancho. **Não** construa busca em serviço externo, cifras, tonalidades avançadas nem anexos. Implemente só o necessário para associar músicas a um culto.

**Backend.**
- Repertório da equipe: listar com busca por texto (`?search=`, case-insensitive, casando título e artista), criar, editar.
- Setlist do culto: `PUT` da lista ordenada de `{ songId, keyOverride?, note? }` (LEADER+), substituindo tudo numa transação.
- O detalhe do evento passa a devolver as músicas na ordem.

Regras: música pertence à equipe; título + artista únicos por equipe, case-insensitive (regra 20) — **esse índice não existe no banco** (Prisma não expressa índice por expressão e eu não criei por SQL), então valide no service com `mode: 'insensitive'` ou crie o índice numa migration com SQL bruto; diga qual caminho escolheu. Música usada em algum evento não pode ser excluída, apenas arquivada (`isArchived`, regra 21). A ordem (`position`) é normalizada pelo servidor em 0..n-1 a cada `PUT` (regra 22).

**App.**
- Tela de repertório com busca e criação rápida.
- Na edição do culto, seleção das músicas com **reordenação por arrastar** (`ReorderableListView`), permitindo criar uma música nova sem sair do fluxo — na prática o líder monta a lista com músicas que ainda não estão cadastradas.
- Na tela da escala, as músicas aparecem numeradas na ordem, com o tom quando houver.

**Pronto quando:** typecheck limpo; `curl` cobrindo busca, duplicata por caixa diferente, tentativa de excluir música em uso, e reordenação; `flutter analyze` limpo; `flutter test` passando; APK release compilando.

---

## Prompt — Etapa 7: Acabamento

Implemente a Etapa 7 (acabamento) do projeto, seguindo o `AGENTS.md` e o `docs/ARQUITETURA-MVP.md`.

Esta etapa não adiciona entidades: ela transforma um sistema que funciona em um produto que a equipe adota. Duas coisas aqui valem mais que todo o resto — trate-as como prioridade.

**1. Compartilhar a escala como texto.** Um botão na tela da escala que gera a mensagem formatada e abre o compartilhamento do sistema (adicione `share_plus`; até agora o projeto usa `Clipboard`, o que é aceitável mas inferior). A mensagem deve conter: nome e data do culto, horário do culto e do ensaio, a equipe agrupada por função, a lista de músicas na ordem, a paleta de cores e as observações. Formate para ler bem no WhatsApp, com emojis discretos e sem markdown (o WhatsApp não renderiza).

Este botão é o cavalo de Troia do produto: é o que faz a equipe migrar do grupo para o app sem sentir. Se a escala continuar sendo postada como imagem no grupo, o MVP falhou mesmo funcionando. Capriche no texto gerado.

**2. Duplicar culto.** `POST` que copia um culto existente — escalação e repertório inteiros — para uma nova data, com a mesma diferença entre ensaio e culto. É a funcionalidade que mais reduz trabalho do líder por linha de código escrita: hoje ele refaz a escala toda semana copiando a anterior. No app, deixe acessível direto na lista de cultos (menu do item) e na tela do culto.

**Também nesta etapa:**
- aplicar a paleta de cores (texto livre) na apresentação do card da escala, junto às observações;
- estados vazios com texto útil em todas as listas;
- tratamento de erro consistente e `pull-to-refresh` onde faz sentido;
- cache do último estado: guardar em `shared_preferences` o último JSON da agenda e do culto aberto, exibindo com um selo "atualizado às HH:mm" quando a rede falhar. **Sem SQLite e sem sincronização** — é cache de leitura, não offline real;
- uma passada acertando os **acentos** das strings visíveis ao usuário (hoje estão sem acento por um problema de encoding do início do projeto; Flutter lida com UTF-8 sem problema). Faça isso de uma vez, em todo o app.

**Pronto quando:** `flutter analyze` limpo, `flutter test` passando (inclua teste do texto gerado para compartilhamento e do fallback de cache), APK release compilando, e o `curl` da duplicação mostrando que escalação e repertório foram copiados.

---

## Prompt — Etapa 8: Distribuição

Prepare a Etapa 8 (distribuição) do projeto, seguindo o `AGENTS.md`.

O backend será hospedado no **Railway** (decisão já tomada) e o app distribuído como **APK direto**, sem loja.

**Backend / Railway.**
- Confirme que o alvo `production` do `backend/Dockerfile` está correto: ele roda `npx prisma migrate deploy && node dist/main.js` no start, e o `prisma` está em `dependencies` justamente para isso.
- Garanta que `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` e `INVITE_BASE_URL` venham todos do ambiente, sem default inseguro em produção. `JWT_SECRET` **não pode** ter default — falhar no boot é melhor que assinar token com segredo conhecido.
- O Postgres gerenciado exige `sslmode=require` na `DATABASE_URL`; verifique se o Prisma conecta.
- Adicione `GET /version` (público) devolvendo a versão da API, para o app poder avisar sobre atualização.
- Escreva em `docs/DEPLOY.md` o passo a passo real do Railway: criar o serviço a partir do Dockerfile, adicionar o PostgreSQL, definir as variáveis, apontar o healthcheck para `/health`, e como gerar um `JWT_SECRET` aleatório.

**App.**
- Gere o keystore de release e configure a assinatura (`android/key.properties` e `signingConfigs` no Gradle). **`*.jks` e `key.properties` não podem ser versionados** — o `.gitignore` já cobre; confirme. Deixe registrado que perder o keystore inviabiliza atualizar sobre a instalação existente.
- Build apontando para a URL de produção: `flutter build apk --release --dart-define=API_BASE_URL=https://<dominio-do-railway>`.
- Como a URL de produção é HTTPS, o `network_security_config.xml` continua permitindo texto claro **apenas** para os endereços locais — não afrouxe isso.
- Tela ou aviso simples de "versão nova disponível" comparando com `/version`.
- Documente no README como instalar o APK em um celular Android (habilitar origens desconhecidas, transferir o arquivo).

**Pronto quando:** o `docs/DEPLOY.md` existir e estiver completo, o APK assinado compilar, e você tiver listado o que só pode ser feito manualmente pelo dono do projeto (criar a conta no Railway, gerar o keystore com senha própria, distribuir o arquivo).

Não crie contas, não faça deploy e não gere keystore sem autorização explícita — apenas prepare tudo e instrua.

---

## Depois do MVP

Ordem sugerida, guiada pelo que a equipe vai pedir primeiro:

1. **Confirmação de presença** ("aceito / não posso") — coluna `status` em `assignments`. É a primeira coisa que pedem.
2. **Notificações** — push exige serviço; um lembrete por WhatsApp compartilhado manualmente resolve enquanto isso.
3. **Transferência de posse da equipe** (ver dívidas em `AGENTS.md`).
4. **Recuperação de senha por e-mail**, substituindo o reset pelo OWNER — necessário assim que houver mais de uma igreja usando.
5. **Disponibilidade / bloqueio de datas** pelos membros.
6. **Base de músicas externa**, usando `externalId` / `externalSource`.
