export type PayBasis = 'monthly'|'weekly'|'daily'|'hourly'|'per_unit';
export interface PayBasisInput {
  payBasis: PayBasis;
  rate: number;
  periodStart: string;
  periodEnd: string;
  contractStart: string;
  contractEnd?: string | null;
  approvedDays?: number;
  approvedMinutes?: number;
  approvedUnits?: number;
}
export interface PayBasisResult {
  amount: number;
  quantity: number;
  unit: string;
  warnings: string[];
}
const money = (n:number) => Math.round((n + Number.EPSILON) * 100) / 100;
const utc = (value:string) => new Date(value.slice(0,10)+'T00:00:00.000Z');
const daysBetween = (a:Date,b:Date) => Math.floor((b.getTime()-a.getTime())/86400000)+1;

/** Deterministic gross earnings from approved source quantities and effective contract dates. */
export function calculateContractEarnings(input:PayBasisInput):PayBasisResult {
  if(!Number.isFinite(input.rate)||input.rate<0) throw new Error('Contract rate must be a finite non-negative amount.');
  const start=utc(input.periodStart), end=utc(input.periodEnd);
  const contractStart=utc(input.contractStart);
  const contractEnd=input.contractEnd?utc(input.contractEnd):end;
  if([start,end,contractStart,contractEnd].some(d=>Number.isNaN(d.getTime()))||end<start) throw new Error('Invalid payroll or contract date range.');
  const activeStart=contractStart>start?contractStart:start;
  const activeEnd=contractEnd<end?contractEnd:end;
  const activeDays=activeEnd<activeStart?0:daysBetween(activeStart,activeEnd);
  let quantity=0,unit='',amount=0;
  switch(input.payBasis){
    case 'monthly': {
      unit='month';
      if(activeDays===0) quantity=0;
      else if(activeStart.getTime()!==start.getTime()||activeEnd.getTime()!==end.getTime()) {
        // V1 deliberately does not guess a joiner/leaver proration convention.
        // A blocking warning prevents this zero-value preview from being finalized.
        quantity=0;
      } else { quantity=1; amount=money(input.rate); }
      break;
    }
    case 'weekly': quantity=activeDays/7;unit='week';amount=money(input.rate*quantity);break;
    case 'daily': quantity=input.approvedDays??0;unit='approved_day';amount=money(input.rate*quantity);break;
    case 'hourly': quantity=(input.approvedMinutes??0)/60;unit='approved_hour';amount=money(input.rate*quantity);break;
    case 'per_unit': quantity=input.approvedUnits??0;unit='approved_unit';amount=money(input.rate*quantity);break;
    default: throw new Error('Unsupported contract pay basis.');
  }
  if(!Number.isFinite(quantity)||quantity<0) throw new Error('Approved earning quantity must be finite and non-negative.');
  const warnings:string[]=[];
  if(activeDays===0) warnings.push('CONTRACT_NOT_ACTIVE_IN_PAY_PERIOD');
  if(input.payBasis==='monthly'&&activeDays>0&&(activeStart.getTime()!==start.getTime()||activeEnd.getTime()!==end.getTime())) warnings.push('MONTHLY_CONTRACT_PARTIAL_PERIOD_REQUIRES_REVIEW');
  if(['daily','hourly','per_unit'].includes(input.payBasis)&&quantity===0) warnings.push('NO_APPROVED_EARNING_UNITS');
  return {amount,quantity,unit,warnings};
}
