import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createLogger } from "@agents/a2a-common";

const log = createLogger("da-migration-agent");

/**
 * A tiny in-process HTTP proxy that sits between `opencode serve` and the Kimi
 * API (api.kimi.com/coding/v1) and repairs the ONE request shape Kimi rejects.
 *
 * Why this exists (2026-09-02): from 2026-08-24 the daily loop began failing
 * ~40% of days with a non-retryable Kimi 400 -
 *   "the message at position N with role 'assistant' must not be empty"
 * opencode replays the whole session history on every agentic step, so once a
 * single empty assistant turn lands in the transcript (K3 occasionally returns
 * a stop with no content; an aborted step persists with no visible parts) every
 * subsequent step re-sends it and the migration is bricked mid-authoring.
 * Upstream: anomalyco/opencode #37946, #46577, #46881; PR #45839 (unmerged).
 *
 * Probed directly against k3 (2026-09-02, tiny max_tokens):
 *   content:"" + tool_calls            → 200   content:"" alone        → 400
 *   content:"" + reasoning_content     → 200   content:[] alone        → 400
 *   content:" "                        → 200   two assistants in a row → 200
 * So the fix is surgical: drop assistant messages that carry no text, no
 * tool_calls and no reasoning_content. Nothing else on the wire is touched -
 * headers, streaming SSE bodies and every other route pass straight through.
 *
 * Wiring: `opencode.ts` starts one proxy per process and points the generated
 * OPENCODE_CONFIG's `provider.kimi-code.options.baseURL` at it (verified to
 * override the global config on opencode 1.16.2 and 1.18.25). Independent of
 * the opencode version - which matters, because the container installs opencode
 * unpinned and opencode auto-installs patch releases.
 */

export interface DroppedMessage {
  index: number;
  reason: string;
}

export interface SanitizeResult<T = unknown> {
  messages: T[];
  dropped: DroppedMessage[];
}

function textOf(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("");
  }
  return "";
}

/**
 * Remove assistant messages Kimi would reject as empty. Pure; returns the kept
 * messages plus a record of what was dropped (for the warn log + tests).
 */
export function sanitizeKimiMessages<T = unknown>(messages: T[] | unknown): SanitizeResult<T> {
  if (!Array.isArray(messages)) return { messages: messages as T[], dropped: [] };
  const dropped: DroppedMessage[] = [];
  const kept = (messages as T[]).filter((m, index) => {
    if (!m || typeof m !== "object" || (m as { role?: unknown }).role !== "assistant") return true;
    const msg = m as { content?: unknown; tool_calls?: unknown; reasoning_content?: unknown };
    const hasText = textOf(msg.content).length > 0;
    const hasTools = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
    const hasReasoning = typeof msg.reasoning_content === "string" && msg.reasoning_content.length > 0;
    if (hasText || hasTools || hasReasoning) return true;
    dropped.push({
      index,
      reason: `assistant with content=${JSON.stringify(msg.content ?? null).slice(0, 40)}, tool_calls=${
        Array.isArray(msg.tool_calls) ? msg.tool_calls.length : "none"
      }, reasoning_content=${typeof msg.reasoning_content === "string" ? msg.reasoning_content.length + " chars" : "none"}`,
    });
    return false;
  });
  return { messages: kept, dropped };
}

// hop-by-hop / transport headers we never forward (fetch recomputes them)
const REQ_STRIP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade", "te", "trailer", "proxy-connection", "accept-encoding"]);
const RES_STRIP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export interface KimiProxyStats {
  requests: number;
  /** chat/completions bodies that needed repair */
  sanitized: number;
  /** total assistant messages dropped */
  dropped: number;
  upstreamErrors: number;
  /** last Kimi 4xx/5xx seen (status + first 200 chars) - for /health */
  lastUpstreamError: string | null;
}

export interface KimiProxy {
  /** e.g. http://127.0.0.1:53211 - opencode's baseURL is `${base}/coding/v1` */
  base: string;
  /** upstream origin, e.g. https://api.kimi.com */
  upstream: string;
  stats: KimiProxyStats;
  close(): Promise<void>;
}

export interface KimiProxyOptions {
  /** Upstream ORIGIN (scheme + host); the request path/query is preserved verbatim. */
  upstream: string;
  host?: string;
}

/** Summarize the message at the position Kimi complained about (diagnosis only). */
function describeAt(messages: unknown, position: number): string {
  if (!Array.isArray(messages) || !messages[position] || typeof messages[position] !== "object") return "n/a";
  const m = messages[position] as { role?: unknown; content?: unknown; tool_calls?: unknown; reasoning_content?: unknown };
  return `role=${String(m.role)} text=${textOf(m.content).length}ch tool_calls=${Array.isArray(m.tool_calls) ? m.tool_calls.length : 0} reasoning=${
    typeof m.reasoning_content === "string" ? m.reasoning_content.length : 0
  }ch`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function startKimiProxy(opts: KimiProxyOptions): Promise<KimiProxy> {
  const upstream = new URL(opts.upstream).origin;
  const host = opts.host ?? "127.0.0.1";
  const stats: KimiProxyStats = { requests: 0, sanitized: 0, dropped: 0, upstreamErrors: 0, lastUpstreamError: null };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    stats.requests++;
    const method = req.method ?? "GET";
    const target = new URL(req.url ?? "/", upstream);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null || REQ_STRIP.has(k.toLowerCase())) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    headers.set("accept-encoding", "identity"); // stream SSE bytes through untouched

    let body: Buffer | string | undefined = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
    let sentMessages: unknown = undefined;
    if (body && body.length && method === "POST" && /\/chat\/completions\/?$/.test(target.pathname)) {
      try {
        const json = JSON.parse(body.toString("utf8")) as { messages?: unknown; model?: unknown };
        const { messages, dropped } = sanitizeKimiMessages(json.messages);
        if (dropped.length) {
          json.messages = messages;
          body = JSON.stringify(json);
          stats.sanitized++;
          stats.dropped += dropped.length;
          log.warn("kimi proxy: dropped empty assistant message(s) Kimi would reject", {
            model: json.model,
            total_messages: Array.isArray(json.messages) ? json.messages.length : null,
            dropped,
          });
        }
        sentMessages = json.messages;
      } catch {
        /* not JSON we understand - forward the original bytes untouched */
      }
    }

    let up: Response;
    try {
      // Buffer is a Uint8Array at runtime; TS's BodyInit just doesn't know it.
      up = await fetch(target, { method, headers, body: body as unknown as BodyInit | undefined, redirect: "manual" });
    } catch (e) {
      stats.upstreamErrors++;
      stats.lastUpstreamError = `unreachable: ${String(e).slice(0, 200)}`;
      log.error("kimi proxy: upstream unreachable", { target: target.href, error: String(e) });
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `kimi proxy: upstream unreachable: ${String(e)}`, type: "proxy_error" } }));
      return;
    }

    const outHeaders: Record<string, string> = {};
    up.headers.forEach((v, k) => {
      if (!RES_STRIP.has(k.toLowerCase())) outHeaders[k] = v;
    });

    if (up.status >= 400) {
      // Read, log (with the message Kimi pointed at, if any), then forward as-is.
      const text = await up.text().catch(() => "");
      stats.upstreamErrors++;
      stats.lastUpstreamError = `${up.status} ${text.slice(0, 200)}`;
      const pos = /position (\d+)/.exec(text);
      log.warn("kimi proxy: upstream error", {
        status: up.status,
        path: target.pathname,
        body: text.slice(0, 400),
        ...(pos ? { offending_message: describeAt(sentMessages, Number(pos[1])) } : {}),
      });
      res.writeHead(up.status, outHeaders);
      res.end(text);
      return;
    }

    res.writeHead(up.status, outHeaders);
    if (!up.body) return void res.end();
    const reader = up.body.getReader();
    req.on("close", () => void reader.cancel().catch(() => {}));
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!res.write(value)) await new Promise<void>((r) => res.once("drain", () => r()));
      }
    } catch (e) {
      log.warn("kimi proxy: upstream stream ended abnormally", { error: String(e).slice(0, 200) });
    } finally {
      res.end();
    }
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      log.error("kimi proxy: handler crashed", { error: String(e) });
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `kimi proxy: ${String(e)}`, type: "proxy_error" } }));
    });
  });
  // long agentic turns: never let the proxy itself time an idle SSE out
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 65_000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://${host}:${port}`;
  log.info("kimi proxy listening", { base, upstream });

  return {
    base,
    upstream,
    stats,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
