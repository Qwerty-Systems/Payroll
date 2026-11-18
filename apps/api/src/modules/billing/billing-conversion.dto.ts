import { IsDateString, IsString, Length, IsOptional } from 'class-validator';
export class ConvertQuoteDto {
  @IsString() @Length(1,80) invoiceNumber!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @Length(0,5000) notes?: string;
}
