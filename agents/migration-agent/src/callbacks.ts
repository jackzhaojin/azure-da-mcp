import type { MigrationResult } from "./backends/types.ts";

/**
 * Pending-callback registry for asynchronous backends (makecom): the backend
 * parks a waiter here; the /callbacks/makecom/{taskId} route resolves it when
 * the external system POSTs the final report. In-memory by design — if the
 * process dies mid-wait, the callback route completes the task straight from
 * the store instead (see index.ts), so nothing is lost (sleep-tolerance rule).
 */
const pending = new Map<string, { resolve: (r: MigrationResult) => void; reject: (e: Error) => void }>();

export function waitForCallback(taskId: string, timeoutMs: number): Promise<MigrationResult> {
  return new Promise<MigrationResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(taskId);
      reject(new Error(`makecom callback timeout after ${timeoutMs}ms (task ${taskId})`));
    }, timeoutMs);
    pending.set(taskId, {
      resolve: (r) => {
        clearTimeout(timer);
        pending.delete(taskId);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        pending.delete(taskId);
        reject(e);
      },
    });
  });
}

/** Returns true if an in-process waiter consumed the report. */
export function resolveCallback(taskId: string, report: MigrationResult): boolean {
  const waiter = pending.get(taskId);
  if (!waiter) return false;
  waiter.resolve(report);
  return true;
}

export function pendingCallbackCount(): number {
  return pending.size;
}
