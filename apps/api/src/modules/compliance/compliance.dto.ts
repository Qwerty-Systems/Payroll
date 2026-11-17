import { IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUrl, IsUUID, Length, MaxLength } from 'class-validator';

const categories = ['tax','employee_deduction','employer_contribution','tax_relief','allowable_deduction','levy'];
export class SubmitRuleReviewDto {
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(2000) submissionNotes?: string;
}
export class ReviewDecisionDto {
  @IsString() @Length(3,2000) notes!: string;
}
export class CreateRuleChangeDto {
  @IsString() @Length(2,80) ruleCode!: string;
  @IsString() @Length(2,180) label!: string;
  @IsIn(categories) category!: string;
  @IsString() @Length(2,60) calculationMethod!: string;
  @IsObject() configuration!: Record<string, unknown>;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsString() @Length(2,240) sourceTitle!: string;
  @IsUrl({ require_protocol: true }) @Length(8,2000) sourceUrl!: string;
  @IsDateString() verifiedOn!: string;
  @IsString() @Length(10,2000) reason!: string;
}
export class UpdateRuleChangeDto {
  @IsOptional() @IsString() @Length(2,180) label?: string;
  @IsOptional() @IsIn(categories) category?: string;
  @IsOptional() @IsString() @Length(2,60) calculationMethod?: string;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @Length(2,240) sourceTitle?: string;
  @IsOptional() @IsString() @Length(8,2000) sourceUrl?: string;
  @IsOptional() @IsDateString() verifiedOn?: string;
  @IsOptional() @IsString() @Length(10,2000) reason?: string;
}
export class CreateFilingDto {
  @IsUUID() payrollPeriodId!: string;
  @IsUUID() payrollRunId!: string;
  @IsIn(['KRA','NSSF','SHA','HOUSING_LEVY','NITA','OTHER']) authority!: string;
  @IsString() @Length(2,80) filingType!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) preparationNotes?: string;
}
export class SubmitFilingDto {
  @IsString() @Length(2,180) externalReference!: string;
  @IsString() @Length(2,40) submissionChannel!: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2000) submissionEvidenceUrl?: string;
}
export class FilingRejectionDto {
  @IsString() @Length(10,2000) reason!: string;
}

export class FilingAuthorityResponseDto {
  @IsBoolean() accepted!: boolean;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
