import { IsArray, IsDateString, IsEmail, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BillingLineDto } from './billing.dto';
export class UpdateBillingDocumentDto {
 @IsOptional() @IsString() @Length(1,80) documentNumber?:string;
 @IsOptional() @IsString() @Length(1,180) customerName?:string;
 @IsOptional() @IsEmail() customerEmail?:string;
 @IsOptional() @IsDateString() issueDate?:string;
 @IsOptional() @IsDateString() dueDate?:string;
 @IsOptional() @IsString() @Length(3,3) currency?:string;
 @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>BillingLineDto) items?:BillingLineDto[];
 @IsOptional() @IsString() @Length(0,5000) notes?:string;
}
