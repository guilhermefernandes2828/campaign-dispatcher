import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { WebhookSecretGuard } from './webhook-secret.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [DispatchModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookSecretGuard],
})
export class WebhooksModule {}
