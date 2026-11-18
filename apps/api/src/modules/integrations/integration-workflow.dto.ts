import { IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePayoutIntentDto {
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsString() @MaxLength(160) recipientReference!: string;
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() @IsIn(['KES']) currency?: string;
  @IsOptional() @IsString() @MaxLength(80) transactionType?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class QueueIntegrationDeliveryDto {
  @IsString() @IsIn(['payslip_email','accounting_sync']) jobType!: 'payslip_email'|'accounting_sync';
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class CreateReconciliationItemDto {
  @IsString() @IsIn(['payout','accounting']) reconciliationType!: 'payout'|'accounting';
  @IsString() @MaxLength(160) internalReference!: string;
  @IsOptional() @IsString() @MaxLength(160) externalReference?: string;
  @IsOptional() @IsNumber() internalAmount?: number;
  @IsOptional() @IsNumber() externalAmount?: number;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}
