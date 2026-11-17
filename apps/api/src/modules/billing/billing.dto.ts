import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min, IsDateString } from 'class-validator';

export class CreateSubscriptionRequestDto { @IsUUID() planId!:string; }
export class BillingLineDto {
  @IsString() @Length(2,240) description!:string;
  @IsNumber({maxDecimalPlaces:3}) @Min(0.001) quantity!:number;
  @IsInt() @Min(0) unitPriceMinor!:number;
  @IsOptional() @IsNumber({maxDecimalPlaces:4}) @Min(0) @Max(1) taxRate?:number;
}
export class CreateQuoteDto {
  @IsString() @Length(2,180) customerName!:string;
  @IsOptional() @IsEmail() customerEmail?:string;
  @IsString() @Length(3,3) currency!:string;
  @IsOptional() @IsDateString() validUntil?:string;
  @IsOptional() @IsString() @Length(0,2000) notes?:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsObject({each:true}) lines!:BillingLineDto[];
}
export class CreateInvoiceDto extends CreateQuoteDto { @IsDateString() dueDate!:string; }
export class CreateRecurringScheduleDto {
  @IsString() @Length(2,160) name!:string;
  @IsString() @Length(2,180) customerName!:string;
  @IsOptional() @IsEmail() customerEmail?:string;
  @IsString() @Length(3,3) currency!:string;
  @IsIn(['monthly','yearly']) frequency!:string;
  @IsDateString() nextRunDate!:string;
  @IsInt() @Min(0) @Max(365) dueDays!:number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsObject({each:true}) lines!:BillingLineDto[];
}
export class RecordBillingPaymentDto {
  @IsUUID() invoiceId!:string;
  @IsInt() @Min(1) amountMinor!:number;
  @IsString() @Length(3,3) currency!:string;
  @IsIn(['bank_transfer','mpesa','card','cash','other']) method!:string;
  @IsString() @Length(3,160) externalReference!:string;
}
export class ReconcileBillingPaymentDto {
  @IsIn(['confirm','reverse']) action!:string;
  @IsString() @Length(5,1000) reason!:string;
}
