import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BankTransferExportRowDto {
  @IsString() @MaxLength(160) employeeReference!: string;
  @IsString() @MaxLength(160) employeeName!: string;
  @IsString() @MaxLength(80) bankName!: string;
  @IsString() @MaxLength(80) branchCode!: string;
  @IsString() @MaxLength(80) accountNumber!: string;
  @IsString() @MaxLength(80) accountName!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class BankTransferExportDto {
  @IsString() @MaxLength(100) payrollReference!: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BankTransferExportRowDto)
  rows!: BankTransferExportRowDto[];
}
