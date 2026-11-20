import { BadRequestException, ConflictException } from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('Attendance correction workflow', () => {
  const tenantId = '123e4567-e89b-42d3-a456-426614174000';
  const actorId = '123e4567-e89b-42d3-a456-426614174001';
  const recordId = '123e4567-e89b-42d3-a456-426614174002';
  const correctionId = '123e4567-e89b-42d3-a456-426614174003';

  function serviceWithQuery(query: jest.Mock) {
    const manager = { query };
    const tenantDb = {
      run: jest.fn(async (_tenant: string, work: (manager: { query: jest.Mock }) => Promise<unknown>) => work(manager)),
    };
    return new OperationsService(tenantDb as never);
  }

  it('requires at least one proposed field', async () => {
    const service = serviceWithQuery(jest.fn());
    await expect(service.requestAttendanceCorrection(tenantId, actorId, recordId, { reason: 'Correct record' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('only allows correction requests against approved records', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: recordId, status: 'submitted', created_by: actorId }]);
    const service = serviceWithQuery(query);
    await expect(service.requestAttendanceCorrection(tenantId, actorId, recordId, {
      minutesWorked: 420, reason: 'Correct approved minutes',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents a requester from approving their own correction', async () => {
    const query = jest.fn().mockResolvedValueOnce([{
      id: correctionId, attendance_id: recordId, proposed_values: { minutesWorked: 420 },
      reason: 'Correct minutes', status: 'pending', requested_by: actorId, attendance_status: 'approved',
    }]);
    const service = serviceWithQuery(query);
    await expect(service.reviewAttendanceCorrection(tenantId, actorId, correctionId, 'approve', 'Reviewed'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('applies approved changes and records an audit event', async () => {
    const reviewerId = '123e4567-e89b-42d3-a456-426614174004';
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: correctionId, attendance_id: recordId, proposed_values: { minutesWorked: 420 },
        reason: 'Correct minutes', status: 'pending', requested_by: actorId, attendance_status: 'approved',
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: correctionId, status: 'approved' }])
      .mockResolvedValueOnce([]);
    const service = serviceWithQuery(query);
    await expect(service.reviewAttendanceCorrection(tenantId, reviewerId, correctionId, 'approve', 'Verified source record'))
      .resolves.toMatchObject({ id: correctionId, status: 'approved' });
    expect(query.mock.calls[1][0]).toContain('UPDATE attendance_records SET');
    expect(query.mock.calls[3][1][2]).toBe('attendance.correction.approve');
  });
  it('rejects corrected minutes worked greater than the corrected clock span', async () => {
    const query = jest.fn().mockResolvedValueOnce([{
      id: recordId, status: 'approved', created_by: actorId,
      clock_in: '2026-11-20T08:00:00.000Z', clock_out: '2026-11-20T16:00:00.000Z',
    }]);
    const service = serviceWithQuery(query);
    await expect(service.requestAttendanceCorrection(tenantId, actorId, recordId, {
      clockIn: '2026-11-20T08:00:00.000Z',
      clockOut: '2026-11-20T16:00:00.000Z',
      minutesWorked: 600,
      reason: 'Correct attendance duration',
    })).rejects.toThrow('Corrected minutes worked cannot exceed the elapsed time');
    expect(query).toHaveBeenCalledTimes(1);
  });

});
