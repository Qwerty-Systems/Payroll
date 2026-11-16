import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
export class CreatePayrollPeriodDto {
  @IsString() @Length(2,40) code!: string;
  @IsString() @Length(2,120) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsDateString() paymentDate?: string;
}
export class CreatePayrollRunDto { @IsUUID() periodId!: string; }
export class PayrollPaymentBatchDto { @IsIn(['bank_transfer','mpesa','manual']) paymentMethod!: 'bank_transfer'|'mpesa'|'manual'; }
export class ConfirmPayrollPaymentDto { @IsString() @Length(3,160) providerReference!: string; }
