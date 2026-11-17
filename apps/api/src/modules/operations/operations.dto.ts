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

export class CreateWorkerContractDto {
  @IsIn(['permanent','fixed_term','casual','piece_rate','subcontractor'])
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
