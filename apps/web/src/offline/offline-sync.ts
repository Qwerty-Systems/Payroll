import {
  listPendingCommands,
  updateCommand,
  type SyncCommand,
} from './offline-db';

export type SyncResult =
  | { status: 'synced'; serverVersion?: string }
  | { status: 'conflict'; message: string }
  | { status: 'rejected'; message: string };

export type SyncSender = (command: SyncCommand) => Promise<SyncResult>;

export interface SyncSummary {
  sent: number;
  synced: number;
  conflicts: number;
  rejected: number;
  failed: number;
  remaining: number;
}

export interface SyncOptions {
  /** Manual syncs retry failed commands immediately instead of waiting for their backoff. */
  ignoreBackoff?: boolean;
  now?: () => number;
}

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

/** Exponential backoff: 30s, 60s, 2m, 4m ... capped at 15 minutes. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

/** fetch() rejects with a TypeError when the network is unreachable; browsers also expose navigator.onLine. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return error instanceof TypeError;
}

const inFlight = new Map<string, Promise<SyncSummary>>();

/**
 * Transport-independent outbox processor. The caller supplies an authenticated
 * sender so credentials never enter IndexedDB. The API must enforce tenant
 * membership and deduplicate command IDs before applying any mutation.
 *
 * Runs are single-flight per tenant within a tab: a second call while one is running
 * joins the running one rather than sending the same commands twice. Commands are sent
 * oldest-first. When the network is unreachable the run stops, leaving the rest untouched,
 * instead of burning an attempt on every queued command during an outage.
 */
export function synchronizeTenantOutbox(
  tenantId: string,
  send: SyncSender,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const running = inFlight.get(tenantId);
  if (running) return running;
  const run = processOutbox(tenantId, send, options).finally(() => inFlight.delete(tenantId));
  inFlight.set(tenantId, run);
  return run;
}

async function processOutbox(tenantId: string, send: SyncSender, options: SyncOptions): Promise<SyncSummary> {
  const now = options.now ?? Date.now;
  const commands = await listPendingCommands(tenantId, { ignoreBackoff: options.ignoreBackoff, now: now() });
  const summary: SyncSummary = { sent: 0, synced: 0, conflicts: 0, rejected: 0, failed: 0, remaining: commands.length };

  for (const command of commands) {
    summary.sent += 1;
    const syncing: SyncCommand = {
      ...command, state: 'syncing', attempts: command.attempts + 1, syncingSince: new Date(now()).toISOString(), nextAttemptAt: undefined,
    };
    await updateCommand(syncing);

    try {
      const result = await send(syncing);
      const settled = { ...syncing, syncingSince: undefined };
      if (result.status === 'rejected') {
        await updateCommand({ ...settled, state: 'rejected', lastError: result.message });
        summary.rejected += 1;
      } else if (result.status === 'conflict') {
        await updateCommand({ ...settled, state: 'conflict', lastError: result.message });
        summary.conflicts += 1;
      } else {
        await updateCommand({ ...settled, state: 'synced', lastError: undefined });
        summary.synced += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to synchronize this change.';
      const retryAt = new Date(now() + retryDelayMs(syncing.attempts)).toISOString();
      await updateCommand({ ...syncing, syncingSince: undefined, state: 'failed', lastError: message, nextAttemptAt: retryAt });
      summary.failed += 1;
      if (isNetworkError(error)) break;
    }
  }

  summary.remaining = (await listPendingCommands(tenantId, { ignoreBackoff: true, now: now() })).length;
  return summary;
}
