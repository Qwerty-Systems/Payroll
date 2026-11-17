import { IsDateString, IsOptional, IsString, IsUUID, Length } from 'class-validator';
export class CreateBranchDto { @IsString() @Length(1,40) code!:string; @IsString() @Length(2,160) name!:string; @IsOptional() @IsString() address?:string; }
export class CreateDepartmentDto { @IsString() @Length(1,40) code!:string; @IsString() @Length(2,160) name!:string; @IsOptional() @IsUUID() branchId?:string; }
export class CreateCostCentreDto { @IsString() @Length(1,40) code!:string; @IsString() @Length(2,160) name!:string; }
export class CreateWorkerAssignmentDto { @IsUUID() workerId!:string; @IsOptional() @IsUUID() branchId?:string; @IsOptional() @IsUUID() departmentId?:string; @IsOptional() @IsUUID() costCentreId?:string; @IsOptional() @IsUUID() projectId?:string; @IsOptional() @IsUUID() siteId?:string; @IsDateString() effectiveFrom!:string; @IsOptional() @IsDateString() effectiveTo?:string; }

export class UpdateBranchDto {
  @IsOptional() @IsString() @Length(1,40) code?:string;
  @IsOptional() @IsString() @Length(2,160) name?:string;
  @IsOptional() @IsString() address?:string | null;
  @IsOptional() @IsString() @Length(1,20) status?:string;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(1,40) code?:string;
  @IsOptional() @IsString() @Length(2,160) name?:string;
  @IsOptional() @IsUUID() branchId?:string | null;
  @IsOptional() @IsString() @Length(1,20) status?:string;
}
export class UpdateCostCentreDto {
  @IsOptional() @IsString() @Length(1,40) code?:string;
  @IsOptional() @IsString() @Length(2,160) name?:string;
  @IsOptional() @IsString() @Length(1,20) status?:string;
}
