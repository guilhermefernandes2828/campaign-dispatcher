import { Channel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone deve estar em E.164' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9._:-]+$/, { message: 'externalId contém caracteres inválidos' })
  externalId?: string;
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsEnum(Channel)
  channel!: Channel;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts!: CreateContactDto[];
}
