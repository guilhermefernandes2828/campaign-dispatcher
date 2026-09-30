import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeStringEqual } from '../common/timing-safe-equal';
import { AppEnv } from '../config/env';

@Injectable()
export class WebhookSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-webhook-secret') ?? '';
    const expected = this.config.getOrThrow<string>('WEBHOOK_SECRET');
    if (!provided || !timingSafeStringEqual(provided, expected)) {
      throw new UnauthorizedException('Segredo do webhook inválido');
    }
    return true;
  }
}
