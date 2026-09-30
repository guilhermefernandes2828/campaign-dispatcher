import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DispatchStatus, Prisma } from '@prisma/client';
import { isUniqueViolation } from '../common/prisma-errors';
import { CampaignProgressService } from '../dispatch/campaign-progress.service';
import { eventDedupeKey } from '../dispatch/dispatch.constants';
import { canApplyWebhook } from '../dispatch/status';
import { PrismaService } from '../prisma/prisma.service';
import { StatusWebhookDto } from './dto/status-webhook.dto';

export type WebhookResult = {
  campaignId: string;
  contactId: string;
  status: DispatchStatus;
  applied: boolean;
  duplicate: boolean;
  stale: boolean;
};

class TransitionConflict extends Error {}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: CampaignProgressService,
  ) {}

  async apply(input: StatusWebhookDto): Promise<WebhookResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await this.tryApply(input);
      if (result !== 'retry') {
        return result;
      }
    }

    const current = await this.prisma.dispatch.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: input.campaignId,
          contactId: input.contactId,
        },
      },
    });
    if (!current) {
      throw new NotFoundException('Disparo não encontrado');
    }
    return this.result(input, current.status, false, current.status === input.status, current.status !== input.status);
  }

  private async tryApply(input: StatusWebhookDto): Promise<WebhookResult | 'retry'> {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: input.campaignId,
          contactId: input.contactId,
        },
      },
      include: { campaign: true },
    });
    if (!dispatch) {
      throw new NotFoundException('Disparo não encontrado');
    }
    if (dispatch.campaign.channel !== input.provider) {
      throw new ConflictException('Provider não corresponde ao canal da campanha');
    }
    if (dispatch.status === input.status) {
      return this.result(input, dispatch.status, false, true, false);
    }
    if (!canApplyWebhook(dispatch.status, input.status)) {
      return this.result(input, dispatch.status, false, false, true);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.deliveryEvent.create({
          data: {
            dispatchId: dispatch.id,
            status: input.status,
            provider: input.provider,
            dedupeKey: eventDedupeKey(input.campaignId, input.contactId, input.status),
            payload: {
              provider: input.provider,
              campaignId: input.campaignId,
              contactId: input.contactId,
              status: input.status,
              providerMessageId: input.providerMessageId ?? null,
            } satisfies Prisma.InputJsonObject,
          },
        });
        const updated = await tx.dispatch.updateMany({
          where: { id: dispatch.id, status: dispatch.status },
          data: {
            status: input.status,
            ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
          },
        });
        if (updated.count !== 1) {
          throw new TransitionConflict();
        }
      });
    } catch (error) {
      if (error instanceof TransitionConflict) {
        return 'retry';
      }
      if (isUniqueViolation(error)) {
        const current = await this.prisma.dispatch.findUnique({ where: { id: dispatch.id } });
        const status = current?.status ?? dispatch.status;
        return this.result(input, status, false, true, status !== input.status);
      }
      throw error;
    }

    await this.progress.refresh(input.campaignId);
    return this.result(input, input.status, true, false, false);
  }

  private result(
    input: StatusWebhookDto,
    status: DispatchStatus,
    applied: boolean,
    duplicate: boolean,
    stale: boolean,
  ): WebhookResult {
    return {
      campaignId: input.campaignId,
      contactId: input.contactId,
      status,
      applied,
      duplicate,
      stale,
    };
  }
}
