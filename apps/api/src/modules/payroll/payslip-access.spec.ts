import { PayrollService, payslipScope } from './payroll.service';

describe('payslip access scoping', () => {
  it('does not restrict staff roles', () => {
    for (const role of ['owner', 'admin', 'hr_manager', 'payroll_manager', 'accountant']) {
      expect(payslipScope({ role, userId: 'u1' }, 3)).toEqual({ sql: '', params: [] });
    }
  });

  it('restricts the worker role to the worker record linked to its own user', () => {
    const scope = payslipScope({ role: 'worker', userId: 'user-1' }, 3);
    expect(scope.sql).toContain('user_id=$3');
    expect(scope.sql).toContain('tenant_id=$1');
    expect(scope.params).toEqual(['user-1']);
  });

  function serviceWith(query: jest.Mock) {
    const tenantDb = { run: jest.fn(async (_t: string, work: (m: { query: jest.Mock }) => unknown) => work({ query })) };
    return new PayrollService(tenantDb as never);
  }

  it('getPayslip passes the viewer scope to SQL so another worker\'s payslip is "not found"', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    await expect(serviceWith(query).getPayslip('t1', 'p1', { role: 'worker', userId: 'u1' })).rejects.toThrow('Payslip not found.');
    expect(query.mock.calls[0][0]).toContain('user_id=$3');
    expect(query.mock.calls[0][1]).toEqual(['t1', 'p1', 'u1']);
  });

  it('listPayslips scopes a worker but not a payroll manager', async () => {
    const q1 = jest.fn().mockResolvedValueOnce([{ status: 'finalized' }]).mockResolvedValueOnce([]);
    await serviceWith(q1).listPayslips('t1', 'r1', { role: 'worker', userId: 'u1' });
    expect(q1.mock.calls[1][1]).toEqual(['t1', 'r1', 'u1']);
    const q2 = jest.fn().mockResolvedValueOnce([{ status: 'finalized' }]).mockResolvedValueOnce([]);
    await serviceWith(q2).listPayslips('t1', 'r1', { role: 'payroll_manager', userId: 'u2' });
    expect(q2.mock.calls[1][1]).toEqual(['t1', 'r1']);
    expect(q2.mock.calls[1][0]).not.toContain('user_id');
  });
});
