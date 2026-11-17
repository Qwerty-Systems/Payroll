import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreatePayrollPeriodDto {
  @IsString() @Length(2,40) code!: string;
  @IsString() @Length(2,120) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsDateString() paymentDate?: string;
}

export class UpdatePayrollPeriodDto {
  @IsOptional() @IsString() @Length(2,40) code?: string;
  @IsOptional() @IsString() @Length(2,120) name?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() paymentDate?: string | null;
}

export class TransitionPayrollPeriodDto {
  @IsIn(['open','locked','closed']) status!: 'open'|'locked'|'closed';
}

export class CreatePayrollRunDto {
  @IsUUID() periodId!: string;
  @IsOptional() @IsString() @Length(0,500) description?: string;
}

export class UpdatePayrollRunDto {
  @IsOptional() @IsString() @Length(0,500) description?: string;
}

export class ReviewPayrollRunDto {
  @IsString() @Length(5,500) reason!: string;
}

export class PayrollPaymentBatchDto {
  @IsIn(['bank_transfer','mpesa','manual']) paymentMethod!: 'bank_transfer'|'mpesa'|'manual';
}

export class ConfirmPayrollPaymentDto {
  @IsString() @Length(3,160) providerReference!: string;
}
