import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SaveAccountMappingDto {
  @IsString() @Matches(/^[A-Z0-9_.:-]{1,100}$/) componentCode!: string;
  @IsString() @MaxLength(200) componentLabel!: string;
  @IsString() @MaxLength(80) debitAccountCode!: string;
  @IsString() @MaxLength(80) creditAccountCode!: string;
  @IsOptional() @IsString() @MaxLength(80) costCenterCode?: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveTo?: string;
}
