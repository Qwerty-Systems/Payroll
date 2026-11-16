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
      .mockResolvedValueOnce([{ payload_hash: payloadHash, state: 'accepted', result: { id: 'attendance-1' }, payload: attendancePayload }]);
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
});
