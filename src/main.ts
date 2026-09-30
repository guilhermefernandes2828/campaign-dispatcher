import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation';
import { AppEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  const config = app.get(ConfigService<AppEnv, true>);
  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(`campaign-dispatcher escutando na porta ${port}`, 'Bootstrap');
}

void bootstrap();
