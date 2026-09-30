import { Channel } from '@prisma/client';

export type OutboundMessage = {
  campaignId: string;
  contactId: string;
  to: string;
  body: string;
};

export type SendResult = {
  providerMessageId: string;
  duplicated: boolean;
};

export interface CampaignProvider {
  readonly channel: Channel;
  send(input: OutboundMessage): Promise<SendResult>;
}
