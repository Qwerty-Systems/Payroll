import { IsArray, IsDateString, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, Length, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBillingCustomerDto {
  @IsString() @Length(1,180) name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0,40) phone?: string;
  @IsOptional() @IsString() @Length(0,80) taxNumber?: string;
  @IsOptional() @IsObject() billingAddress?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(0,5000) notes?: string;
}
export class UpdateBillingCustomerDto {
  @IsOptional() @IsString() @Length(1,180) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0,40) phone?: string;
  @IsOptional() @IsString() @Length(0,80) taxNumber?: string;
  @IsOptional() @IsObject() billingAddress?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(0,5000) notes?: string;
  @IsOptional() @IsIn(['active','inactive']) status?: 'active'|'inactive';
}
export class CreateBillingPlanDto {
  @IsString() @Length(1,140) name!: string;
  @IsOptional() @IsString() @Length(0,2000) description?: string;
  @IsOptional() @IsString() @Length(3,3) currency?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsIn(['weekly','monthly','quarterly','yearly']) interval!: 'weekly'|'monthly'|'quarterly'|'yearly';
  @IsOptional() @IsNumber() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @IsArray() @IsString({each:true}) features?: string[];
}
export class UpdateBillingPlanDto {
  @IsOptional() @IsString() @Length(1,140) name?: string;
  @IsOptional() @IsString() @Length(0,2000) description?: string;
  @IsOptional() @IsString() @Length(3,3) currency?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsIn(['weekly','monthly','quarterly','yearly']) interval?: 'weekly'|'monthly'|'quarterly'|'yearly';
  @IsOptional() @IsNumber() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @IsArray() @IsString({each:true}) features?: string[];
  @IsOptional() @IsIn(['active','archived']) status?: 'active'|'archived';
}
export class CreateBillingSubscriptionDto {
  @IsString() customerId!: string;
  @IsString() planId!: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() currentPeriodStart?: string;
  @IsDateString() currentPeriodEnd!: string;
  @IsOptional() @IsDateString() nextBillingDate?: string;
  @IsOptional() @IsString() @Length(0,5000) notes?: string;
}
export class UpdateBillingSubscriptionDto {
  @IsOptional() @IsIn(['active','past_due','paused','cancelled','expired']) status?: 'active'|'past_due'|'paused'|'cancelled'|'expired';
  @IsOptional() @IsDateString() currentPeriodStart?: string;
  @IsOptional() @IsDateString() currentPeriodEnd?: string;
  @IsOptional() @IsDateString() nextBillingDate?: string;
  @IsOptional() cancelAtPeriodEnd?: boolean;
  @IsOptional() @IsString() @Length(0,5000) notes?: string;
}
