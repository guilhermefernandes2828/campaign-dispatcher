import { Injectable } from '@nestjs/common';
import { CampaignStatus, DispatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const IN_FLIGHT = new Set<DispatchStatus>([
  DispatchStatus.PENDING,
  DispatchStatus.QUEUED,
  DispatchStatus.SENDING,
]);

@Injectable()
export class CampaignProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async refresh(campaignId: string): Promise<void> {
    const rows = await this.prisma.dispatch.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const present = rows.map((row) => row.status);
    const inFlight = present.some((status) => IN_FLIGHT.has(status));
    const anyHandedOff = present.some((status) => !IN_FLIGHT.has(status));
    const anySending = present.includes(DispatchStatus.SENDING);

    let status: CampaignStatus;
    if (present.length === 0 || (inFlight && !anySending && !anyHandedOff)) {
      status = CampaignStatus.QUEUED;
    } else if (inFlight) {
      status = CampaignStatus.DISPATCHING;
    } else if (present.every((item) => item === DispatchStatus.FAILED)) {
      status = CampaignStatus.FAILED;
    } else {
      status = CampaignStatus.COMPLETED;
    }

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status },
    });
  }
}
