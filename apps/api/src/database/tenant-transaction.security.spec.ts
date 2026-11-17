import { TenantTransactionService } from './tenant-transaction.service';

describe('TenantTransactionService tenant isolation security',()=>{
 it('sets a fresh transaction-local RLS tenant for each tenant operation',async()=>{
  const runners:any[]=[];
  const dataSource={createQueryRunner:jest.fn(()=>{let active=false;const runner={connect:jest.fn().mockResolvedValue(undefined),startTransaction:jest.fn().mockImplementation(async()=>{active=true;}),query:jest.fn().mockResolvedValue(undefined),manager:{},commitTransaction:jest.fn().mockImplementation(async()=>{active=false;}),rollbackTransaction:jest.fn().mockImplementation(async()=>{active=false;}),release:jest.fn().mockResolvedValue(undefined),get isTransactionActive(){return active;}};runners.push(runner);return runner;})};
  const service=new TenantTransactionService(dataSource as never);
  const first='123e4567-e89b-42d3-a456-426614174000',second='123e4567-e89b-42d3-a456-426614174001';
  await service.run(first,async()=>true);await service.run(second,async()=>true);
  expect(runners).toHaveLength(2);
  expect(runners[0].query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)",[first]);
  expect(runners[1].query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)",[second]);
  expect(runners[0]).not.toBe(runners[1]);
 });
});
