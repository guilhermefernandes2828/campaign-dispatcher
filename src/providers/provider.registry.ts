import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { AdsProvider } from './ads.provider';
import { CampaignProvider } from './provider.interface';
import { WhatsappProvider } from './whatsapp.provider';

@Injectable()
export class ProviderRegistry {
  constructor(
    private readonly whatsapp: WhatsappProvider,
    private readonly ads: AdsProvider,
  ) {}

  for(channel: Channel): CampaignProvider {
    if (channel === Channel.WHATSAPP) {
      return this.whatsapp;
    }
    if (channel === Channel.ADS) {
      return this.ads;
    }
    throw new InternalServerErrorException(`Canal sem provider: ${channel}`);
  }
}
