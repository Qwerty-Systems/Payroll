import {
  listPendingCommands,
  updateCommand,
  type SyncCommand,
} from './offline-db';

export type SyncResult =
  | { status: 'synced'; serverVersion?: string }
  | { status: 'conflict'; message: string };

export type SyncSender = (command: SyncCommand) => Promise<SyncResult>;

export interface SyncSummary {
  sent: number;
  synced: number;
  conflicts: number;
  failed: number;
  remaining: number;
}

/**
 * Transport-independent outbox processor. The caller supplies an authenticated
 * sender so credentials never enter IndexedDB. The API must enforce tenant
 * membership and deduplicate command IDs before applying any mutation.
 */
export async function synchronizeTenantOutbox(
  tenantId: string,
  send: SyncSender,
): Promise<SyncSummary> {
  const commands = await listPendingCommands(tenantId);
  const summary: SyncSummary = { sent: 0, synced: 0, conflicts: 0, failed: 0, remaining: commands.length };

  for (const command of commands) {
    summary.sent += 1;
    const syncing = { ...command, state: 'syncing' as const, attempts: command.attempts + 1 };
    await updateCommand(syncing);

    try {
      const result = await send(syncing);
      if (result.status === 'conflict') {
        await updateCommand({ ...syncing, state: 'conflict', lastError: result.message });
        summary.conflicts += 1;
      } else {
        await updateCommand({ ...syncing, state: 'synced', lastError: undefined });
        summary.synced += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to synchronize this change.';
      await updateCommand({ ...syncing, state: 'failed', lastError: message });
      summary.failed += 1;
    }
  }

  const pending = await listPendingCommands(tenantId);
  summary.remaining = pending.length;
  return summary;
}
