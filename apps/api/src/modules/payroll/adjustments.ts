/**
 * Pure calculation of tenant-configured allowances and non-statutory deductions.
 * No database, network or clock access; deterministic for a given input.
 * Unsupported source data or tax treatment emits blocking warnings instead of guessing.
 */
export type AllowanceMethod = 'fixed_amount' | 'per_day' | 'per_hour' | 'percentage' | 'quantity_times_rate';
export type DeductionMethod = 'fixed_amount' | 'percentage' | 'balance_recovery';
export interface AllowanceAssignmentInput {
  assignmentId:string; typeId:string; code:string; name:string; method:AllowanceMethod; taxTreatment:string;
  configuration:Record<string,unknown>; typeEnabled:boolean; typeEffectiveFrom:string; typeEffectiveTo:string|null;
  amount:number; effectiveFrom:string; effectiveTo:string|null; approvedDays:number; approvedMinutes:number;
}
export interface DeductionAssignmentInput {
  assignmentId:string; typeId:string; code:string; name:string; method:DeductionMethod; taxableTreatment:string;
  configuration:Record<string,unknown>; typeEnabled:boolean; typeEffectiveFrom:string; typeEffectiveTo:string|null;
  amount:number; outstandingBalance:number|null; effectiveFrom:string; effectiveTo:string|null;
}
export interface AllowanceLine {assignmentId:string;typeId:string;code:string;name:string;method:AllowanceMethod;taxable:boolean;quantity:number|null;unit:string|null;rate:number;amount:number}
export interface DeductionLine {assignmentId:string;typeId:string;code:string;name:string;method:DeductionMethod;amount:number;balanceBefore:number|null;balanceAfter:number|null}
export interface AllowanceResult {lines:AllowanceLine[];taxableTotal:number;nonTaxableTotal:number;total:number;warnings:string[]}
export interface DeductionResult {lines:DeductionLine[];total:number;warnings:string[]}
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const utc=(value:string)=>new Date(value.slice(0,10)+'T00:00:00.000Z');
const daysInclusive=(a:Date,b:Date)=>Math.floor((b.getTime()-a.getTime())/86400000)+1;
function overlapDays(periodStart:string,periodEnd:string,from:string,to:string|null):number{
 const ps=utc(periodStart),pe=utc(periodEnd),f=utc(from),t=to?utc(to):pe;
 const start=f>ps?f:ps,end=t<pe?t:pe;return end<start?0:daysInclusive(start,end);
}
function typeCoversPeriod(ps:string,pe:string,from:string,to:string|null):boolean{return overlapDays(ps,pe,from,to)>0;}
function requireFinite(value:number,what:string){if(!Number.isFinite(value)||value<0)throw new Error(what+' must be a finite non-negative amount.');}
export function calculateAllowances(input:{periodStart:string;periodEnd:string;basicEarnings:number;assignments:AllowanceAssignmentInput[]}):AllowanceResult{
 const lines:AllowanceLine[]=[],warnings:string[]=[];let taxableTotal=0,nonTaxableTotal=0;
 const start=utc(input.periodStart),daysInMonth=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
 for(const a of input.assignments){
  requireFinite(a.amount,'Allowance amount for '+a.code);
  const windowDays=overlapDays(input.periodStart,input.periodEnd,a.effectiveFrom,a.effectiveTo);if(windowDays===0)continue;
  if(!a.typeEnabled){warnings.push(a.code+':ALLOWANCE_TYPE_DISABLED');continue;}
  if(!typeCoversPeriod(input.periodStart,input.periodEnd,a.typeEffectiveFrom,a.typeEffectiveTo)){warnings.push(a.code+':ALLOWANCE_TYPE_NOT_EFFECTIVE');continue;}
  let amount=0,quantity:number|null=null,unit:string|null=null,blocked:string|null=null;
  switch(a.method){
   case 'fixed_amount':{const prorate=a.configuration.prorate===true;quantity=prorate?windowDays/daysInMonth:1;unit=prorate?'month':'period';amount=money(a.amount*quantity);break;}
   case 'per_day':quantity=a.approvedDays;unit='approved_day';amount=money(a.amount*quantity);break;
   case 'per_hour':if(a.configuration.hoursBasis==='all_approved_hours'){quantity=a.approvedMinutes/60;unit='approved_hour';amount=money(a.amount*quantity);}else blocked='ALLOWANCE_HOURS_SOURCE_NOT_AVAILABLE';break;
   case 'percentage':{const base=a.configuration.base??'basic_earnings';if(base!=='basic_earnings')blocked='ALLOWANCE_UNSUPPORTED_PERCENTAGE_BASE';else{quantity=input.basicEarnings;unit='basic_earnings';amount=money(input.basicEarnings*a.amount/100);}break;}
   case 'quantity_times_rate':blocked='ALLOWANCE_QUANTITY_SOURCE_NOT_AVAILABLE';break;
   default:blocked='ALLOWANCE_UNSUPPORTED_METHOD';
  }
  if(blocked)warnings.push(a.code+':'+blocked);
  let taxable:boolean;if(a.taxTreatment==='taxable')taxable=true;else if(a.taxTreatment==='non_taxable')taxable=false;else{taxable=true;warnings.push(a.code+':ALLOWANCE_TAX_TREATMENT_REQUIRES_REVIEW');}
  lines.push({assignmentId:a.assignmentId,typeId:a.typeId,code:a.code,name:a.name,method:a.method,taxable,quantity,unit,rate:a.amount,amount});
  if(taxable)taxableTotal=money(taxableTotal+amount);else nonTaxableTotal=money(nonTaxableTotal+amount);
 }
 return {lines,taxableTotal,nonTaxableTotal,total:money(taxableTotal+nonTaxableTotal),warnings};
}
export function calculateOtherDeductions(input:{periodStart:string;periodEnd:string;basicEarnings:number;grossEarnings:number;assignments:DeductionAssignmentInput[]}):DeductionResult{
 const lines:DeductionLine[]=[],warnings:string[]=[];let total=0;
 for(const d of input.assignments){
  requireFinite(d.amount,'Deduction amount for '+d.code);if(d.outstandingBalance!==null)requireFinite(d.outstandingBalance,'Outstanding balance for '+d.code);
  if(overlapDays(input.periodStart,input.periodEnd,d.effectiveFrom,d.effectiveTo)===0)continue;
  if(!d.typeEnabled){warnings.push(d.code+':DEDUCTION_TYPE_DISABLED');continue;}
  if(!typeCoversPeriod(input.periodStart,input.periodEnd,d.typeEffectiveFrom,d.typeEffectiveTo)){warnings.push(d.code+':DEDUCTION_TYPE_NOT_EFFECTIVE');continue;}
  if(d.taxableTreatment==='pre_tax')warnings.push(d.code+':DEDUCTION_PRE_TAX_TREATMENT_NOT_SUPPORTED');else if(d.taxableTreatment==='review_required')warnings.push(d.code+':DEDUCTION_ASSUMED_POST_TAX');
  let amount=0,balanceBefore:number|null=null,balanceAfter:number|null=null;
  switch(d.method){
   case 'fixed_amount':amount=money(d.amount);break;
   case 'percentage':{const base=d.configuration.base==='basic_earnings'?input.basicEarnings:input.grossEarnings;amount=money(base*d.amount/100);break;}
   case 'balance_recovery':{if(d.outstandingBalance===null){warnings.push(d.code+':DEDUCTION_RECOVERY_BALANCE_MISSING');continue;}balanceBefore=money(d.outstandingBalance);if(balanceBefore===0)continue;amount=money(Math.min(d.amount,balanceBefore));balanceAfter=money(balanceBefore-amount);break;}
   default:warnings.push(d.code+':DEDUCTION_UNSUPPORTED_METHOD');continue;
  }
  if(amount===0)continue;
  lines.push({assignmentId:d.assignmentId,typeId:d.typeId,code:d.code,name:d.name,method:d.method,amount,balanceBefore,balanceAfter});total=money(total+amount);
 }
 return {lines,total,warnings};
}
export const BLOCKING_WARNING_SUFFIXES:readonly string[]=[
 'NET_PAY_NEGATIVE','WORKER_CLASSIFICATION_REQUIRES_STATUTORY_REVIEW','NO_APPROVED_EARNING_UNITS','CONTRACT_NOT_ACTIVE_IN_PAY_PERIOD','MONTHLY_CONTRACT_PARTIAL_PERIOD_REQUIRES_REVIEW',
 'ALLOWANCE_TYPE_DISABLED','ALLOWANCE_TYPE_NOT_EFFECTIVE','ALLOWANCE_HOURS_SOURCE_NOT_AVAILABLE','ALLOWANCE_UNSUPPORTED_PERCENTAGE_BASE',
 'ALLOWANCE_QUANTITY_SOURCE_NOT_AVAILABLE','ALLOWANCE_UNSUPPORTED_METHOD','ALLOWANCE_DUPLICATE_ASSIGNMENT','ALLOWANCE_TAX_TREATMENT_REQUIRES_REVIEW',
 'OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED','OVERTIME_BASE_RATE_UNSUPPORTED_FOR_PAY_BASIS',
 'DEDUCTION_TYPE_DISABLED','DEDUCTION_TYPE_NOT_EFFECTIVE','DEDUCTION_PRE_TAX_TREATMENT_NOT_SUPPORTED','DEDUCTION_RECOVERY_BALANCE_MISSING','DEDUCTION_UNSUPPORTED_METHOD'
];
export const BLOCKING_RUN_WARNINGS:readonly string[]=['STATUTORY_RULESET_REQUIRES_PLATFORM_COMPLIANCE_APPROVAL','ALLOWANCE_ASSIGNMENTS_NOT_INCLUDED_IN_THIS_ENGINE_VERSION','NON_STATUTORY_DEDUCTION_ASSIGNMENTS_NOT_INCLUDED_IN_THIS_ENGINE_VERSION'];
export function blockingWarnings(warnings:string[]):string[]{return warnings.filter(w=>BLOCKING_RUN_WARNINGS.includes(w)||BLOCKING_WARNING_SUFFIXES.some(s=>w.endsWith(':'+s)));}
