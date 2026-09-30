import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DISPATCH_QUEUE } from './dispatch.constants';
import { DispatchService } from './dispatch.service';
import { DispatchJobData } from './dispatch.types';

const concurrency = Number(process.env.DISPATCH_CONCURRENCY ?? 5);

@Processor(DISPATCH_QUEUE, {
  concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 5,
})
export class DispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchProcessor.name);

  constructor(private readonly dispatch: DispatchService) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    await this.dispatch.execute(job.data);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DispatchJobData> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }
    this.logger.warn(
      `disparo esgotou tentativas ${job.data.campaignId}:${job.data.contactId}: ${error.message}`,
    );
    await this.dispatch.markFailed(job.data, error.message);
  }
}
