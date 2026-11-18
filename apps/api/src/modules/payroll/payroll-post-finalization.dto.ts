import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PayrollCorrectionLineDto {
  @IsUUID() workerId!: string;
  @IsString() @Length(1,80) code!: string;
  @IsString() @Length(1,500) description!: string;
  @IsOptional() @IsNumber() earningsDelta?: number;
  @IsOptional() @IsNumber() employeeDeductionDelta?: number;
  @IsOptional() @IsNumber() employerContributionDelta?: number;
  @IsOptional() @IsNumber() netPayDelta?: number;
}
export class CreatePayrollCorrectionDto {
  @IsIn(['adjustment','reversal']) type!: 'adjustment'|'reversal';
  @IsString() @Length(8,1000) reason!: string;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>PayrollCorrectionLineDto) lines?: PayrollCorrectionLineDto[];
}
export class PayrollCorrectionReviewDto {
  @IsOptional() @IsString() @Length(5,1000) reason?: string;
}
export class PaymentFailureDto {
  @IsString() @Length(5,1000) reason!: string;
}
