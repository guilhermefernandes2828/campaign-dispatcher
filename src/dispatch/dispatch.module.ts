import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { CampaignProgressService } from './campaign-progress.service';
import { DISPATCH_QUEUE } from './dispatch.constants';
import { DispatchProcessor } from './dispatch.processor';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [BullModule.registerQueue({ name: DISPATCH_QUEUE }), ProvidersModule],
  providers: [DispatchService, DispatchProcessor, CampaignProgressService],
  exports: [DispatchService, CampaignProgressService, BullModule],
})
export class DispatchModule {}
