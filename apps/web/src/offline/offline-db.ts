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
  nextAttemptAt?: string;
}

const DB_NAME = 'jengaflow-offline';
const DB_VERSION = 1;
const STORES = ['records', 'commands', 'metadata'] as const;

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

export async function listPendingCommands(tenantId: string): Promise<SyncCommand[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('commands', 'readonly');
    const all = await requestResult<SyncCommand[]>(tx.objectStore('commands').getAll());
    return all.filter((command) => command.tenantId === tenantId && (command.state === 'pending' || command.state === 'syncing' || (command.state === 'failed' && (!command.nextAttemptAt || Date.parse(command.nextAttemptAt) <= Date.now())))).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  } finally { db.close(); }
}


export async function countOutstandingCommands(tenantId:string):Promise<number>{
  const db=await openDatabase();
  try{const tx=db.transaction('commands','readonly');const all=await requestResult<SyncCommand[]>(tx.objectStore('commands').getAll());return all.filter(command=>command.tenantId===tenantId&&['pending','syncing','failed'].includes(command.state)).length;}
  finally{db.close();}
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
