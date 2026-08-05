import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // /health fica fora do prefixo: e o alvo do healthcheck do compose e do Railway.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.use(helmet());
  app.enableCors({
    origin:
      env.CORS_ORIGINS === '*'
        ? true
        : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // O Railway roda atras de proxy: sem isto o rate limit veria sempre o mesmo IP.
  app.set('trust proxy', 1);

  if (env.NODE_ENV === 'production') {
    app.enableShutdownHooks();
  } else {
    // O engine do Prisma registra seus proprios handlers de sinal, e com isso o
    // processo deixa de encerrar no SIGTERM que o `nest start --watch` envia ao
    // recarregar: o processo antigo continua segurando a porta 3000 e todo
    // restart morre com EADDRINUSE. Sair explicitamente resolve.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => process.exit(0));
    }
  }

  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(
    `API em http://localhost:${env.PORT}  (health: /health, api: /api/v1)`,
    'Bootstrap',
  );
}

void bootstrap();
