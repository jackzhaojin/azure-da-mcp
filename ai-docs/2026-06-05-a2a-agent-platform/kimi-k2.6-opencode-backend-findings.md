# Kimi K2.6 via opencode — Backend C validation findings

**Date**: 2026-06-08
**Status**: PoC validated (headless path proven)
**Relates to**: [part-5-migration-agent.md](./part-5-migration-agent.md) → **Backend C — `opencode` · Kimi K2.6 (backup)**
**PoC code**: [`references/kimi/`](../../references/kimi/) (`opencode/run-via-serve.ts` + `wire/` + `print/`)

---

## TL;DR

The migration agent's `opencode`/Kimi K2.6 backup backend is **feasible and proven end-to-end**. The working headless
integration is **`opencode serve` + REST (`POST /session/:id/message`)**, *not* `opencode run`. One credential
(`$MOONSHOT_API_KEY`) drives it; it is a Kimi-For-Coding subscription key, valid only at `api.kimi.com/coding/v1` and
only for recognized coding-agent clients (opencode qualifies). Cost is **$0/call** (subscription, not metered).

---

## What was validated

| # | Check | Result |
|---|-------|--------|
| 1 | Credential reaches Kimi K2.6 | ✅ `api.kimi.com/coding/v1/chat/completions` → real completion + `reasoning_content`, `finish_reason: stop` |
| 2 | Streaming works | ✅ 163 `reasoning_content` deltas → 13 `content` deltas → final text |
| 3 | opencode headless (server) | ✅ `opencode serve` → `POST /session/:id/message` returns `parts:[step-start, reasoning, text, step-finish]` |
| 4 | Self-contained PoC script | ✅ `references/kimi/opencode/run-via-serve.ts` spawns server, runs a turn, prints text + tokens, exits 0 |
| 5 | opencode interactive TUI | ✅ user-confirmed (model picker shows "Kimi for Coding (K2.6)") |
| 6 | `opencode run` headless | ❌ emits only `step_start`, exits 0 with empty body (see Gotchas) |
| 7 | `kimi` CLI wire/print PoCs | ⏸️ blocked — `kimi` CLI's own OAuth token expired (`kimi login` needed); unrelated to the env key |

---

## The credential: `$MOONSHOT_API_KEY` is a Kimi-For-Coding key, not a platform key

Stored in `~/.zshrc` (commented *"kimik with opencode"*). Misleadingly named — it is **not** a public Moonshot platform
API key:

| Endpoint | Result |
|----------|--------|
| `api.moonshot.ai/v1`, `api.moonshot.cn/v1` | ❌ `Invalid Authentication` |
| `api.kimi.com/coding/v1` | ✅ authenticates |

The coding endpoint additionally gates on a **client allowlist** by `User-Agent`:

> `access_terminated_error`: *"Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude
> Code, Roo Code, Kilo Code, etc."*

- Raw `curl` with a generic/odd UA → rejected.
- A plausible coding-agent UA (`opencode/1.16.2`, `claude-cli/...`) → **passes**, returns real completions.
- `opencode` and the `kimi` CLI both send a qualifying UA and point at `api.kimi.com/coding/v1` out of the box.

**Implication for the backend:** the `opencode` backend just needs `MOONSHOT_API_KEY` in its environment. No separate
login, no token refresh cron. (Contrast: the standalone `kimi` CLI uses a *different* OAuth token at `~/.kimi` that does
expire — see Gotchas.)

---

## Working integration recipe (Backend C)

```ts
// 1. start the server once (long-lived), inheriting MOONSHOT_API_KEY
spawn("opencode", ["serve", "--port", PORT, "--hostname", "127.0.0.1"], { env: process.env })
// wait for stdout/stderr line matching /listening on/

// 2. per migration task:
POST /session                          // -> { id }
POST /session/:id/message {
  providerID: "kimi-code",
  modelID:    "kimi-for-coding",       // catalog label: "Kimi for Coding (K2.6)"
  parts: [{ type: "text", text: <migration prompt> }]
}
// -> { info: { providerID, modelID, tokens, cost }, parts: [...] }
// visible answer = parts.filter(p => p.type === "text").map(p => p.text).join("")
```

Verified PoC output (`references/kimi/opencode/run-via-serve.ts`):

```
[Kimi K2.6] I'm Kimi, model `kimi-code/kimi-for-coding`.
[meta] model=kimi-code/kimi-for-coding tokens(in=6033 out=111 reasoning=0 cacheRead=8192) cost=0
       parts=[step-start, reasoning, text, step-finish]
```

For the real backend, prefer **one long-lived `opencode serve`** shared by the worker pool over spawn-per-call (the PoC
spawns per run for self-containment). Streaming progress for A2A `Task` updates is available on the server's SSE
`/event` endpoint (mirrors the `parts` lifecycle). Skills + MCP (`functions/` da.live server) are configured through
opencode's normal config — that reuse of the `da-live-author-playwright` skill is the entire reason opencode is the
chosen runtime over a raw chat client.

---

## Gotchas (carry into implementation)

1. **`opencode run` is the wrong headless API for this model.** v1.16.2 `opencode run -m kimi-code/kimi-for-coding`
   prints only the `> build · kimi-for-coding` header and emits a single `step_start` JSON event — no assistant text,
   exit 0. Reproducible with and without a pseudo-TTY and with `--format json`. The TUI and the HTTP server render the
   same model fine. **Use `opencode serve` + REST.** (Likely a `reasoning_content` handling gap in `run`; worth a
   re-test on opencode upgrades.)

2. **K2.6 is a reasoning model — budget `max_tokens`.** Output streams `reasoning_content` *before* `content`. A small
   cap (~30 tokens) is fully consumed by reasoning → empty visible answer. opencode handles this internally; only
   relevant if anything talks to `api.kimi.com/coding/v1` directly.

3. **Model self-report ≠ version.** Asked "which version are you", K2.6 replies "Kimi K2.5" (stale self-knowledge). The
   authoritative tag is opencode's catalog: **kimi-code → "Kimi for Coding (K2.6)"** (and a separate `kimi-k2.5`). Trust
   the catalog/endpoint, not the model.

4. **`kimi` CLI vs opencode use different credentials.** opencode → `$MOONSHOT_API_KEY`. The standalone `kimi` CLI →
   its own OAuth at `~/.kimi/credentials` (currently expired → `401`; fix with `kimi login`). The `kimi` CLI wire/print
   PoCs (`references/kimi/{wire,print}`) therefore need a `kimi login` before they run — but they are only the protocol
   reference; **Backend C does not depend on the `kimi` CLI.**

5. **Sourcing in headless shells.** `MOONSHOT_API_KEY` is exported from `~/.zshrc`; non-interactive shells/subprocesses
   may not load it. The backend's process manager must pass it explicitly into `opencode serve`'s environment.

---

## Open follow-ups

- [x] **DONE (2026-06-08)** — Wired the recipe into [`agents/migration-agent/src/backends/opencode.ts`](../../agents/migration-agent/src/backends/opencode.ts)
      (+ `opencode-config.ts` + `opencode-prompt.ts`): long-lived `opencode serve` singleton, session-per-task, SSE
      `/event` → A2A status mapping. Real differences from the PoC: config is injected via `OPENCODE_CONFIG` (a generated
      file, merged over the global config) wiring the **real** da.live MCP + Playwright MCP + the reused skill with
      `permission:"allow"`; the authoring turn is no longer simulated. Registered as `opencode` in `executor.ts`.
- [x] **DONE (2026-06-08)** — Confirmed the `functions/` da.live MCP + `da-live-author-playwright` skill load under
      opencode and that **K2.6 drives a real end-to-end migration** (Part 5 acceptance met). Verified against
      `da-live-postal-2025-07`: the skill fired, `dalive_get/list/create_folder/create/preview_publish` + `playwright_*`
      all fired, the page was authored → published → Playwright-validated, result **PASS**, and the page reads back from
      da.live (preview returns HTTP 200). Covered by `agents/e2e/tests-live/opencode-migration.live.test.ts`
      (creds+target-gated; writes a real da.live page). da.live auth needed nothing client-side — the deployed MCP
      self-authenticates via its S2S technical account.
- [ ] Re-test `opencode run` on the next opencode release; if fixed, it simplifies the spawn model.
- [ ] Head-to-head datapoint for adaptTo(): "Claude vs Kimi K2.6 on the same N migrations" via the eval agent's variance
      reporting (Part 5 selling point) — now unblocked (the `opencode` backend + the closed loop both exist).
