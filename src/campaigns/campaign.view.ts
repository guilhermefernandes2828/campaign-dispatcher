import { Channel, CampaignStatus, DispatchStatus, Prisma } from '@prisma/client';
import { summarizeDispatches } from '../dispatch/status';

const campaignInclude = {
  dispatches: {
    include: {
      contact: true,
      events: { orderBy: { createdAt: 'asc' as const } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CampaignInclude;

export type CampaignRecord = Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;

export { campaignInclude };

export type CampaignView = {
  id: string;
  name: string;
  channel: Channel;
  message: string;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
  stats: ReturnType<typeof summarizeDispatches>;
  dispatches: Array<{
    id: string;
    contactId: string;
    status: DispatchStatus;
    attempts: number;
    providerMessageId: string | null;
    lastError: string | null;
    sentAt: Date | null;
    contact: {
      id: string;
      name: string | null;
      phone: string | null;
      externalId: string | null;
    };
    events: Array<{
      id: string;
      status: DispatchStatus;
      provider: Channel;
      createdAt: Date;
    }>;
  }>;
};

export function toCampaignView(campaign: CampaignRecord): CampaignView {
  return {
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    message: campaign.message,
    status: campaign.status,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    stats: summarizeDispatches(campaign.dispatches.map((dispatch) => dispatch.status)),
    dispatches: campaign.dispatches.map((dispatch) => ({
      id: dispatch.id,
      contactId: dispatch.contactId,
      status: dispatch.status,
      attempts: dispatch.attempts,
      providerMessageId: dispatch.providerMessageId,
      lastError: dispatch.lastError,
      sentAt: dispatch.sentAt,
      contact: {
        id: dispatch.contact.id,
        name: dispatch.contact.name,
        phone: dispatch.contact.phone,
        externalId: dispatch.contact.externalId,
      },
      events: dispatch.events.map((event) => ({
        id: event.id,
        status: event.status,
        provider: event.provider,
        createdAt: event.createdAt,
      })),
    })),
  };
}
