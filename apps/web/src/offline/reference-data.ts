import { getOfflineMetadata, listOfflineRecords, replaceOfflineRecords, setOfflineMetadata, type OfflineEntity } from './offline-db';

/** Entities the attendance capture form needs while offline. */
export const REFERENCE_ENTITIES = ['workers', 'projects', 'sites'] as const satisfies readonly OfflineEntity[];
export type ReferenceEntity = (typeof REFERENCE_ENTITIES)[number];
export type ReferenceRows = Record<ReferenceEntity, Array<Record<string, unknown>>>;

const cachedAtKey = (tenantId: string) => `reference-cached-at:${tenantId}`;

/** Persists the latest server lists. Rows without a string `id` are skipped rather than corrupting the cache. */
export async function cacheReferenceData(tenantId: string, rows: Partial<ReferenceRows>, now = new Date()): Promise<void> {
  if (!tenantId) return;
  const updatedAt = now.toISOString();
  for (const entity of REFERENCE_ENTITIES) {
    const list = rows[entity];
    if (!list) continue; // endpoint failed this time: keep the previous cache for it
    const records = list
      .filter((row): row is Record<string, unknown> & { id: string } => typeof row.id === 'string' && row.id.length > 0)
      .map(row => ({ id: `${entity}:${row.id}`, tenantId, entity, payload: row, updatedAt, syncState: 'synced' as const }));
    await replaceOfflineRecords(tenantId, entity, records);
  }
  await setOfflineMetadata(cachedAtKey(tenantId), updatedAt);
}

/** Returns cached lists (empty arrays when nothing has been bootstrapped yet) and when they were last refreshed. */
export async function loadCachedReferenceData(tenantId: string): Promise<{ rows: ReferenceRows; cachedAt?: string }> {
  const rows: ReferenceRows = { workers: [], projects: [], sites: [] };
  if (!tenantId) return { rows };
  for (const entity of REFERENCE_ENTITIES) {
    rows[entity] = (await listOfflineRecords(tenantId, entity)).map(record => record.payload);
  }
  return { rows, cachedAt: await getOfflineMetadata<string>(cachedAtKey(tenantId)) };
}
