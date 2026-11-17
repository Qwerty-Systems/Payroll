import { IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateProjectDto {
  @IsString() @Length(1, 40) projectCode!: string;
  @IsString() @Length(2, 180) name!: string;
  @IsOptional() @IsString() @Length(1, 180) clientName?: string;
  @IsOptional() @IsIn(['planning','active','on_hold','completed','cancelled']) status?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
export class CreateSiteDto {
  @IsUUID() projectId!: string;
  @IsString() @Length(1, 40) siteCode!: string;
  @IsString() @Length(2, 180) name!: string;
  @IsOptional() @IsString() address?: string;
}
export class CreateWorkerDto {
  @IsString() @Length(1, 40) workerNumber!: string;
  @IsString() @Length(1, 100) firstName!: string;
  @IsString() @Length(1, 100) lastName!: string;
  @IsOptional() @IsString() @Length(1, 100) middleName?: string;
  @IsOptional() @IsString() @Length(7, 32) phone?: string;
  @IsOptional() @IsEmail() email?: string;
}
export class CreateAttendanceCorrectionDto {
  @IsOptional() @IsDateString() clockIn?: string;
  @IsOptional() @IsDateString() clockOut?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) minutesWorked?: number;
  @IsString() @Length(5,500) reason!: string;
}
export class ReviewAttendanceCorrectionDto {
  @IsString() @Length(3,500) reason!: string;
}

export class CreateAttendanceDto {
  @IsUUID() workerId!: string;
  @IsUUID() projectId!: string;
  @IsUUID() siteId!: string;
  @IsDateString() workDate!: string;
  @IsOptional() @IsDateString() clockIn?: string;
  @IsOptional() @IsDateString() clockOut?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) minutesWorked?: number;
  @IsOptional() @IsIn(['web','mobile','offline_sync','import']) source?: string;
}

export class CreatePayGradeDto {
  @IsString() @Length(1,40) code!: string;
  @IsString() @Length(2,120) name!: string;
  @IsOptional() @IsString() @Length(1,2000) description?: string;
  @IsOptional() @IsString() @Length(3,3) currency?: string;
  @IsIn(['hourly','daily','weekly','monthly','per_unit']) payBasis!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1000000000) minimumRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1000000000) midpointRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1000000000) maximumRate?: number;
}
export class UpdatePayGradeStatusDto { @IsIn(['active','inactive']) status!: string; }

export class CreateWorkerContractDto {
  @IsIn(['permanent','fixed_term','casual','piece_rate','subcontractor','independent_contractor'])
  engagementType!: string;

  @IsIn(['hourly','daily','weekly','monthly','per_unit'])
  payBasis!: string;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) @Max(1000000000)
  rateAmount!: number;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional() @IsDateString()
  effectiveTo?: string;

  @IsOptional() @IsUUID() payGradeId?: string;

  @IsOptional() @IsObject()
  terms?: Record<string, unknown>;
}

export class CreateWorkerOutputDto {
  @IsUUID() workerId!: string;
  @IsDateString() workDate!: string;
  @IsString() @Length(1,40) unitCode!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(1000000000) quantity!: number;
  @IsOptional() @IsString() @Length(1,240) description?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() siteId?: string;
}
export class RejectWorkerOutputDto { @IsString() @Length(3,500) reason!: string; }

export class EndWorkerContractDto {
  @IsDateString()
  effectiveTo!: string;
}

export class CreateShiftDto {
  @IsString() @Length(1,40) code!: string;
  @IsString() @Length(2,120) name!: string;
  @IsString() @Length(5,8) startTime!: string;
  @IsString() @Length(5,8) endTime!: string;
  @IsOptional() @IsInt() @Min(0) @Max(720) breakMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(240) graceMinutes?: number;
}
export class AssignShiftDto {
  @IsUUID() workerId!: string;
  @IsUUID() shiftId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
export class CreateLeaveRequestDto {
  @IsUUID() workerId!: string;
  @IsIn(['annual','sick','maternity','paternity','compassionate','unpaid','other']) leaveType!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsNumber({maxDecimalPlaces:2}) @Min(0.5) @Max(366) requestedDays!: number;
  @IsString() @Length(5,500) reason!: string;
}
export class SetLeaveEntitlementDto {
  @IsIn(['annual','sick','maternity','paternity','compassionate','unpaid','other']) leaveType!: string;
  @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(366) annualDays!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
export class CreateOvertimeRequestDto {
  @IsUUID() workerId!: string;
  @IsUUID() attendanceId!: string;
  @IsInt() @Min(1) @Max(1440) minutesRequested!: number;
  @IsString() @Length(5,500) reason!: string;
}
export class CreateTimesheetDto {
  @IsUUID() workerId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}
export class ReviewAttendanceWorkflowDto { @IsString() @Length(3,500) reason!: string; }
