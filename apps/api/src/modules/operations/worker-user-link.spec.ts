import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('OperationsService.linkWorkerUser', () => {
  const T = 't1', ACTOR = 'actor', W = 'w1', U = 'u1';
  function svc(query: jest.Mock) {
    const tenantDb = { run: jest.fn(async (_t: string, work: (m: { query: jest.Mock }) => unknown) => work({ query })) };
    return new OperationsService(tenantDb as never);
  }

  it('404s for an unknown worker', async () => {
    await expect(svc(jest.fn().mockResolvedValueOnce([])).linkWorkerUser(T, ACTOR, W, { userId: U })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires an active membership in the same workspace', async () => {
    const q = jest.fn().mockResolvedValueOnce([{ id: W, user_id: null }]).mockResolvedValueOnce([]);
    await expect(svc(q).linkWorkerUser(T, ACTOR, W, { userId: U })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only links users holding the worker role', async () => {
    const q = jest.fn().mockResolvedValueOnce([{ id: W, user_id: null }]).mockResolvedValueOnce([{ role: 'admin' }]);
    await expect(svc(q).linkWorkerUser(T, ACTOR, W, { userId: U })).rejects.toThrow('worker role');
  });

  it('refuses a user already linked to another worker', async () => {
    const q = jest.fn().mockResolvedValueOnce([{ id: W, user_id: null }]).mockResolvedValueOnce([{ role: 'worker' }]).mockResolvedValueOnce([{ id: 'other' }]);
    await expect(svc(q).linkWorkerUser(T, ACTOR, W, { userId: U })).rejects.toBeInstanceOf(ConflictException);
  });

  it('links and audits; unlinking skips membership checks', async () => {
    const q = jest.fn().mockResolvedValueOnce([{ id: W, user_id: null }]).mockResolvedValueOnce([{ role: 'worker' }]).mockResolvedValueOnce([]).mockResolvedValue([]);
    await expect(svc(q).linkWorkerUser(T, ACTOR, W, { userId: U })).resolves.toEqual({ id: W, userId: U });
    expect(q.mock.calls.some(c => String(c[0]).includes('INSERT INTO audit_events') && c[1][2] === 'worker.user_linked')).toBe(true);

    const q2 = jest.fn().mockResolvedValueOnce([{ id: W, user_id: U }]).mockResolvedValue([]);
    await expect(svc(q2).linkWorkerUser(T, ACTOR, W, { userId: null })).resolves.toEqual({ id: W, userId: null });
    expect(q2.mock.calls.some(c => String(c[0]).includes('tenant_memberships'))).toBe(false);
    expect(q2.mock.calls.some(c => c[1]?.[2] === 'worker.user_unlinked')).toBe(true);
  });
});
