import { BadRequestException } from '@nestjs/common';
import { Channel } from '@prisma/client';

export type ContactInput = {
  name?: string;
  phone?: string;
  externalId?: string;
};

export type NormalizedContact = {
  dedupeKey: string;
  name: string | null;
  phone: string | null;
  externalId: string | null;
};

export function normalizeContact(
  channel: Channel,
  input: ContactInput,
  index: number,
): NormalizedContact {
  if (channel === Channel.WHATSAPP) {
    if (!input.phone) {
      throw new BadRequestException(`contacts[${index}] exige phone para WhatsApp`);
    }
    return {
      dedupeKey: `phone:${input.phone}`,
      name: input.name ?? null,
      phone: input.phone,
      externalId: input.externalId ?? null,
    };
  }

  if (!input.externalId) {
    throw new BadRequestException(`contacts[${index}] exige externalId para Ads`);
  }

  return {
    dedupeKey: `ext:${input.externalId}`,
    name: input.name ?? null,
    phone: input.phone ?? null,
    externalId: input.externalId,
  };
}

export function dedupeContacts(channel: Channel, contacts: ContactInput[]): NormalizedContact[] {
  const unique = new Map<string, NormalizedContact>();
  contacts.forEach((contact, index) => {
    const normalized = normalizeContact(channel, contact, index);
    if (!unique.has(normalized.dedupeKey)) {
      unique.set(normalized.dedupeKey, normalized);
    }
  });
  return [...unique.values()];
}
