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
    tenantDb.run.mockImplementation(async (_tenant:string, work:any) => work({query:jest.fn().mockResolvedValue([{provider:'daraja',settings:{shortCode:'123456'}}])}));
    await service.save('tenant','actor',{
      provider:'daraja',enabled:true,environment:'sandbox',
      settings:{shortCode:'123456',consumerSecret:'dont-store',password:'dont-store',unknown:'drop'},
    } as any);
    const queryArgs=tenantDb.run.mock.calls[0];
    const manager=await queryArgs[1]({query:jest.fn()});
    expect(manager.settings).toEqual({shortCode:'123456'});
  });
});
