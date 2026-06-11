/**
 * Agentic-tier gate + timeout helpers, shared by the four dimension agents.
 *
 * The Claude Agent SDK authenticates with either a subscription OAuth token
 * (CLAUDE_CODE_OAUTH_TOKEN) or a plain API key (ANTHROPIC_API_KEY). Without
 * one of them the engine runs deterministic-only — the evaluator records that
 * as mode 'deterministic-only' in the dimension result.
 */

export function hasAgentAuth(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

export function requireAgentAuth(): void {
  if (!hasAgentAuth()) {
    throw new Error(
      'Missing Claude authentication. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY'
    );
  }
}

/**
 * Per-dimension agentic pass timeout. undici fetch timeouts are disabled
 * mesh-wide (a2a-common/src/net.ts), so without this a hung agentic turn
 * holds its browser permit and queue slot forever while the 45s SSE
 * heartbeat keeps the task alive.
 */
const DEFAULT_AGENTIC_TIMEOUT_MS = 300_000; // 5 min per dimension pass

export function agenticTimeoutMs(): number {
  const fromEnv = Number(process.env.AGENTIC_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_AGENTIC_TIMEOUT_MS;
}

/**
 * AbortController wired to the agentic timeout. Pass `controller` to the
 * Agent SDK query() options and call `done()` in a finally block.
 */
export function agenticAbort(label: string): { controller: AbortController; done: () => void } {
  const timeoutMs = agenticTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`${label} agentic pass timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  return { controller, done: () => clearTimeout(timer) };
}
