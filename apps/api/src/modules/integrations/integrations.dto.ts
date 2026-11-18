import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export type IntegrationProvider = 'daraja' | 'bank_transfer' | 'email' | 'accounting';
export type IntegrationEnvironment = 'sandbox' | 'production';

export class UpdateIntegrationSettingsDto {
  @IsIn(['daraja','bank_transfer','email','accounting'])
  provider!: IntegrationProvider;

  @IsBoolean()
  enabled!: boolean;

  @IsIn(['sandbox','production'])
  environment!: IntegrationEnvironment;

  @IsObject()
  settings!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
