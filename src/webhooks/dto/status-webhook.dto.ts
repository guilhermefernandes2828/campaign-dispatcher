import { Channel, DispatchStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const WEBHOOK_STATUSES = [
  DispatchStatus.SENT,
  DispatchStatus.DELIVERED,
  DispatchStatus.READ,
  DispatchStatus.FAILED,
] as const;

export class StatusWebhookDto {
  @IsEnum(Channel)
  provider!: Channel;

  @IsString()
  @MaxLength(64)
  campaignId!: string;

  @IsString()
  @MaxLength(64)
  contactId!: string;

  @IsIn(WEBHOOK_STATUSES)
  status!: DispatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerMessageId?: string;
}
