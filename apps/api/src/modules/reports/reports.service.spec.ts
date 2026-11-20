import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const query = jest.fn();
  const tenantDb = { run: jest.fn((_tenantId: string, callback: (manager: any) => Promise<any>) => callback({ query })) };
  let service: ReportsService;
  beforeEach(() => { jest.clearAllMocks(); service = new ReportsService(tenantDb as any); });

  it('filters payroll summary by tenant and period using parameters', async () => {
    query.mockResolvedValue([]);
    await service.payrollSummary('tenant-1','period-2');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE p.tenant_id=$1  AND p.id=$2'),['tenant-1','period-2']);
  });

  it('returns payroll run detail with tenant-scoped worker rows', async () => {
    query.mockResolvedValueOnce([{id:'run-1'}]).mockResolvedValueOnce([{workerNumber:'W-1'}]);
    const result = await service.payrollRunDetail('tenant-1','run-1');
    expect(result).toEqual({run:{id:'run-1'},workers:[{workerNumber:'W-1'}]});
    expect(query).toHaveBeenNthCalledWith(2,expect.stringContaining('WHERE i.tenant_id=$1 AND i.payroll_run_id=$2'),['tenant-1','run-1']);
  });

  it('throws not found when run is outside the tenant or absent', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.payrollRunDetail('tenant-1','missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
