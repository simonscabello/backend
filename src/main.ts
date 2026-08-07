import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { AppModule } from './app.module';
import { env } from './config/env';
import { StorageService, UPLOADS_PREFIX } from './modules/storage/storage.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // /health fica fora do prefixo: e o alvo do healthcheck do compose e do Railway.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.use(helmet());

  // Fotos de perfil. Ficam fora do /api/v1 e sem JWT de proposito: o app usa
  // Image.network, que nao carrega o cabecalho Authorization, e renovar o
  // token no meio do carregamento da imagem seria um problema so nosso. O que
  // protege o arquivo e o nome (UUID v4, nao enumeravel) -- ninguem descobre
  // a foto de outra pessoa a partir do e-mail ou do id dela.
  const storage = app.get(StorageService);
  await mkdir(storage.root, { recursive: true });
  app.useStaticAssets(storage.root, {
    prefix: UPLOADS_PREFIX,
    index: false,
    // O nome muda a cada envio, entao o arquivo em si nunca e reescrito.
    maxAge: '7d',
    setHeaders: (res: ServerResponse) => {
      // helmet marca tudo como same-origin, o que faria o navegador recusar a
      // imagem em outro dominio (Flutter web / futura pagina de convite).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });
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
