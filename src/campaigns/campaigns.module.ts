import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DISPATCH_QUEUE } from '../dispatch/dispatch.constants';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [BullModule.registerQueue({ name: DISPATCH_QUEUE })],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
