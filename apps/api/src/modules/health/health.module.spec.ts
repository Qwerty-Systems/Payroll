import { HealthService } from './health.service';

describe('HealthService', () => {
  const redis = { ping: jest.fn().mockResolvedValue(true), isConfigured: jest.fn().mockReturnValue(true) };

  it('returns liveness without requiring external dependencies', () => {
    const service = new HealthService({} as never, redis as never);
    expect(service.getLiveness()).toEqual({ status: 'ok', service: 'jengaflow-api' });
  });

  it('reports readiness after database and Redis checks', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ result: 1 }]) };
    const service = new HealthService(dataSource as never, redis as never);
    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ready',
      database: 'connected',
      redis: 'connected',
    });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });
});
