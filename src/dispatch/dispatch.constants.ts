export const DISPATCH_QUEUE = 'campaign-dispatch';

export const STALE_SEND_MS = 30_000;

export function dispatchKey(campaignId: string, contactId: string): string {
  // BullMQ rejeita ":" no jobId. A identidade do disparo continua sendo o par.
  return `${campaignId}__${contactId}`;
}

export function eventDedupeKey(
  campaignId: string,
  contactId: string,
  status: string,
): string {
  return `${campaignId}:${contactId}:${status}`;
}
