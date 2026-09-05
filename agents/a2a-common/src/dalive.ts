import { createLogger } from "./logging.ts";

/**
 * Minimal da.live client for the mesh — talks to the deployed `functions/`
 * MCP server (`/api/mcp-streamable`) with plain, stateless JSON-RPC
 * `tools/call` requests. The server self-authenticates to da.live with its
 * own S2S technical account (anonymous inbound), so no secret is needed here;
 * `DALIVE_BEARER_TOKEN` optionally attributes writes to a real user instead.
 *
 * Deliberately NOT defaulted: memory read/write (memory.ts) is only enabled
 * when `DALIVE_MCP_URL` is set explicitly. The fast e2e tier strips that var,
 * so spawned test agents never touch the real da.live memory page.
 */

const log = createLogger("dalive");

export function daliveMcpUrl(): string | undefined {
  const url = process.env.DALIVE_MCP_URL?.trim();
  return url || undefined;
}

export class DaliveError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "DaliveError";
  }
  /** True when da.live reported the path as missing (a first-run memory page). */
  get notFound(): boolean {
    const text = `${this.message} ${JSON.stringify(this.data ?? "")}`;
    return /\b404\b|not found/i.test(text);
  }
}

interface JsonRpcResponse {
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: { code?: number; message?: string; data?: unknown };
}

/** One `tools/call` round-trip; returns the tool's structured (JSON text) result. */
export async function daliveToolCall<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const url = daliveMcpUrl();
  if (!url) throw new DaliveError("DALIVE_MCP_URL is not set — da.live access is disabled in this process");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.DALIVE_BEARER_TOKEN) headers.authorization = `Bearer ${process.env.DALIVE_BEARER_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const body = (await res.json().catch(() => ({}))) as JsonRpcResponse;
  if (!res.ok || body.error) {
    const err = body.error ?? { message: `HTTP ${res.status}` };
    throw new DaliveError(`da.live ${name} failed: ${err.message ?? "unknown error"}`, err.code, err.data);
  }
  const text = body.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (body.result?.isError) throw new DaliveError(`da.live ${name} failed: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return { text } as unknown as T;
  }
}

/** GET a da.live source document (`/source/{owner}/{site}/{path}.html`). */
export async function getDaliveContent(path: string): Promise<{ htmlContent: string; lastModified?: string }> {
  const out = await daliveToolCall<{ htmlContent?: string; lastModified?: string }>("get_dalive_content", { path });
  if (typeof out.htmlContent !== "string") throw new DaliveError(`da.live get_dalive_content returned no htmlContent for ${path}`);
  return { htmlContent: out.htmlContent, lastModified: out.lastModified };
}

/** Save (overwrite) a da.live source document. */
export async function saveDaliveContent(path: string, htmlContent: string): Promise<{ savedAt?: string }> {
  const out = await daliveToolCall<{ success?: boolean; savedAt?: string; error?: string }>(
    "save_dalive_content",
    { path, htmlContent },
    { timeoutMs: 90_000 }
  );
  if (out.success === false) throw new DaliveError(`da.live save_dalive_content reported failure for ${path}: ${out.error ?? ""}`);
  log.info("da.live document saved", { path, chars: htmlContent.length });
  return { savedAt: out.savedAt };
}
