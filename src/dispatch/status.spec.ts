import { DispatchStatus } from '@prisma/client';
import { canApplyWebhook, summarizeDispatches } from './status';

describe('canApplyWebhook', () => {
  it('aceita entrega e leitura na ordem do provider', () => {
    expect(canApplyWebhook(DispatchStatus.SENT, DispatchStatus.DELIVERED)).toBe(true);
    expect(canApplyWebhook(DispatchStatus.SENDING, DispatchStatus.DELIVERED)).toBe(true);
    expect(canApplyWebhook(DispatchStatus.DELIVERED, DispatchStatus.READ)).toBe(true);
    expect(canApplyWebhook(DispatchStatus.SENT, DispatchStatus.READ)).toBe(true);
  });

  it('trata o mesmo status como duplicado e recusa regressão', () => {
    expect(canApplyWebhook(DispatchStatus.DELIVERED, DispatchStatus.DELIVERED)).toBe(false);
    expect(canApplyWebhook(DispatchStatus.DELIVERED, DispatchStatus.SENT)).toBe(false);
    expect(canApplyWebhook(DispatchStatus.READ, DispatchStatus.FAILED)).toBe(false);
    expect(canApplyWebhook(DispatchStatus.DELIVERED, DispatchStatus.FAILED)).toBe(false);
  });

  it('aceita falha enquanto o disparo ainda não foi entregue', () => {
    expect(canApplyWebhook(DispatchStatus.SENT, DispatchStatus.FAILED)).toBe(true);
    expect(canApplyWebhook(DispatchStatus.QUEUED, DispatchStatus.FAILED)).toBe(true);
  });
});

describe('summarizeDispatches', () => {
  it('conta cada status', () => {
    expect(
      summarizeDispatches([DispatchStatus.SENT, DispatchStatus.DELIVERED, DispatchStatus.SENT]),
    ).toMatchObject({
      total: 3,
      sent: 2,
      delivered: 1,
      failed: 0,
    });
  });
});
