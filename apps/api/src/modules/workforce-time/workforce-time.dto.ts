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
export class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(366) annualEntitlementDays?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(366) carryForwardLimitDays?: number;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsIn(['active','inactive']) status?: string;
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


export class CreateTimesheetDto {
  @IsUUID() workerId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsString() @Length(1, 1000) notes?: string;
}
export class UpdateTimesheetDto {
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @IsString() @Length(1, 1000) notes?: string | null;
}
export class CreateTimesheetLineDto {
  @IsDateString() workDate!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsInt() @Min(0) @Max(1440) minutesWorked!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) overtimeMinutes?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1000000000) unitsCompleted?: number;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}
export class UpdateTimesheetLineDto {
  @IsOptional() @IsDateString() workDate?: string;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsUUID() siteId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) minutesWorked?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) overtimeMinutes?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1000000000) unitsCompleted?: number | null;
  @IsOptional() @IsString() @Length(1, 500) description?: string | null;
}
export class ReviewTimesheetDto { @IsString() @Length(3, 500) reason!: string; }
