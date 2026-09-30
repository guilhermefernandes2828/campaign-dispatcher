import { DispatchStatus } from '@prisma/client';

const WEBHOOK_SOURCES: Record<DispatchStatus, DispatchStatus[]> = {
  [DispatchStatus.PENDING]: [],
  [DispatchStatus.QUEUED]: [],
  [DispatchStatus.SENDING]: [],
  [DispatchStatus.SENT]: [
    DispatchStatus.PENDING,
    DispatchStatus.QUEUED,
    DispatchStatus.SENDING,
  ],
  [DispatchStatus.DELIVERED]: [DispatchStatus.SENDING, DispatchStatus.SENT],
  [DispatchStatus.READ]: [
    DispatchStatus.SENDING,
    DispatchStatus.SENT,
    DispatchStatus.DELIVERED,
  ],
  [DispatchStatus.FAILED]: [
    DispatchStatus.PENDING,
    DispatchStatus.QUEUED,
    DispatchStatus.SENDING,
    DispatchStatus.SENT,
  ],
};

export function canApplyWebhook(from: DispatchStatus, to: DispatchStatus): boolean {
  if (from === to) {
    return false;
  }
  return WEBHOOK_SOURCES[to].includes(from);
}

export function alreadyHandedOff(status: DispatchStatus): boolean {
  return (
    status === DispatchStatus.SENT ||
    status === DispatchStatus.DELIVERED ||
    status === DispatchStatus.READ
  );
}

export type DispatchStats = {
  total: number;
  pending: number;
  queued: number;
  sending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
};

export function summarizeDispatches(statuses: DispatchStatus[]): DispatchStats {
  const stats: DispatchStats = {
    total: statuses.length,
    pending: 0,
    queued: 0,
    sending: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
  };
  for (const status of statuses) {
    const bucket = status.toLowerCase() as keyof Omit<DispatchStats, 'total'>;
    stats[bucket] += 1;
  }
  return stats;
}
