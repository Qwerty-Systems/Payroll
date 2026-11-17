import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_SYNCING_MS, countCommands, enqueueOfflineCommand, listCommandsByState, listPendingCommands,
  requeueCommand, updateCommand, type SyncCommand,
} from './offline-db';
import { queueAttendanceCapture } from './offline-api';
import { isNetworkError, retryDelayMs, synchronizeTenantOutbox } from './offline-sync';

const TENANT = 'tenant-1';
const payload = { workerId: 'w', projectId: 'p', siteId: 's', workDate: '2026-11-01', minutesWorked: 480 };
const add = (extra: Partial<SyncCommand> = {}) =>
  enqueueOfflineCommand({ tenantId: TENANT, entity: 'attendance', operation: 'create', recordId: crypto.randomUUID(), payload, ...extra });

async function reset() {
  const all = await listCommandsByState(TENANT, ['pending', 'syncing', 'synced', 'conflict', 'failed', 'rejected']);
  const { deleteCommand } = await import('./offline-db');
  for (const item of all) await deleteCommand(item.id);
}

describe('offline outbox', () => {
  beforeEach(async () => { await reset(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });

  it('sends commands oldest first and marks them synced', async () => {
    const first = await add();
    await new Promise(r => setTimeout(r, 5));
    const second = await add();
    const order: string[] = [];
    const summary = await synchronizeTenantOutbox(TENANT, async c => { order.push(c.id); return { status: 'synced' }; });
    expect(order).toEqual([first.id, second.id]);
    expect(summary).toMatchObject({ synced: 2, failed: 0, remaining: 0 });
  });

  it('recovers a command orphaned in "syncing" by a closed tab, but not a fresh one', async () => {
    const orphan = await add();
    const fresh = await add();
    const now = Date.now();
    await updateCommand({ ...orphan, state: 'syncing', syncingSince: new Date(now - STALE_SYNCING_MS - 1000).toISOString() });
    await updateCommand({ ...fresh, state: 'syncing', syncingSince: new Date(now - 1000).toISOString() });
    const eligible = await listPendingCommands(TENANT, { now });
    expect(eligible.map(c => c.id)).toEqual([orphan.id]);
  });

  it('applies exponential backoff to failed commands and lets manual sync bypass it', async () => {
    await add();
    const t0 = Date.now();
    await synchronizeTenantOutbox(TENANT, async () => { throw new Error('HTTP 503'); }, { now: () => t0 });
    expect(await listPendingCommands(TENANT, { now: t0 + 1000 })).toHaveLength(0);
    expect(await listPendingCommands(TENANT, { now: t0 + 31_000 })).toHaveLength(1);
    expect(await listPendingCommands(TENANT, { now: t0 + 1000, ignoreBackoff: true })).toHaveLength(1);
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(50)).toBe(15 * 60_000);
  });

  it('stops the run on a network error and leaves later commands untouched', async () => {
    await add(); await new Promise(r => setTimeout(r, 5)); await add();
    const send = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const summary = await synchronizeTenantOutbox(TENANT, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(summary.failed).toBe(1);
    expect((await countCommands(TENANT)).pending).toBe(1);
  });

  it('is single-flight per tenant', async () => {
    await add();
    const send = vi.fn(async () => { await new Promise(r => setTimeout(r, 20)); return { status: 'synced' as const }; });
    const [a, b] = await Promise.all([synchronizeTenantOutbox(TENANT, send), synchronizeTenantOutbox(TENANT, send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('keeps conflicts and rejections for review and never retries them automatically', async () => {
    await add(); await new Promise(r => setTimeout(r, 5)); await add();
    let n = 0;
    await synchronizeTenantOutbox(TENANT, async () => (n++ === 0 ? { status: 'conflict', message: 'dup' } : { status: 'rejected', message: 'bad site' }));
    expect(await listPendingCommands(TENANT, { ignoreBackoff: true })).toHaveLength(0);
    expect((await countCommands(TENANT))).toMatchObject({ conflict: 1, rejected: 1 });
  });

  it('re-queues a rejected command under a new ID with fresh attempt state', async () => {
    const original = await add();
    await synchronizeTenantOutbox(TENANT, async () => ({ status: 'rejected', message: 'bad site' }));
    const next = await requeueCommand(original.id, { ...payload, siteId: 'fixed' });
    expect(next.id).not.toBe(original.id);
    expect(next).toMatchObject({ state: 'pending', attempts: 0, payload: { siteId: 'fixed' } });
    expect(await listCommandsByState(TENANT, ['rejected'])).toHaveLength(0);
    await expect(requeueCommand(next.id)).rejects.toThrow('Only conflicted or rejected');
  });

  it('detects network errors', () => {
    expect(isNetworkError(new TypeError('x'))).toBe(true);
    expect(isNetworkError(new Error('HTTP 500'))).toBe(false);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(isNetworkError(new Error('anything'))).toBe(true);
  });

  it('queues attendance with validation and no client-supplied source', async () => {
    const queued = await queueAttendanceCapture(TENANT, { workerId: 'w', projectId: 'p', siteId: 's', workDate: '2026-11-01', minutesWorked: 480 });
    expect(queued.payload).not.toHaveProperty('source');
    expect(queued.state).toBe('pending');
    await expect(queueAttendanceCapture(TENANT, { workerId: 'w', projectId: 'p', siteId: 's', workDate: '2026-11-01', minutesWorked: 2000 })).rejects.toThrow('between 0 and 1440');
  });
});
