# syntax=docker/dockerfile:1

# Debian slim (nao Alpine): o Prisma e o argon2 tem binarios pre-compilados para
# glibc; no Alpine (musl) eles precisariam ser compilados a cada build.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- desenvolvimento (usado pelo docker compose) ----------
FROM base AS development
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---------- build ----------
FROM base AS build
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

# ---------- producao (Railway) ----------
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 3000
# migrate deploy antes de subir: o Railway roda este comando a cada release.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
