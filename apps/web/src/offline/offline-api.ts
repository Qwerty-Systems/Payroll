import { getOfflineMetadata, setOfflineMetadata, type SyncCommand } from './offline-db';
import { synchronizeTenantOutbox, type SyncSummary } from './offline-sync';

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type RegisteredDevice = { id: string };

const deviceKey = (tenantId: string) => `sync-device:${tenantId}`;

async function getOrRegisterDevice(tenantId: string, request: ApiRequest): Promise<string> {
  const existing = await getOfflineMetadata<string>(deviceKey(tenantId));
  if (existing) {
    try {
      const devices = await request<Array<{ id: string; revokedAt?: string | null }>>('tenant/sync/devices');
      if (devices.some(device => device.id === existing && !device.revokedAt)) return existing;
    } catch {
      // Re-registration below gives the API a chance to return an actionable error.
    }
  }
  const registered = await request<RegisteredDevice>('tenant/sync/devices', {
    method: 'POST',
    body: JSON.stringify({
      name: typeof navigator !== 'undefined' ? (navigator.userAgentData?.platform || navigator.platform || 'Browser').slice(0, 120) : 'Browser',
      platform: 'web',
    }),
  });
  if (!registered?.id) throw new Error('The API did not return a registered device ID.');
  await setOfflineMetadata(deviceKey(tenantId), registered.id);
  return registered.id;
}

export async function synchronizeOfflineAttendance(
  tenantId: string,
  request: ApiRequest,
): Promise<SyncSummary> {
  if (!tenantId) throw new Error('Select a company workspace before synchronizing.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline. Your queued changes will remain safely on this device.');
  }
  const deviceId = await getOrRegisterDevice(tenantId, request);
  return synchronizeTenantOutbox(tenantId, async (command: SyncCommand) => {
    if (command.entity !== 'attendance' || command.operation !== 'create') {
      return { status: 'rejected', message: 'This sync endpoint currently accepts new attendance records only.' };
    }
    const response = await request<{ outcomes?: Array<{ status: string; message?: string; result?: { message?: string } }> }>(
      'tenant/sync/commands',
      {
        method: 'POST',
        body: JSON.stringify({
          commands: [{
            commandId: command.id,
            deviceId,
            entityType: 'attendance',
            operation: 'create',
            payload: command.payload,
          }],
        }),
      },
    );
    const outcome = response.outcomes?.[0];
    if (!outcome) throw new Error('The sync API returned no command outcome.');
    if (outcome.status === 'conflict') return { status: 'conflict', message: outcome.message ?? 'The server reported a synchronization conflict.' };
    if (outcome.status === 'rejected') return { status: 'rejected', message: outcome.result?.message ?? 'The server rejected this attendance record.' };
    if (outcome.status !== 'accepted' && outcome.status !== 'synced') {
      throw new Error(`Unexpected sync status: ${outcome.status}`);
    }
    return { status: 'synced' };
  });
}
