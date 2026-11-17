import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  const tenantId = '123e4567-e89b-42d3-a456-426614174000';
  const userId = '123e4567-e89b-42d3-a456-426614174001';
  const deviceId = '123e4567-e89b-42d3-a456-426614174002';
  const commandId = '123e4567-e89b-42d3-a456-426614174003';
  const attendancePayload = {
    workerId: '123e4567-e89b-42d3-a456-426614174004',
    projectId: '123e4567-e89b-42d3-a456-426614174005',
    siteId: '123e4567-e89b-42d3-a456-426614174006',
    workDate: '2026-11-01',
    minutesWorked: 480,
  };

  function createService(query: jest.Mock) {
    const manager: { query: jest.Mock } = { query };
    const tenantDb = {
      run: jest.fn(async (_tenantId: string, work: (transactionManager: { query: jest.Mock }) => Promise<unknown>) => work(manager)),
    };
    return { service: new SyncService(tenantDb as never), tenantDb };
  }

  it('rejects commands from an unregistered or revoked device', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);
    await expect(service.processBatch(tenantId, userId, {
      commands: [{ commandId, deviceId, entityType: 'attendance', operation: 'create', payload: attendancePayload }],
    } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns a stored result for an idempotent command replay', async () => {
    const payloadHash = createHash('sha256').update(JSON.stringify(attendancePayload)).digest('hex');
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload_hash: payloadHash, state: 'accepted', result: { id: 'attendance-1' }, payload: attendancePayload, actor_user_id: userId }]);
    const { service } = createService(query);

    const result = await service.processBatch(tenantId, userId, {
      commands: [{ commandId, deviceId, entityType: 'attendance', operation: 'create', payload: attendancePayload }],
    } as never);

    expect(result.outcomes[0]).toMatchObject({
      commandId,
      status: 'accepted',
      result: { id: 'attendance-1' },
      idempotentReplay: true,
    });
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('rejects malformed sync cursors before querying the database', async () => {
    const query = jest.fn();
    const { service, tenantDb } = createService(query);
    const invalidCursor = Buffer.from(JSON.stringify({ updatedAt: 'not-a-date', id: 'not-a-uuid' })).toString('base64url');

    expect(() => service.pullAttendance(tenantId, invalidCursor)).toThrow('Invalid sync cursor.');
    expect(tenantDb.run).not.toHaveBeenCalled();
  });

  it('does not allow a user to revoke another user\'s device', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);
    await expect(service.revokeDevice(tenantId, userId, deviceId)).rejects.toBeInstanceOf(NotFoundException);
    expect(query.mock.calls[0][0]).toContain('user_id=$2');
  });

  it('stores malformed attendance payloads as rejected commands rather than retrying forever', async () => {
    const invalidPayload = { ...attendancePayload, unknownField: 'not-allowed' };
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'sync-command-1' }]);
    const { service } = createService(query);

    const result = await service.processBatch(tenantId, userId, {
      commands: [{ commandId, deviceId, entityType: 'attendance', operation: 'create', payload: invalidPayload }],
    } as never);

    expect(result.outcomes[0]).toMatchObject({ commandId, status: 'rejected' });
  });

  it('discards a conflict and audits it without rewriting the original command outcome', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'conflict-1', commandId, state: 'discarded', resolution: 'Reviewed duplicate capture' }])
      .mockResolvedValueOnce([]);
    const { service } = createService(query);

    await expect(service.resolveConflict(tenantId, userId, 'conflict-1', 'Reviewed duplicate capture'))
      .resolves.toMatchObject({ id: 'conflict-1', state: 'discarded' });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("state='discarded'");
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE sync_commands'))).toBe(false);
    expect(query.mock.calls[1][0]).toContain('sync.conflict.discarded');
  });

  it('does not downgrade an accepted command when its ID is reused with a different payload', async () => {
    const original = createHash('sha256').update(JSON.stringify(attendancePayload)).digest('hex');
    const changed = { ...attendancePayload, minutesWorked: 600 };
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload_hash: original, state: 'accepted', result: { id: 'attendance-1' }, payload: attendancePayload, actor_user_id: userId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'conflict-1' }]);
    const { service } = createService(query);

    const result = await service.processBatch(tenantId, userId, {
      commands: [{ commandId, deviceId, entityType: 'attendance', operation: 'create', payload: changed }],
    } as never);

    expect(result.outcomes[0]).toMatchObject({ status: 'conflict', conflictId: 'conflict-1' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE sync_commands SET state'))).toBe(false);
  });

  it('refuses to replay a command ID that another user submitted', async () => {
    const payloadHash = createHash('sha256').update(JSON.stringify(attendancePayload)).digest('hex');
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload_hash: payloadHash, state: 'accepted', result: { id: 'attendance-1' }, payload: attendancePayload, actor_user_id: 'someone-else' }]);
    const { service } = createService(query);

    await expect(service.processBatch(tenantId, userId, {
      commands: [{ commandId, deviceId, entityType: 'attendance', operation: 'create', payload: attendancePayload }],
    } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when a conflict was already resolved', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);

    await expect(service.resolveConflict(tenantId, userId, 'missing-conflict', 'Reviewed duplicate capture'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
