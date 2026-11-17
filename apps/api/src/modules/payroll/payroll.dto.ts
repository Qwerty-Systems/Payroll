import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
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

export class CreateWorkerPayComponentDto {
  @IsString() @Length(1,40) code!: string;
  @IsString() @Length(2,120) name!: string;
  @IsIn(['allowance','deduction','benefit']) componentType!: 'allowance'|'deduction'|'benefit';
  @IsIn(['fixed','percentage_of_base']) calculationMethod!: 'fixed'|'percentage_of_base';
  @IsNumber({maxDecimalPlaces:4}) @Min(0) @Max(1000000000) amount!: number;
  @IsOptional() @IsBoolean() taxable?: boolean;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
