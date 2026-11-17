import { BadRequestException } from '@nestjs/common';
import { WorkerDocumentsService } from './worker-documents.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { ObjectStorageService } from '../storage/object-storage.service';

describe('WorkerDocumentsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const workerId = '22222222-2222-4222-8222-222222222222';
  const actorId = '33333333-3333-4333-8333-333333333333';
  let tenantDb: { run: jest.Mock };
  let storage: { putPrivateObject: jest.Mock; deletePrivateObject: jest.Mock; createPrivateDownloadUrl: jest.Mock };
  let service: WorkerDocumentsService;
  let runCount = 0;

  beforeEach(() => {
    runCount = 0;
    tenantDb = {
      run: jest.fn(async (_tenantId: string, work: (manager: { query: jest.Mock }) => Promise<unknown>) => {
        const query = jest.fn();
        if (runCount++ === 0) query.mockResolvedValueOnce([{ id: workerId }]);
        else query.mockResolvedValueOnce([{ id: '44444444-4444-4444-8444-444444444444', workerId, documentType: 'contract' }]).mockResolvedValueOnce([]);
        return work({ query });
      }),
    };
    storage = {
      putPrivateObject: jest.fn().mockResolvedValue({ key: `private/tenants/${tenantId}/worker-documents/file-id`, size: 8 }),
      deletePrivateObject: jest.fn().mockResolvedValue(undefined),
      createPrivateDownloadUrl: jest.fn().mockResolvedValue('https://storage.example/signed'),
    };
    service = new WorkerDocumentsService(
      tenantDb as unknown as TenantTransactionService,
      storage as unknown as ObjectStorageService,
    );
  });

  it('rejects a PDF whose bytes do not match its declared content type before storage', async () => {
    await expect(service.upload(tenantId,actorId,workerId,'contract',{
      buffer: Buffer.from('not a pdf'), originalname: 'contract.pdf', mimetype: 'application/pdf', size: 10,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantDb.run).not.toHaveBeenCalled();
    expect(storage.putPrivateObject).not.toHaveBeenCalled();
  });

  it('rejects unsupported document categories', async () => {
    await expect(service.upload(tenantId,actorId,workerId,'unknown',{
      buffer: Buffer.from('%PDF-1.7'), originalname: 'contract.pdf', mimetype: 'application/pdf', size: 8,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putPrivateObject).not.toHaveBeenCalled();
  });

  it('stores a valid PDF privately and persists tenant-scoped metadata', async () => {
    const result = await service.upload(tenantId,actorId,workerId,'contract',{
      buffer: Buffer.from('%PDF-1.7'), originalname: 'contract.pdf', mimetype: 'application/pdf', size: 8,
    });
    expect(storage.putPrivateObject).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, folder: 'worker-documents', contentType: 'application/pdf',
    }));
    expect(result).toEqual(expect.objectContaining({ workerId, documentType: 'contract' }));
  });

  it('removes the private object if metadata persistence fails', async () => {
    tenantDb.run.mockImplementationOnce(async (_tenantId: string, work: (manager: { query: jest.Mock }) => Promise<unknown>) => work({
      query: jest.fn().mockResolvedValueOnce([{ id: workerId }]),
    })).mockImplementationOnce(async () => { throw new Error('database unavailable'); });
    await expect(service.upload(tenantId,actorId,workerId,'contract',{
      buffer: Buffer.from('%PDF-1.7'), originalname: 'contract.pdf', mimetype: 'application/pdf', size: 8,
    })).rejects.toThrow('database unavailable');
    expect(storage.deletePrivateObject).toHaveBeenCalledWith(`private/tenants/${tenantId}/worker-documents/file-id`);
  });
});
