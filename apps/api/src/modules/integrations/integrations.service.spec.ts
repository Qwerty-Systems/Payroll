import { BadRequestException } from '@nestjs/common';
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
});
