import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns liveness without requiring the database', () => {
    const service = new HealthService({} as never);
    expect(service.getLiveness()).toEqual({ status: 'ok', service: 'crewledger-api' });
  });

  it('reports readiness after a successful database ping', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ result: 1 }]) };
    const service = new HealthService(dataSource as never);
    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ready',
      database: 'connected',
    });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });
});
