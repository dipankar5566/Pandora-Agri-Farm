import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { ctxStore } from './common/request-context';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  // Request context: one AsyncLocalStorage scope per request (audit actor + requestId).
  app.use((req: any, _res: any, next: () => void) => {
    ctxStore.run({ requestId: (req.headers['x-request-id'] as string) ?? randomUUID() }, next);
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Pandora ERP API on :${port}`);
}

void bootstrap();
