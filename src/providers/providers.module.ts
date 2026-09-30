import { Module } from '@nestjs/common';
import { AdsProvider } from './ads.provider';
import { ProviderRegistry } from './provider.registry';
import { WhatsappProvider } from './whatsapp.provider';

@Module({
  providers: [WhatsappProvider, AdsProvider, ProviderRegistry],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
