import { ArrayMaxSize, IsArray, IsIn, IsObject, IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDeviceDto {
  @IsString() @Length(2, 120) name!: string;
  @IsIn(['android', 'ios', 'windows', 'macos', 'linux', 'web', 'other']) platform!: string;
}

export class SyncCommandDto {
  @IsUUID() commandId!: string;
  @IsUUID() deviceId!: string;
  @IsIn(['attendance']) entityType!: string;
  @IsIn(['create']) operation!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class SyncBatchDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SyncCommandDto)
  commands!: SyncCommandDto[];
}

export class ResolveSyncConflictDto {
  @IsString() @Length(3, 500)
  resolution!: string;
}
