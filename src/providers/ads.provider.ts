import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';
import { AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { deliverMock } from './mock-delivery';
import { CampaignProvider, OutboundMessage, SendResult } from './provider.interface';

@Injectable()
export class AdsProvider implements CampaignProvider {
  readonly channel = Channel.ADS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  send(input: OutboundMessage): Promise<SendResult> {
    return deliverMock(this.prisma, this.config, this.channel, 'ads', input);
  }
}
