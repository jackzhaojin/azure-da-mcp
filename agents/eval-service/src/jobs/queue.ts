import PQueue from "p-queue";

/**
 * In-process job queue (PRD part-2): submit-and-detach execution model.
 * A2A message/send returns immediately; workers drain the queue at
 * EVAL_CONCURRENCY (default 2). No Redis in v1; restart rebuild happens in
 * index.ts by re-enqueueing non-terminal tasks from the store
 * (sleep-tolerance rule).
 */
export const EVAL_CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 2);

export const evalQueue = new PQueue({ concurrency: EVAL_CONCURRENCY });

export function queueStats() {
  return {
    concurrency: EVAL_CONCURRENCY,
    running: evalQueue.pending,
    queued: evalQueue.size,
  };
}
