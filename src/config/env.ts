import { z } from 'zod';

/// O compose sempre define as variaveis opcionais (`${VAR:-}`), e "" nao
/// passa em `.optional()` -- vira ausente aqui.
const vazioComoAusente = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // O Railway injeta PORT dinamicamente.
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatoria'),
  // "*" libera tudo (uso local). Em producao, lista separada por virgula.
  CORS_ORIGINS: z.string().default('*'),
  APP_VERSION: z.string().default('0.1.0'),

  /// Raiz dos arquivos enviados pelos usuarios (hoje so as fotos de perfil,
  /// em <STORAGE_DIR>/avatars). Precisa apontar para um disco que sobreviva
  /// ao deploy: no Railway, o caminho de montagem do Volume (/data). Em
  /// desenvolvimento, uma pasta dentro do projeto -- o bind mount do compose
  /// leva os arquivos para `backend/storage` no Windows.
  STORAGE_DIR: z.string().min(1).default('./storage'),

  // Autenticacao. JWT_SECRET nao tem default de proposito: em producao ele
  // precisa ser definido explicitamente, e falhar no boot e melhor do que
  // assinar tokens com um segredo conhecido.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de no minimo 32 caracteres'),
  // Em segundos. Numero, e nao "1h", porque o tipo de `expiresIn` do
  // jsonwebtoken so aceita string em formatos especificos.
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(60),

  /// Base do link de convite (ex.: https://escalas.exemplo.com/convite).
  /// Sem ela a API devolve `url: null` e o app compartilha so o código --
  /// util enquanto nao ha uma pagina publica hospedada.
  ///
  /// O preprocess trata string vazia como ausente: o docker compose sempre
  /// define a variavel (`${INVITE_BASE_URL:-}`), e "" nao passa em .url().
  /// Busca de musicas no Spotify (so a busca -- o audio-features foi
  /// descontinuado). Opcionais: sem elas a rota de busca externa devolve
  /// lista vazia e a API sobe normalmente. Em producao, definir no Railway.
  SPOTIFY_CLIENT_ID: z.preprocess(vazioComoAusente, z.string().optional()),
  SPOTIFY_CLIENT_SECRET: z.preprocess(vazioComoAusente, z.string().optional()),

  INVITE_BASE_URL: z.preprocess(vazioComoAusente, z.string().url().optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Variaveis de ambiente inválidas:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
