import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { StatusWebhookDto } from './dto/status-webhook.dto';
import { WebhookSecretGuard } from './webhook-secret.guard';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(WebhookSecretGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('status')
  @HttpCode(200)
  status(@Body() dto: StatusWebhookDto) {
    return this.webhooks.apply(dto);
  }
}
