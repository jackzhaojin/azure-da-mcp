import { Agent, setGlobalDispatcher, getGlobalDispatcher } from "undici";

/**
 * Disable undici's default 300s headers/body timeouts process-wide.
 *
 * Node 20's built-in fetch aborts any request whose headers (or next body chunk)
 * take >5 min — which kills (a) the opencode backend's blocking agentic-turn POST
 * (Kimi migrations routinely run 4–15 min) and (b) idle A2A SSE streams while a
 * long child stage is quiet. Both undici copies (Node's bundled one and this
 * package's) share the dispatcher via Symbol.for("undici.globalDispatcher.1"),
 * so setting it here covers every fetch in the process.
 */
const MARK = Symbol.for("agents.a2a.noTimeoutDispatcher");
const g = globalThis as { [MARK]?: boolean };
if (!g[MARK]) {
  g[MARK] = true;
  // keepAliveTimeout stays default; only the request-progress timeouts go away.
  setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));
}

export function meshDispatcherInstalled(): boolean {
  return Boolean(getGlobalDispatcher());
}
