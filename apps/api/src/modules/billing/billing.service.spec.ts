import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';

describe('BillingService validation',()=>{
 const tenant='123e4567-e89b-42d3-a456-426614174000';
 const actor='123e4567-e89b-42d3-a456-426614174001';
 function service(query:jest.Mock){const manager={query};const db={run:jest.fn(async(_id:string,fn:(m:{query:jest.Mock})=>Promise<unknown>)=>fn(manager))};return new BillingService(db as never);}
 it('rejects invalid invoice currency before persistence',async()=>{const q=jest.fn();expect(()=>service(q).createInvoice(tenant,actor,{customerName:'Customer',currency:'K',lines:[{description:'Service',quantity:1,unitPriceMinor:100}],dueDate:'2099-01-01'})).toThrow(BadRequestException);expect(q).not.toHaveBeenCalled();});
 it('rejects an invalid billing line quantity before persistence',async()=>{const q=jest.fn();expect(()=>service(q).createQuote(tenant,actor,{customerName:'Customer',currency:'KES',lines:[{description:'Service',quantity:0,unitPriceMinor:100}]})).toThrow(BadRequestException);expect(q).not.toHaveBeenCalled();});
});
