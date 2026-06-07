/**
 * Global browser semaphore (PRD part-2): every Chromium acquisition — the
 * deterministic Playwright script shell-outs AND the agentic Playwright-MCP
 * spawns — takes a permit. Service-wide cap, so EVAL_CONCURRENCY × 4 dimensions
 * can never exceed BROWSER_PERMITS live browsers.
 */
const PERMITS = Number(process.env.BROWSER_PERMITS ?? 3);

let inUse = 0;
let maxObserved = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inUse < PERMITS) {
    inUse++;
    maxObserved = Math.max(maxObserved, inUse);
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inUse++;
  maxObserved = Math.max(maxObserved, inUse);
}

function release(): void {
  inUse--;
  const next = waiters.shift();
  if (next) next();
}

export async function withBrowserPermit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Introspection for /health and tests. */
export function browserSemaphoreStats() {
  return { permits: PERMITS, inUse, waiting: waiters.length, maxObserved };
}
