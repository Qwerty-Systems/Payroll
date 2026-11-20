import { BadRequestException } from '@nestjs/common';
import { WorkforceTimeService } from './workforce-time.service';

describe('WorkforceTimeService shift validation', () => {
  const service = new WorkforceTimeService({ run: jest.fn() } as any);
  const validate = (start: string, end: string, breakMinutes: number, crosses?: boolean) =>
    (service as any).validateShift(start, end, breakMinutes, crosses);

  it('accepts an ordinary shift and infers no overnight', () => {
    expect(validate('08:00', '17:00', 60)).toBe(false);
  });

  it('accepts overnight shifts and infers the overnight flag', () => {
    expect(validate('22:00', '06:00', 30)).toBe(true);
  });

  it('rejects invalid time formats', () => {
    expect(() => validate('8am', '17:00', 30)).toThrow(BadRequestException);
  });

  it('rejects identical start and end times', () => {
    expect(() => validate('08:00', '08:00', 0)).toThrow(BadRequestException);
  });

  it('rejects breaks equal to or longer than the shift', () => {
    expect(() => validate('08:00', '09:00', 60)).toThrow(BadRequestException);
    expect(() => validate('08:00', '09:00', 61)).toThrow(BadRequestException);
  });

  it('rejects a crosses-midnight flag inconsistent with the times', () => {
    expect(() => validate('08:00', '17:00', 30, true)).toThrow(BadRequestException);
    expect(() => validate('22:00', '06:00', 30, false)).toThrow(BadRequestException);
  });
});
