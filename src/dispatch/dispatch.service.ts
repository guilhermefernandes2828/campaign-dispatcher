import { Injectable, Logger } from '@nestjs/common';
import { Channel, DispatchStatus } from '@prisma/client';
import { CampaignProgressService } from './campaign-progress.service';
import { STALE_SEND_MS } from './dispatch.constants';
import { DispatchJobData } from './dispatch.types';
import { alreadyHandedOff } from './status';
import { ProviderRegistry } from '../providers/provider.registry';
import { renderMessage } from '../providers/render-message';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly progress: CampaignProgressService,
  ) {}

  async execute(data: DispatchJobData): Promise<'sent' | 'skipped'> {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: data.campaignId,
          contactId: data.contactId,
        },
      },
      include: { campaign: true, contact: true },
    });
    if (!dispatch) {
      return 'skipped';
    }
    if (alreadyHandedOff(dispatch.status) || dispatch.providerMessageId || dispatch.status === DispatchStatus.FAILED) {
      return 'skipped';
    }

    const staleBefore = new Date(Date.now() - STALE_SEND_MS);
    const claimed = await this.prisma.dispatch.updateMany({
      where: {
        id: dispatch.id,
        providerMessageId: null,
        OR: [
          { status: { in: [DispatchStatus.PENDING, DispatchStatus.QUEUED] } },
          { status: DispatchStatus.SENDING, updatedAt: { lt: staleBefore } },
        ],
      },
      data: { status: DispatchStatus.SENDING },
    });
    if (claimed.count !== 1) {
      return 'skipped';
    }

    await this.progress.refresh(dispatch.campaignId);

    const destination =
      dispatch.campaign.channel === Channel.WHATSAPP
        ? dispatch.contact.phone
        : dispatch.contact.externalId;
    if (!destination) {
      await this.markFailed(data, 'Contato sem destino para o canal da campanha');
      return 'skipped';
    }

    try {
      const result = await this.providers.for(dispatch.campaign.channel).send({
        campaignId: dispatch.campaignId,
        contactId: dispatch.contactId,
        to: destination,
        body: renderMessage(dispatch.campaign.message, dispatch.contact),
      });
      const attempts = result.duplicated
        ? Math.max(dispatch.attempts, 1)
        : dispatch.attempts + 1;
      const sentAt = new Date();
      const handedOff = await this.prisma.dispatch.updateMany({
        where: { id: dispatch.id, status: DispatchStatus.SENDING },
        data: {
          status: DispatchStatus.SENT,
          providerMessageId: result.providerMessageId,
          attempts,
          sentAt,
          lastError: null,
        },
      });
      if (handedOff.count === 0) {
        await this.prisma.dispatch.updateMany({
          where: { id: dispatch.id, providerMessageId: null },
          data: {
            providerMessageId: result.providerMessageId,
            attempts,
            sentAt,
            lastError: null,
          },
        });
      }
      await this.progress.refresh(dispatch.campaignId);
      this.logger.log(
        `envio ${result.duplicated ? 'idempotente' : 'aceito'} ${dispatch.campaign.channel} ${dispatch.campaignId}:${dispatch.contactId}`,
      );
      return result.duplicated ? 'skipped' : 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no provider';
      await this.prisma.dispatch.updateMany({
        where: { id: dispatch.id, status: DispatchStatus.SENDING },
        data: {
          status: DispatchStatus.QUEUED,
          lastError: message.slice(0, 500),
          attempts: { increment: 1 },
        },
      });
      throw error;
    }
  }

  async markFailed(data: DispatchJobData, reason: string): Promise<void> {
    await this.prisma.dispatch.updateMany({
      where: {
        campaignId: data.campaignId,
        contactId: data.contactId,
        status: { in: [DispatchStatus.PENDING, DispatchStatus.QUEUED, DispatchStatus.SENDING] },
      },
      data: {
        status: DispatchStatus.FAILED,
        lastError: reason.slice(0, 500),
      },
    });
    await this.progress.refresh(data.campaignId);
  }
}
