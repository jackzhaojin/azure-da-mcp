# POC — Cloudflare Containers vs. long-running SSE

**Question** (A2A platform M2 spike, see `ai-docs/2026-06-05-a2a-agent-platform/`):
does an **open SSE stream** keep a Cloudflare Container alive past its `sleepAfter`
timeout, or does the Durable Object's sleep alarm kill in-flight streams
([cloudflare/containers #147](https://github.com/cloudflare/containers/issues/147),
[#162](https://github.com/cloudflare/containers/issues/162))?

## Design

`sleepAfter` is pinned to **2 minutes** on purpose — that compresses the experiment:

- stream survives 10 min with `sleepAfter=2m` → in-flight streams block sleep, long SSE is safe
- stream dies at ~2 min → #162 reproduced; we must set `sleepAfter ≥ max task duration`
  and/or call `renewActivityTimeout()` during long tasks (the PRD's planned mitigation)

## Pieces

| Path | What |
|---|---|
| `container/server.js` | Node SSE server: `/sse` ticks every 5s, logs every connection open/close + duration; `/stats` self-reports history + `bootId` (new bootId = container slept & restarted) |
| `container/Dockerfile` | node:22-alpine, nothing else |
| `src/index.ts` | Worker + `SseTestContainer` (Container DO, `sleepAfter="2m"`); serves the test page at `/` (no container contact), proxies `/sse` `/stats` `/health`, exposes `/renew` → `renewActivityTimeout()` |
| `src/page.html` | Browser test page: EventSource client, wall-clock vs container-clock, tick count, bootId-change detection, drop/reconnect counter, optional renew-every-60s mitigation mode |

## Run it

```bash
# Node >= 22 for wrangler 4.x (monorepo default is 20 — don't change the nvm default)
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"
npm install
npx wrangler deploy        # needs Docker running locally (builds + pushes the image)
```

Then open `https://cf-long-sse-poc.<account>.workers.dev/?auto=1` and leave it for 10+ minutes.
`?auto=1` connects immediately. The page deliberately makes **no other requests** during the
test (stats fetch is manual) so the SSE stream is the only activity signal.

Parallel measurement without a browser:

```bash
curl -sS -N https://cf-long-sse-poc.<account>.workers.dev/sse   # does NOT auto-reconnect → exit marks the kill
npx wrangler tail cf-long-sse-poc --format json                 # onStart/onStop events
```

## Results — 2026-06-07

Deployed as `cf-long-sse-poc` (lite instance, `sleepAfter="2m"`). Container cold start
on first request: **~7s** (image already pushed; includes pull + boot).

**Finding 1 — open SSE streams block container sleep.** With `sleepAfter=2m` and zero
other activity, streams sailed past the 2-minute alarm window without a hiccup. The
#162 failure mode (alarm killing in-flight streams) did **not** reproduce on wrangler
4.98 / @cloudflare/containers 0.3.7.

**Finding 2 — 10-minute SSE works.** Browser EventSource: 10m05s wall, 120/120 ticks
received, 0 drops, same `bootId` end-to-end. Parallel curl stream identical.

**Finding 3 — limit test: no platform-side kill observed at all.** Three parallel
streams (browser EventSource + 2 curls) ran 15–22 minutes with zero server-side drops;
every stream ended client-side (curl `-m` cap or us closing the tab). Browser final:
**21m59s, 263/263 ticks, 0 drops, one bootId**. Nothing on the path (DO alarm, edge,
Firecracker host) recycled the connection.

**Finding 4 — sleep fires exactly on schedule once streams close.** All connections
closed 04:40:45Z → `onStop` 04:42:40.982Z = **1m56s later** (`sleepAfter=2m` honored
to the second — but only counted from stream end, never during).

**Finding 5 — wake from sleep ≈ 5.1s** (vs ~7s first-ever boot): `/health` after sleep
returned a **new `bootId`** in 5.06s TTFB. And `/stats` on the fresh process showed
`history: []` — **all in-memory state gone**. Empirical proof of the PRD's
sleep-tolerance rule: the store (D1), not process memory, must own task state.

### Timeline (UTC, 2026-06-07)

| Time | Event |
|---|---|
| 04:17:20 | first request; cold boot ~7s → `bootId 7vv8g93a` |
| 04:18:18 / 04:18:25 / 04:23 | conn 1 (curl), conn 2 (browser), conn 3 (curl-12h) open |
| 04:20:25 | `sleepAfter=2m` alarm window passes — **nothing dies** |
| 04:28:18 | conn 1 crosses 10 min (120/120 ticks) — M2 headline answered |
| 04:33:17 | conn 1 ends at its own 15-min curl cap (client-side) |
| 04:40:45 | we close conn 2 (21m59s, 263 ticks, 0 drops) + conn 3 |
| 04:42:41 | `onStop` — container sleeps 1m56s after last stream closed |
| 04:42:52 | wake probe: 5.06s TTFB, new `bootId 5ull2rf6`, `history: []` |

### Implications for the A2A platform (PRD part-3/part-6)

1. **10-min SSE through Containers: confirmed safe.** The #147/#162 risk did not
   reproduce on wrangler 4.98 / @cloudflare/containers 0.3.7 — open streams block sleep.
2. Keep the keep-alive comments + push-notification fallback anyway (issues are real,
   reported on other versions; belt-and-suspenders costs nothing).
3. `sleepAfter` can stay short (cost win) — it only counts from idle, not stream start.
4. ~5s wake latency is the price of scale-to-zero; fine for our demo cadence.
5. Sleep-tolerance rule validated: anything not in D1/R2 is gone after 2 idle minutes.

## Cleanup

```bash
npx wrangler delete        # removes Worker + container app
```
