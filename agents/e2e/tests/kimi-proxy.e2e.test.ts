import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
// Real module, real sockets, no mocks: a fake Kimi upstream speaking the exact
// wire shape (JSON in, SSE out) stands in for api.kimi.com. Imported across the
// workspace boundary by path, like extract-json.e2e.test.ts.
import { sanitizeKimiMessages, startKimiProxy, type KimiProxy } from "../../migration-agent/src/backends/kimi-proxy.ts";

const TOOL_CALLS = [{ id: "call_1", type: "function", function: { name: "echo", arguments: "{}" } }];

// The shapes probed directly against k3 on 2026-09-02 (see kimi-proxy.ts).
describe("sanitizeKimiMessages - the exact shape Kimi rejects", () => {
  it("keeps every shape Kimi accepts", () => {
    const ok = [
      { role: "system", content: "" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "", tool_calls: TOOL_CALLS }, // A
      { role: "tool", tool_call_id: "call_1", content: "hi" },
      { role: "assistant", content: "", reasoning_content: "thinking" }, // D
      { role: "assistant", content: " " }, // E
      { role: "assistant", content: null, tool_calls: TOOL_CALLS }, // F
      { role: "assistant", content: [{ type: "text", text: "x" }] },
      { role: "assistant", content: "one" },
      { role: "assistant", content: "two" }, // H - consecutive assistants are fine
    ];
    const { messages, dropped } = sanitizeKimiMessages(ok);
    expect(dropped).toEqual([]);
    expect(messages).toEqual(ok);
  });

  it("drops assistant messages with no text, no tool_calls and no reasoning", () => {
    const input = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "" }, // C → 400 upstream
      { role: "user", content: "again" },
      { role: "assistant", content: [] }, // G → 400 upstream
      { role: "assistant", content: null },
      { role: "assistant", content: "", reasoning_content: "" },
      { role: "assistant", content: "", tool_calls: [] },
      { role: "assistant", content: [{ type: "text", text: "" }] },
      { role: "assistant", content: "kept" },
    ];
    const { messages, dropped } = sanitizeKimiMessages(input);
    expect(dropped.map((d) => d.index)).toEqual([1, 3, 4, 5, 6, 7]);
    expect(messages).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "again" },
      { role: "assistant", content: "kept" },
    ]);
    expect(dropped[0].reason).toMatch(/content=""/);
  });

  it("passes non-arrays through untouched", () => {
    expect(sanitizeKimiMessages(undefined)).toEqual({ messages: undefined, dropped: [] });
  });
});

describe("kimi proxy - repairs chat/completions on the wire, streams everything else through", () => {
  let upstream: Server;
  let upstreamBase: string;
  let proxy: KimiProxy;
  const seen: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }> = [];
  // streaming proof: the test arms a gate; the upstream releases the tail of the
  // SSE only once the client has consumed the head (see the handler below)
  let gateForNext: { promise: Promise<void>; release: () => void } | null = null;
  let streamedLive: boolean | null = null;
  const armGate = () => {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    gateForNext = { promise, release };
    return gateForNext;
  };
  const SSE_LINES = ['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n', "data: [DONE]\n\n"];

  beforeAll(async () => {
    upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks).toString("utf8");
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });

      if (req.url === "/coding/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "k3", display_name: "K3" }] }));
      }
      if (req.url === "/coding/v1/chat/completions") {
        const json = JSON.parse(body) as { model: string; messages: Array<{ role: string; content: unknown }> };
        if (json.model === "reject-me") {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "the message at position 1 with role 'assistant' must not be empty", type: "invalid_request_error" } }));
        }
        // a real SSE stream: the first chunk goes out, then the upstream HOLDS the
        // rest until the test has read that chunk through the proxy (or 3s pass).
        // Ordering, not wall-clock, proves the proxy streams instead of buffering.
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "x-request-id": "req-123" });
        res.write(SSE_LINES[0]);
        const gate = gateForNext;
        gateForNext = null;
        if (gate) {
          streamedLive = await Promise.race([gate.promise.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
        }
        for (const line of SSE_LINES.slice(1)) res.write(line);
        return res.end();
      }
      res.writeHead(404);
      res.end("nope");
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
    upstreamBase = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    proxy = await startKimiProxy({ upstream: upstreamBase });
  });

  afterAll(async () => {
    await proxy.close();
    await new Promise<void>((r) => upstream.close(() => r()));
  });

  it("drops the empty assistant turn, keeps tool-call turns, forwards auth + UA, and streams the SSE back intact", async () => {
    seen.length = 0;
    const messages = [
      { role: "user", content: "call echo" },
      { role: "assistant", content: "", tool_calls: TOOL_CALLS },
      { role: "tool", tool_call_id: "call_1", content: "hi" },
      { role: "assistant", content: "" }, // the poison pill
      { role: "user", content: "continue" },
    ];
    const gate = armGate();
    const res = await fetch(`${proxy.base}/coding/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer sk-test", "user-agent": "opencode/1.16.2" },
      body: JSON.stringify({ model: "k3", stream: true, messages }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-request-id")).toBe("req-123");

    // streamed, not buffered: the head chunk reaches us while the upstream is
    // still holding the tail; only then do we release it. A buffering proxy
    // would never deliver the head first (the upstream gives up after 3s and
    // streamedLive reads false).
    const reader = res.body!.getReader();
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value).toString("utf8"));
      if (chunks.length === 1) gate.release();
    }
    expect(chunks[0]).toBe(SSE_LINES[0]);
    expect(chunks.join("")).toBe(SSE_LINES.join(""));
    expect(streamedLive).toBe(true);

    expect(seen).toHaveLength(1);
    const got = seen[0];
    expect(got.method).toBe("POST");
    expect(got.url).toBe("/coding/v1/chat/completions");
    expect(got.headers.authorization).toBe("Bearer sk-test");
    expect(got.headers["user-agent"]).toBe("opencode/1.16.2");
    expect(got.headers.host).toBe(new URL(upstreamBase).host); // rewritten, not the proxy's
    const forwarded = JSON.parse(got.body) as { model: string; stream: boolean; messages: typeof messages };
    expect(forwarded.model).toBe("k3");
    expect(forwarded.stream).toBe(true);
    expect(forwarded.messages).toEqual(messages.filter((_, i) => i !== 3));
    expect(proxy.stats.sanitized).toBe(1);
    expect(proxy.stats.dropped).toBe(1);
  });

  it("leaves a clean body byte-identical", async () => {
    seen.length = 0;
    const payload = JSON.stringify({ model: "k3", stream: true, messages: [{ role: "user", content: "hi" }], extra: { nested: [1, 2, 3] } });
    const res = await fetch(`${proxy.base}/coding/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
    expect(res.status).toBe(200);
    await res.text();
    expect(seen[0].body).toBe(payload);
  });

  it("passes GET /models straight through", async () => {
    const res = await fetch(`${proxy.base}/coding/v1/models`, { headers: { authorization: "Bearer sk-test" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: "k3", display_name: "K3" }] });
  });

  it("forwards an upstream 4xx verbatim (status + body) and records it", async () => {
    const res = await fetch(`${proxy.base}/coding/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "reject-me", messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "x" }] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/must not be empty/);
    expect(proxy.stats.lastUpstreamError).toMatch(/^400 /);
  });

  it("answers 502 (not a hang) when the upstream is gone", async () => {
    const dead = await startKimiProxy({ upstream: "http://127.0.0.1:9" });
    try {
      const res = await fetch(`${dead.base}/coding/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(res.status).toBe(502);
      expect(dead.stats.upstreamErrors).toBe(1);
    } finally {
      await dead.close();
    }
  });
});
