# Part 3 — A2A Protocol Layer

Decision D2: **full official A2A SDK from day one**. This part defines how the spec maps onto our agents and what we deliberately skip.

## Why Full SDK (recap)

- A2A is Linux Foundation-governed, spec **v1.0** (April 2026), 150+ member orgs, production JS SDK — it's a real standard now, not a Google experiment
- The Task lifecycle (`submitted → working → completed/failed`), SSE streaming, and **push notifications (webhooks)** model our exact needs: kick off a long eval/migration, stream progress, get called back
- Learning the protocol hands-on is a primary goal (adaptTo() talk material: "MCP for agent↔tool, A2A for agent↔agent" is the cleanest framing in the ecosystem right now)
- Three+ agents make Agent Cards and a uniform client genuinely useful, not ceremony

## Scope: What We Use vs Skip (v1)

| A2A feature | Use? | Notes |
|---|---|---|
| Agent Cards (`/.well-known/agent-card.json`) | ✅ | One per agent; skills enumerate task types |
| JSON-RPC 2.0 binding over HTTP | ✅ | The SDK default; familiar from `functions/` MCP work |
| `message/send`, `tasks/get`, `tasks/cancel` | ✅ | Core lifecycle |
| `message/stream` (SSE) | ✅ | Orchestrator live progress; replaces today's bespoke SSE event vocabulary |
| Push notifications (webhooks) | ✅ | The Make.com interop mechanism + orchestrator fan-out completion |
| Task `contextId` | ✅ | Threads a pipeline: content-gen → migration → eval tasks share a contextId per pipeline instance |
| Artifacts (text/file/structured parts) | ✅ | Structured JSON + Supabase Storage references |
| gRPC / HTTP-REST bindings | ❌ | JSON-RPC only; zero benefit at our scale |
| Signed Agent Cards | ❌ | Cryptographic identity is enterprise theater for a single-owner mesh |
| Dynamic discovery / registries | ❌ | Endpoints are compose-internal DNS names + env config |
| `input-required` state | ❌ v1 | All tasks fully specified up front; revisit if human-in-the-loop approval lands |

## Agent Card Example (eval agent)

```jsonc
{
  "name": "da-eval-agent",
  "description": "Evaluates EDS page migrations across structure, accessibility, content, visual dimensions",
  "url": "http://eval-service:4001/a2a",
  "version": "1.0.0",
  "capabilities": { "streaming": true, "pushNotifications": true },
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    {
      "id": "eval.run",
      "name": "Evaluate page",
      "description": "Run a 4-dimension migration-quality evaluation against a published EDS page",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
      // payload schema: agents/contracts/eval.run.v1.json
    }
  ],
  "securitySchemes": { "bearer": { "type": "http", "scheme": "bearer" } }
}
```

Skills per agent: eval-service → `eval.run`; content-gen → `content.brief`, `content.synthesize-source`; migration-agent → `migration.run`.

## `a2a-common` Package

Shared bootstrap so each agent is ~50 lines of wiring:

- **Server factory**: Express + A2A SDK request handler, Agent Card serving, health endpoint
- **Task store adapter**: implements the SDK's task-store interface backed by Supabase `tasks` (the SDK ships an in-memory store; ours must survive restarts — this is the one place we go beyond SDK defaults)
- **Push-notification sender**: POSTs task-completion payloads to caller-registered webhook URLs with retry (3x, exponential); supports a static bearer token per registration
- **Auth middleware**: shared-secret bearer (`A2A_MESH_TOKEN` env) on all A2A endpoints. The mesh is compose-internal; the only public exposure is via reverse proxy for Make.com callbacks (see below). Real OAuth is explicitly out of scope v1.
- **Telemetry**: structured logs with `a2a_task_id` + `context_id` on every line

## Event Mapping (today's SSE → A2A)

| Today (`stream/route.ts`) | A2A equivalent |
|---|---|
| `agent-start` (dimension) | `TaskStatusUpdateEvent` (state `working`, message: dimension started) |
| `agent-complete` | `TaskStatusUpdateEvent` + partial artifact (dimension score) |
| `evaluation-complete` | `TaskArtifactUpdateEvent` (final report) + status `completed` |
| `error` | status `failed` with error message |

## Make.com Interop (decision 2026-06-05: webhook shim at the edge)

Make.com has **no native A2A connector** (verified June 2026), and its HTTP module **cannot consume SSE** — so Make.com can only ever use the fire-and-forget subset of A2A. The two directions get different treatment:

**Agent → Make.com (callback): zero work — A2A push notifications ARE standard webhooks.** A push notification is just an HTTP POST of the task object to a registered URL; Make.com's Custom Webhook trigger receives it natively without knowing A2A exists. Long-running migrations/evals no longer fight the 300s scenario timeout.

**Make.com → agent (invoke): edge webhook shim, not raw JSON-RPC.** Hand-rolling the JSON-RPC envelope in Make.com's HTTP module works (~3 modules: build envelope, POST with bearer header, parse nested response) but delivers none of A2A's benefits — no streaming, no cards, no SDK — at full envelope cost. Instead, `a2a-common` ships an **edge shim**:

```
POST /hooks/{agent}/{skill}            ← flat JSON, bearer-gated, one Make.com HTTP module
  { ...skillPayload, "callbackUrl": "https://hook.make.com/xyz" }   → 202 { taskId }
```

The shim validates against the contract schema, wraps into A2A `message/send` with `pushNotificationConfig.url = callbackUrl`, and returns the task id. Same shim serves curl, cron, and Claude Code skills.

```
Make.com scenario A: [trigger] → HTTP POST /hooks/migration/migration.run (callbackUrl = hook B) → end
Make.com scenario B: [custom webhook B] → task result JSON → next action
```

**Principle: A2A is the internal mesh protocol; the edge speaks flat webhooks/REST through one adapter.** Agents and the orchestrator talk full A2A to each other (cards, streaming, contexts); external callers get the simplest possible surface. (For the talk: demo one raw JSON-RPC call from Make.com as a curiosity, run production flows through the shim.)

### Platform-wide note: Make.com as a multi-model backend

Make.com appears in this platform in **two distinct roles** — don't conflate them:

1. **Edge caller** (above): Make.com *invokes* an agent via the shim and receives the result via a webhook. This is Make.com driving the mesh from outside.
2. **Backend behind an Agent Card**: the content-gen and migration agents each expose a `backend: "sdk" | "makecom"` switch (Parts 4–5). When `makecom` is selected, the agent facade delegates the work to a Make.com scenario, then completes the same A2A task with the same artifact.

Role 2 is where the **Agent Card abstraction pays off**: a single card hides whichever runtime executes the task. Critically, a Make.com backend can itself **orchestrate multiple models/agents** inside its scenario — e.g. routing across Claude and the **Kimi K2.6** Chinese model, or running a multi-agent ensemble — and **none of that leaks through the A2A contract**. Callers see one skill, one task, one artifact; the model mix is a backend implementation detail. This holds for any current or future Make.com backend in the mesh.

## Public Exposure

Compose services bind to an internal network. One reverse-proxy (Caddy, already-ish present on the VM) exposes:
- `POST /a2a/{agent}` routes → internal agents (bearer-gated) — needed for Make.com as a *caller*
- Nothing else; UI talks to Supabase directly and to agents via its own server-side routes

## Risks Specific to This Layer

| Risk | Mitigation |
|---|---|
| JS SDK maturity gaps (task-store interface churn, v1.0 spec drift) | Pin SDK version; isolate all SDK touchpoints in `a2a-common` so churn is one-package surgery |
| Over-investing in protocol plumbing before the demo | Time-box: if the Supabase task-store adapter fights the SDK > 2 days, ship SDK in-memory store + our own Supabase mirror writes, converge later |
| Webhook delivery to Make.com flaking | Retry in push sender; task state in Supabase remains queryable as fallback (Make.com can poll `tasks/get`) |
