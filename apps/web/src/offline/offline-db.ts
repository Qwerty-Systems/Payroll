export type OfflineEntity = 'workers' | 'projects' | 'sites' | 'attendance';
export type SyncState = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed' | 'rejected';

export interface OfflineRecord {
  id: string;
  tenantId: string;
  entity: OfflineEntity;
  payload: Record<string, unknown>;
  updatedAt: string;
  syncState: SyncState;
  serverVersion?: string;
}

export interface SyncCommand {
  id: string;
  tenantId: string;
  entity: OfflineEntity;
  operation: 'create' | 'update';
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  state: SyncState;
  lastError?: string;
  /** ISO time before which a failed command must not be retried automatically (exponential backoff). */
  nextAttemptAt?: string;
  /** ISO time the command entered the 'syncing' state; used to recover commands orphaned by a closed tab. */
  syncingSince?: string;
}

/** A command stuck in 'syncing' longer than this was orphaned (tab closed or crashed mid-request). */
export const STALE_SYNCING_MS = 2 * 60 * 1000;

const DB_NAME = 'jengaflow-offline';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Offline storage is not supported by this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) {
        const store = db.createObjectStore('records', { keyPath: 'id' });
        store.createIndex('tenant_entity', ['tenantId', 'entity']);
      }
      if (!db.objectStoreNames.contains('commands')) {
        const store = db.createObjectStore('commands', { keyPath: 'id' });
        store.createIndex('tenant_state_created', ['tenantId', 'state', 'createdAt']);
      }
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline database.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline database request failed.'));
  });
}

export async function getOfflineMetadata<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('metadata', 'readonly');
    const item = await requestResult<{ key: string; value: T } | undefined>(tx.objectStore('metadata').get(key));
    return item?.value;
  } finally { db.close(); }
}

export async function setOfflineMetadata<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put({ key, value });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function saveOfflineRecord(record: OfflineRecord): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function listOfflineRecords(tenantId: string, entity: OfflineEntity): Promise<OfflineRecord[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('records', 'readonly');
    const all = await requestResult<OfflineRecord[]>(tx.objectStore('records').getAll());
    return all.filter((record) => record.tenantId === tenantId && record.entity === entity);
  } finally { db.close(); }
}

export async function enqueueOfflineCommand(command: Omit<SyncCommand, 'id' | 'createdAt' | 'attempts' | 'state'>): Promise<SyncCommand> {
  const db = await openDatabase();
  const item: SyncCommand = { ...command, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0, state: 'pending' };
  try {
    const tx = db.transaction('commands', 'readwrite');
    tx.objectStore('commands').add(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return item;
  } finally { db.close(); }
}

export interface PendingOptions {
  /** Manual syncs ignore retry backoff; automatic syncs respect it. */
  ignoreBackoff?: boolean;
  now?: number;
}

/**
 * Commands eligible to be sent: new commands, failed commands whose backoff has elapsed, and commands orphaned in
 * 'syncing'. Re-sending an orphaned command is safe because the server deduplicates by command ID.
 */
export async function listPendingCommands(tenantId: string, options: PendingOptions = {}): Promise<SyncCommand[]> {
  const now = options.now ?? Date.now();
  const db = await openDatabase();
  try {
    const tx = db.transaction('commands', 'readonly');
    const all = await requestResult<SyncCommand[]>(tx.objectStore('commands').getAll());
    return all.filter((command) => {
      if (command.tenantId !== tenantId) return false;
      if (command.state === 'pending') return true;
      if (command.state === 'failed') {
        return options.ignoreBackoff || !command.nextAttemptAt || Date.parse(command.nextAttemptAt) <= now;
      }
      if (command.state === 'syncing') {
        const since = command.syncingSince ? Date.parse(command.syncingSince) : 0;
        return !Number.isFinite(since) || now - since >= STALE_SYNCING_MS;
      }
      return false;
    }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally { db.close(); }
}

export async function listCommandsByState(tenantId: string, states: SyncState[]): Promise<SyncCommand[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('commands', 'readonly');
    const all = await requestResult<SyncCommand[]>(tx.objectStore('commands').getAll());
    return all.filter((command) => command.tenantId === tenantId && states.includes(command.state))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally { db.close(); }
}

/** Counts of commands per state, for sync status indicators. Synced commands are excluded. */
export async function countCommands(tenantId: string): Promise<Record<Exclude<SyncState, 'synced'>, number>> {
  const counts = { pending: 0, syncing: 0, conflict: 0, failed: 0, rejected: 0 };
  const items = await listCommandsByState(tenantId, ['pending', 'syncing', 'conflict', 'failed', 'rejected']);
  for (const item of items) counts[item.state as keyof typeof counts] += 1;
  return counts;
}

export async function deleteCommand(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('commands', 'readwrite');
    tx.objectStore('commands').delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/**
 * Re-queues a conflicted or rejected command under a NEW command ID in one transaction. The server permanently
 * records the outcome of the old ID, so re-sending it unchanged would only return the same conflict or rejection.
 * Use this after the user has corrected the underlying cause.
 */
export async function requeueCommand(id: string, payload?: Record<string, unknown>): Promise<SyncCommand> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('commands', 'readwrite');
    const store = tx.objectStore('commands');
    const existing = await requestResult<SyncCommand | undefined>(store.get(id));
    if (!existing) throw new Error('This queued change no longer exists.');
    if (existing.state !== 'conflict' && existing.state !== 'rejected') throw new Error('Only conflicted or rejected changes can be re-queued.');
    const next: SyncCommand = {
      ...existing, id: crypto.randomUUID(), payload: payload ?? existing.payload, createdAt: new Date().toISOString(),
      attempts: 0, state: 'pending', lastError: undefined, nextAttemptAt: undefined, syncingSince: undefined,
    };
    store.delete(id);
    store.add(next);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return next;
  } finally { db.close(); }
}

export async function updateCommand(command: SyncCommand): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('commands', 'readwrite');
    tx.objectStore('commands').put(command);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function clearTenantOfflineData(tenantId: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['records', 'commands'], 'readwrite');
    for (const storeName of ['records', 'commands'] as const) {
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => request.result.forEach((item: { tenantId: string; id: string }) => {
        if (item.tenantId === tenantId) store.delete(item.id);
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/**
 * Atomically replaces every cached record of one entity for a tenant. Used for reference-data bootstrap: the server
 * list is authoritative, so rows deleted or archived server-side must disappear from the offline cache too.
 */
export async function replaceOfflineRecords(tenantId: string, entity: OfflineEntity, records: OfflineRecord[]): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    const existing = await requestResult<OfflineRecord[]>(store.getAll());
    for (const row of existing) {
      if (row.tenantId === tenantId && row.entity === entity) store.delete(row.id);
    }
    for (const row of records) {
      if (row.tenantId !== tenantId || row.entity !== entity) throw new Error('Offline record does not belong to this tenant/entity.');
      store.put(row);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
