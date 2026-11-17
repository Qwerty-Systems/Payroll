import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cacheReferenceData, loadCachedReferenceData } from './reference-data';

const A = 'tenant-a';
const B = 'tenant-b';

describe('offline reference-data bootstrap', () => {
  it('returns empty lists before anything was cached', async () => {
    const { rows, cachedAt } = await loadCachedReferenceData('tenant-never');
    expect(rows).toEqual({ workers: [], projects: [], sites: [] });
    expect(cachedAt).toBeUndefined();
  });

  it('round-trips workers, projects and sites', async () => {
    await cacheReferenceData(A, { workers: [{ id: 'w1', fullName: 'Amina' }], projects: [{ id: 'p1' }], sites: [{ id: 's1' }] }, new Date('2026-11-17T08:00:00Z'));
    const { rows, cachedAt } = await loadCachedReferenceData(A);
    expect(rows.workers).toEqual([{ id: 'w1', fullName: 'Amina' }]);
    expect(rows.projects).toEqual([{ id: 'p1' }]);
    expect(cachedAt).toBe('2026-11-17T08:00:00.000Z');
  });

  it('replaces the cache so server-side removals disappear', async () => {
    await cacheReferenceData(A, { workers: [{ id: 'w1' }, { id: 'w2' }] });
    await cacheReferenceData(A, { workers: [{ id: 'w2' }] });
    expect((await loadCachedReferenceData(A)).rows.workers).toEqual([{ id: 'w2' }]);
  });

  it('keeps the previous cache for an entity whose endpoint failed', async () => {
    await cacheReferenceData(A, { sites: [{ id: 's1' }] });
    await cacheReferenceData(A, { workers: [{ id: 'w9' }] }); // sites omitted = fetch failed
    expect((await loadCachedReferenceData(A)).rows.sites).toEqual([{ id: 's1' }]);
  });

  it('isolates tenants and skips rows without an id', async () => {
    await cacheReferenceData(A, { workers: [{ id: 'wa' }, { name: 'no id' }] });
    await cacheReferenceData(B, { workers: [{ id: 'wb' }] });
    expect((await loadCachedReferenceData(A)).rows.workers).toEqual([{ id: 'wa' }]);
    expect((await loadCachedReferenceData(B)).rows.workers).toEqual([{ id: 'wb' }]);
  });
});
