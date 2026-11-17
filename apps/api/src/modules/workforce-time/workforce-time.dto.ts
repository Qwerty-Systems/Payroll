import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateShiftDto {
  @IsString() @Length(1, 40) code!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsInt() @Min(0) @Max(720) breakMinutes?: number;
  @IsOptional() @IsBoolean() crossesMidnight?: boolean;
}
export class UpdateShiftDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsInt() @Min(0) @Max(720) breakMinutes?: number;
  @IsOptional() @IsBoolean() crossesMidnight?: boolean;
  @IsOptional() @IsIn(['active','inactive']) status?: string;
}
export class CreateLeaveTypeDto {
  @IsString() @Length(1, 40) code!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(366) annualEntitlementDays!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(366) carryForwardLimitDays?: number;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
}
export class SetLeaveBalanceDto {
  @IsUUID() workerId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsInt() @Min(2000) @Max(2200) leaveYear!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) openingDays?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) accruedDays?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) adjustmentDays?: number;
}
export class CreateLeaveRequestDto {
  @IsUUID() workerId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.5) @Max(366) requestedDays!: number;
  @IsOptional() @IsString() @Length(3, 1000) reason?: string;
}
export class ReviewLeaveRequestDto { @IsString() @Length(3, 500) reason!: string; }
export class CreateOvertimeRequestDto {
  @IsUUID() workerId!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsDateString() workDate!: string;
  @IsInt() @Min(1) @Max(1440) requestedMinutes!: number;
  @IsString() @Length(5, 500) reason!: string;
}
export class ReviewOvertimeRequestDto {
  @IsString() @Length(3, 500) reason!: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) approvedMinutes?: number;
}
