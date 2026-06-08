# Kimi K2.6 Integration PoCs

Proof-of-concept integrations for driving the **Kimi K2.6** model ("Kimi for Coding") two ways:

1. **`kimi` CLI** (Moonshot's [kimi-cli](https://github.com/MoonshotAI/kimi-cli)) — Wire mode + Print mode (`wire/`, `print/`)
2. **`opencode` CLI** ([sst/opencode](https://github.com/sst/opencode)) — headless server (`opencode/`)

This folder is the **baseline reference** for the A2A migration agent's `opencode`/Kimi K2.6 *backup* backend (see
[`ai-docs/2026-06-05-a2a-agent-platform/part-5-migration-agent.md`](../../ai-docs/2026-06-05-a2a-agent-platform/part-5-migration-agent.md),
Backend C). The validation findings live in
[`ai-docs/.../kimi-k2.6-opencode-backend-findings.md`](../../ai-docs/2026-06-05-a2a-agent-platform/kimi-k2.6-opencode-backend-findings.md).

> **✅ Now shipped (2026-06-08).** The real backend lives at
> [`agents/migration-agent/src/backends/opencode.ts`](../../agents/migration-agent/src/backends/opencode.ts)
> (+ `opencode-config.ts` + `opencode-prompt.ts`). It went past this PoC: real da.live + Playwright MCP, the reused
> `da-live-author-playwright` skill, and a **verified end-to-end migration** of a real page (PASS) — see the live test
> `agents/e2e/tests-live/opencode-migration.live.test.ts`. These scripts remain the minimal, dependency-free reference.

> **opencode is the strategic target** — it natively supports **skills** and MCP, so the migration prompt +
> `da-live-author-playwright` skill can be reused instead of re-encoded. The `kimi` CLI PoCs are kept as the protocol
> reference (Wire = JSON-RPC, Print = stream-json).

---

## Auth — one credential, `$MOONSHOT_API_KEY`

Despite the name, `MOONSHOT_API_KEY` (in `~/.zshrc`, commented *"kimik with opencode"*) is **not** a public Moonshot
platform key. It is the **Kimi-For-Coding subscription credential**:

| Endpoint | Result with this key |
|----------|----------------------|
| `api.moonshot.ai` / `api.moonshot.cn` `/v1` | ❌ `Invalid Authentication` (not a platform key) |
| `api.kimi.com/coding/v1` | ✅ valid — but only for **recognized coding-agent clients** |

The coding endpoint enforces a **client allowlist** (by User-Agent): *"Kimi For Coding is currently only available for
Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc."* Raw `curl` with a generic UA is rejected;
`kimi` CLI and `opencode` identify correctly and pass. Both clients point at `https://api.kimi.com/coding/v1`.

`kimi-for-coding` is a **reasoning model**: responses stream `reasoning_content` *before* `content`. Budget tokens
accordingly — a `max_tokens` of ~30 is consumed entirely by reasoning and yields empty visible text.

> **Version note:** the model self-reports "Kimi K2.5" when asked (unreliable model self-knowledge). The authoritative
> version tag is opencode's catalog label **"Kimi for Coding (K2.6)"** — the endpoint, not the model's self-claim,
> defines the version.

---

## `opencode/` — headless server PoC (the working backend path)

```bash
cd references/kimi
npm install                       # tsx
source ~/.zshrc                   # exports MOONSHOT_API_KEY
npx tsx opencode/run-via-serve.ts "your prompt here"
```

`run-via-serve.ts` spawns `opencode serve`, opens a session, runs one full K2.6 turn over the REST API, and prints the
final text + token usage. Verified output:

```
[Kimi K2.6] I'm Kimi, model `kimi-code/kimi-for-coding`.
[meta] model=kimi-code/kimi-for-coding tokens(in=6033 out=111 reasoning=0 cacheRead=8192) cost=0
       parts=[step-start, reasoning, text, step-finish]
```

**Why the server and not `opencode run`?** `opencode run` is the obvious analogue of `kimi --print`, but in v1.16.2 it
does **not** surface assistant text for `kimi-for-coding` — it emits only a `step_start` event and exits 0 with an empty
body (TTY or not). The interactive TUI and the HTTP server both render the model correctly. So the headless path for a
programmatic backend is **`opencode serve` + `POST /session/:id/message`**, which is what this PoC demonstrates.

### `opencode/a2a-backend-poc.ts` — K2.6 as an A2A migration backend

The translation step toward [`agents/migration-agent/`](../../agents/migration-agent/). Same dependency-free file, but
the shapes are a faithful mirror of `@a2a-js/sdk` + `agents/migration-agent/src/backends/types.ts`:

```bash
source ~/.zshrc && npx tsx opencode/a2a-backend-poc.ts
```

It feeds a `migration.run.v1` payload to an `opencodeKimiBackend` (K2.6 plans the EDS blocks/confidence/gaps) and
surfaces the result through the exact A2A event sequence the real agent emits:

```
↳ [task]   state=submitted
↳ [status] state=working  "migration started (backend: opencode)"
↳ [status] state=working  "opencode/K2.6: analyzing webpage …"
↳ [artifact] migration-report: {"status":"…","confidence":…,"blocksUsed":[…],"gaps":[…],"backend":"opencode"}
↳ [status] state=completed  (final)
```

`opencodeKimiBackend` lifts almost verbatim into `agents/migration-agent/src/backends/opencode.ts`; `runExecutor`
mirrors `migrationExecutor.execute`. (PoC simulates the authoring turn — the real backend hands K2.6 the `functions/`
da.live MCP + `da-live-author-playwright` skill and runs the author→validate loop.)

---

## `wire/` + `print/` — `kimi` CLI PoCs (protocol reference)

> ⚠️ **Requires a live `kimi` CLI login.** These shell out to the `kimi` binary, which uses its **own** OAuth token
> (separate from `$MOONSHOT_API_KEY`). If it has expired you'll see `401 … API Key appears to be invalid or may have
> expired`; run **`kimi login`** (interactive browser flow) to restore it. `opencode` is unaffected — it uses the env key.

All scripts run with `tsx` and only use Node built-ins. From `references/kimi/`:

```bash
npm install
npm run basic-print              # print/basic-print.ts  — kimi --quiet, final text only
npm run agent-worker             # print/agent-worker.ts  — --print --output-format=stream-json
npm run agent-stream-json-log    # print/agent-stream-json-log.ts — logs raw JSONL to print/output/
npm run basic-wire               # wire/basic-wire.ts     — minimal JSON-RPC client
npm run stream-wire              # wire/stream-wire.ts    — interactive REPL, full event stream
```

The scripts run `kimi` from the monorepo root (resolved relative to the script; override with `KIMI_CWD`).

### Mode comparison

| Mode | Best for | Real-time tool visibility | Interactive control |
|------|----------|---------------------------|---------------------|
| `kimi --quiet` | fire-and-forget | ❌ | ❌ |
| `kimi --print --output-format=stream-json` | agent workers, pipelines | ✅ message-by-message | ❌ (auto-approved) |
| `kimi --wire` | custom UIs, full observability | ✅ event + token level | ✅ |
| `opencode serve` (REST) | **A2A backend (skills + MCP)** | ✅ via `parts` / SSE `/event` | ✅ (approvals, steering) |

## Output logs

`print/output/` is `.gitignore`d — `agent-stream-json-log.ts` writes timestamped raw JSONL there.
