import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';
export class CreatePayrollPeriodDto {
  @IsString() @Length(2,40) code!: string;
  @IsString() @Length(2,120) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsDateString() paymentDate?: string;
}
export class CreatePayrollRunDto { @IsString() @Length(2,40) periodId!: string; }
export class PayrollPaymentBatchDto { @IsIn(['bank_transfer','mpesa','manual']) paymentMethod!: string; }
