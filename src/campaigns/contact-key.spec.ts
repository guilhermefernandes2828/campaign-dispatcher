import { BadRequestException } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { dedupeContacts } from './contact-key';

describe('dedupeContacts', () => {
  it('colapsa o mesmo telefone na campanha de WhatsApp', () => {
    const contacts = dedupeContacts(Channel.WHATSAPP, [
      { name: 'Ana', phone: '+5511999990001' },
      { name: 'Ana 2', phone: '+5511999990001' },
      { name: 'Bruno', phone: '+5511999990002' },
    ]);

    expect(contacts.map((contact) => contact.dedupeKey)).toEqual([
      'phone:+5511999990001',
      'phone:+5511999990002',
    ]);
    expect(contacts[0].name).toBe('Ana');
  });

  it('exige externalId no canal de Ads', () => {
    expect(() => dedupeContacts(Channel.ADS, [{ name: 'Segmento' }])).toThrow(
      BadRequestException,
    );
  });
});
