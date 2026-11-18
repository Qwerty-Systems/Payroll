import {ArrayMaxSize,IsArray,IsDateString,IsNumber,IsOptional,IsString,Length,Min,ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
export class BankStatementTransactionDto {
 @IsString() @Length(1,180) reference!:string;
 @IsDateString() date!:string;
 @IsNumber() @Min(0.01) amount!:number;
 @IsOptional() @IsString() @Length(3,3) currency?:string;
 @IsOptional() @IsString() @Length(0,500) description?:string;
}
export class ImportBankStatementDto {
 @IsArray() @ArrayMaxSize(1000) @ValidateNested({each:true}) @Type(()=>BankStatementTransactionDto) transactions!:BankStatementTransactionDto[];
}
export class MatchBankTransactionDto {
 @IsString() @Length(1,80) paymentItemId!:string;
}
