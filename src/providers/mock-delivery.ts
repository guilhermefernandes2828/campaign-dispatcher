import { Channel } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env';
import { isUniqueViolation } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundMessage, SendResult } from './provider.interface';

function rejectedDestinations(): Set<string> {
  return new Set(
    (process.env.MOCK_REJECT_TO ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverMock(
  prisma: PrismaService,
  config: ConfigService<AppEnv, true>,
  channel: Channel,
  prefix: string,
  input: OutboundMessage,
): Promise<SendResult> {
  if (rejectedDestinations().has(input.to)) {
    throw new Error(`${channel} recusou o destino`);
  }

  const providerMessageId = `${prefix}_${input.campaignId}_${input.contactId}`;
  try {
    await prisma.providerSend.create({
      data: {
        campaignId: input.campaignId,
        contactId: input.contactId,
        channel,
        providerMessageId,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const existing = await prisma.providerSend.findUniqueOrThrow({
      where: {
        campaignId_contactId: {
          campaignId: input.campaignId,
          contactId: input.contactId,
        },
      },
    });
    return { providerMessageId: existing.providerMessageId, duplicated: true };
  }

  await sleep(config.getOrThrow<number>('MOCK_LATENCY_MS'));
  return { providerMessageId, duplicated: false };
}
