import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @IsString()
  @Length(2, 160)
  displayName!: string;

  // Optional for API clients that rely on server-side slug generation.
  @IsOptional()
  @IsString()
  @Length(3, 63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
