import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DispatchStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { AppEnv } from '../config/env';
import { DISPATCH_QUEUE, dispatchKey } from '../dispatch/dispatch.constants';
import { DispatchJobData } from '../dispatch/dispatch.types';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignView, campaignInclude, toCampaignView } from './campaign.view';
import { dedupeContacts } from './contact-key';
import { CreateCampaignDto } from './dto/create-campaign.dto';

const REQUEUEABLE: DispatchStatus[] = [
  DispatchStatus.PENDING,
  DispatchStatus.QUEUED,
  DispatchStatus.SENDING,
];

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    @InjectQueue(DISPATCH_QUEUE) private readonly queue: Queue<DispatchJobData>,
  ) {}

  async create(ownerId: string, input: CreateCampaignDto) {
    const contacts = dedupeContacts(input.channel, input.contacts);
    const created = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: input.name,
          channel: input.channel,
          message: input.message,
          ownerId,
          status: 'QUEUED',
        },
      });

      for (const contactInput of contacts) {
        const contact = await tx.contact.upsert({
          where: {
            ownerId_dedupeKey: {
              ownerId,
              dedupeKey: contactInput.dedupeKey,
            },
          },
          create: {
            ownerId,
            dedupeKey: contactInput.dedupeKey,
            name: contactInput.name,
            phone: contactInput.phone,
            externalId: contactInput.externalId,
          },
          update: {
            name: contactInput.name ?? undefined,
            phone: contactInput.phone,
            externalId: contactInput.externalId,
          },
        });

        await tx.dispatch.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: DispatchStatus.QUEUED,
          },
        });
      }

      return campaign;
    }, { timeout: 20_000 });

    const contactIds = await this.contactIds(created.id);
    try {
      await this.enqueue(created.id, contactIds);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'falha na fila';
      this.logger.error(`fila indisponível para a campanha ${created.id}: ${reason}`);
      throw new ServiceUnavailableException({
        message: 'Campanha gravada, mas a fila falhou. Repita POST /campaigns/:id/enqueue.',
        campaignId: created.id,
      });
    }

    const campaign = await this.getById(ownerId, created.id);
    return { enqueued: contactIds.length, campaign };
  }

  async enqueueExisting(ownerId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, ownerId },
      include: { dispatches: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }
    const contactIds = campaign.dispatches
      .filter((dispatch) => REQUEUEABLE.includes(dispatch.status))
      .map((dispatch) => dispatch.contactId);
    if (contactIds.length > 0) {
      await this.enqueue(campaignId, contactIds);
    }
    return { campaignId, enqueued: contactIds.length };
  }

  async list(ownerId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: { dispatches: { select: { status: true } } },
    });
    return campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      createdAt: campaign.createdAt,
      total: campaign.dispatches.length,
    }));
  }

  async getById(ownerId: string, id: string): Promise<CampaignView> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, ownerId },
      include: campaignInclude,
    });
    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }
    return toCampaignView(campaign);
  }

  private async contactIds(campaignId: string): Promise<string[]> {
    const dispatches = await this.prisma.dispatch.findMany({
      where: { campaignId },
      select: { contactId: true },
    });
    return dispatches.map((dispatch) => dispatch.contactId);
  }

  private async enqueue(campaignId: string, contactIds: string[]): Promise<void> {
    if (contactIds.length === 0) {
      return;
    }
    const attempts = this.config.getOrThrow<number>('DISPATCH_ATTEMPTS');
    await this.queue.addBulk(
      contactIds.map((contactId) => ({
        name: 'send',
        data: { campaignId, contactId },
        opts: {
          jobId: dispatchKey(campaignId, contactId),
          attempts,
          backoff: { type: 'exponential' as const, delay: 200 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      })),
    );
  }
}
