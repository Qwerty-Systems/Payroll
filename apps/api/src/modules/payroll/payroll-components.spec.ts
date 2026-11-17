import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

describe('Payroll component safeguards',()=>{
 const tenant='123e4567-e89b-42d3-a456-426614174000';
 const actor='123e4567-e89b-42d3-a456-426614174001';
 const worker='123e4567-e89b-42d3-a456-426614174002';
 function service(query:jest.Mock){const manager={query};const db={run:jest.fn(async(_id:string,fn:(m:{query:jest.Mock})=>Promise<unknown>)=>fn(manager))};return new PayrollService(db as never);}
 it('rejects effective dates that run backwards',async()=>{const q=jest.fn();expect(()=>service(q).createWorkerPayComponent(tenant,actor,worker,{code:'TRAVEL',name:'Travel allowance',componentType:'allowance',calculationMethod:'fixed',amount:1000,effectiveFrom:'2026-12-31',effectiveTo:'2026-12-01'})).toThrow(BadRequestException);expect(q).not.toHaveBeenCalled();});
 it('does not allow deductions or benefits to be marked taxable allowances',async()=>{const q=jest.fn();expect(()=>service(q).createWorkerPayComponent(tenant,actor,worker,{code:'LOAN',name:'Loan recovery',componentType:'deduction',calculationMethod:'fixed',amount:1000,taxable:true,effectiveFrom:'2026-12-01'})).toThrow(BadRequestException);expect(q).not.toHaveBeenCalled();});
});
