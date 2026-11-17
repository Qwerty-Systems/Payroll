import { useEffect, useRef } from 'react';

export interface AutoSyncOptions {
  enabled: boolean;
  /** Runs one synchronization pass. Must be safe to call repeatedly (the outbox is single-flight and idempotent). */
  run: () => Promise<void>;
  intervalMs?: number;
}

/**
 * Triggers background synchronization when the device regains connectivity, when the tab becomes visible again,
 * and on a slow interval while online. Failures are swallowed here: the outbox records them per command and the
 * retry backoff decides when each command is eligible again.
 */
export function useAutoSync({ enabled, run, intervalMs = 60_000 }: AutoSyncOptions): void {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return undefined;
    const trigger = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void runRef.current().catch(() => undefined);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') trigger(); };
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(trigger, intervalMs);
    trigger();
    return () => {
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);
}
