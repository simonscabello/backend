# Escalas de Louvor — API

Backend NestJS + Prisma + PostgreSQL. Roda **só em Docker** (Node e Postgres
não precisam estar instalados no Windows).

Projeto **independente** do app Flutter: só se comunicam por HTTP. Arquitetura e
convenções: [`AGENTS.md`](AGENTS.md) e [`docs/`](docs/).

Conta de teste local: `samuel@teste.com` / `senhaFinal789`.

## Pré-requisitos

Docker Desktop.

## Subir o ambiente

Na pasta deste projeto:

```powershell
copy .env.example .env
docker compose up -d
```

API: `http://localhost:3000` · Banco: `localhost:5432`.

```powershell
curl.exe http://localhost:3000/health
```

Hot reload: altere arquivos em `src/` e a API reinicia em 1–3 s.

## Comandos do dia a dia

```powershell
docker compose logs -f api
docker compose exec api npx prisma migrate dev --name descricao
docker compose exec api npx prisma studio --hostname 0.0.0.0
docker compose exec api npm install <pacote>
docker compose exec api npx tsc --noEmit -p tsconfig.json
docker compose down          # preserva o banco
docker compose down -v       # apaga o banco
```

Instale dependências **dentro** do container, nunca no Windows (binários nativos
do Prisma/argon2 são Linux).

## Estrutura

```
├─ compose.yaml            api + db
├─ .env.example            copie para .env
├─ Dockerfile              development | build | production
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ src/
│  ├─ main.ts
│  ├─ config/env.ts
│  ├─ common/
│  ├─ prisma/
│  └─ modules/
└─ nodemon.json
```

Rotas de negócio: `/api/v1`. `/health` fica fora do prefixo.

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `POSTGRES_*` / `API_PORT` / `JWT_SECRET` | `.env` | compose local |
| `DATABASE_URL` | container | montada pelo compose; no Railway vem do banco |
| `PORT` | container | Railway injeta |
| `CORS_ORIGINS` | container | `*` em dev |

## Solução de problemas

| Sintoma | Solução |
|---|---|
| porta ocupada | mude `POSTGRES_PORT` / `API_PORT` no `.env` |
| hot reload parado | `docker compose restart api` |
| `@prisma/client` ausente | `docker compose exec api npx prisma generate` |
| binário Prisma/argon2 | `docker compose down -v` e `docker compose up -d --build` |
