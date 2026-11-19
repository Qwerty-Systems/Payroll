import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const tenantDb = { run: jest.fn() } as any;
  let service: IntegrationsService;
  beforeEach(() => { jest.clearAllMocks(); service = new IntegrationsService(tenantDb); });

  it('rejects production configuration', async () => {
    await expect(service.save('tenant','actor',{
      provider:'daraja',enabled:true,environment:'production',settings:{shortCode:'123456'},
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantDb.run).not.toHaveBeenCalled();
  });

  it('saves only allowlisted non-secret settings', async () => {
    const manager={query:jest.fn().mockResolvedValue([{provider:'daraja',settings:{shortCode:'123456'}}])};
    tenantDb.run.mockImplementation(async (_tenant:string, work:any) => work(manager));
    await service.save('tenant','actor',{
      provider:'daraja',enabled:true,environment:'sandbox',
      settings:{shortCode:'123456',consumerSecret:'do-not-store',password:'do-not-store',unknown:'drop'},
    } as any);
    const parameters=manager.query.mock.calls[0][1];
    expect(JSON.parse(parameters[4])).toEqual({shortCode:'123456'});
  });
  it('requeues a failed delivery job within its tenant and writes an audit event', async () => {
    const job = { id:'job-1', jobType:'payslip_email', status:'queued', attempts:2, maxAttempts:5 };
    const manager = { query: jest.fn()
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]) };
    tenantDb.run.mockImplementation(async (_tenant:string, work:any) => work(manager));

    await expect(service.retryDeliveryJob('tenant-a','actor-a','job-1')).resolves.toEqual(job);
    expect(manager.query.mock.calls[0][1]).toEqual(['tenant-a','job-1']);
    expect(manager.query.mock.calls[1][1][0]).toBe('tenant-a');
    expect(manager.query.mock.calls[1][1][1]).toBe('actor-a');
    expect(manager.query.mock.calls[1][1][2]).toBe('integration.delivery.retry_queued');
  });

  it('does not retry a delivery job that exhausted its retry budget', async () => {
    const manager = { query: jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'job-1',status:'dead_letter',attempts:5,maxAttempts:5}]) };
    tenantDb.run.mockImplementation(async (_tenant:string, work:any) => work(manager));
    await expect(service.retryDeliveryJob('tenant-a','actor-a','job-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('does not disclose or retry a job outside the current tenant', async () => {
    const manager = { query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) };
    tenantDb.run.mockImplementation(async (_tenant:string, work:any) => work(manager));
    await expect(service.retryDeliveryJob('tenant-a','actor-a','other-tenant-job'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(manager.query.mock.calls[0][1]).toEqual(['tenant-a','other-tenant-job']);
  });

});