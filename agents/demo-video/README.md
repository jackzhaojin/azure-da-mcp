# demo-video — narrated demo recordings of the coordinator dashboard

Generates a voiceover MP4 of the **real local closed loop** (generate → Kimi K2.6
migrate → evaluate) using the [playwright-demo-video skill](../../.claude/skills/playwright-demo-video/).
No mocks: the recording triggers a real `coordinate.run` against the live mesh and
ends on the actual migrated page on Adobe Edge Delivery.

Not an npm workspace — it has its own `node_modules` on purpose (the agents
workspaces don't carry `@playwright/test`).

## One-time setup

```bash
cd agents/demo-video
npm install
npx playwright install chromium
```

`ELEVENLABS_API_KEY` must be set (it lives in `agents/.env`, see `.env.example`).

## Record + narrate (one command)

The mesh must be running locally (ports 4001–4004) and the store must contain at
least one **completed** opencode run with branch results — the results scene opens
the freshest one. The coordinator must run with SSO off (unset `AUTH_GOOGLE_ID`
etc.) so Playwright can reach the dashboard.

```bash
cd agents/demo-video
set -a; source ../.env; set +a
export DEMO_BACKEND=opencode   # the final take; omit for cheap dryrun iteration
node ../../.claude/skills/playwright-demo-video/scripts/run-pipeline.mjs \
  --record \
  --spec demo/loop-demo.spec.ts \
  --grep "@loop-demo" \
  --music <path-to-background.mp3> \
  --output-dir ./demo-output \
  --project-dir "$(pwd)"
```

Output: `demo-output/demo-final.mp4` (~2.2 min). The spec emits `__CAPTION_TS__`
markers (`startTimestampRecording()`), so voice timing is exact — no drift.

## Notes

- `DEMO_BACKEND=opencode` fires a **real** Kimi K2.6 migration that keeps running
  ~10 min after the recording ends and authors a real da.live page. `dryrun`
  (default) is for iterating on scenes without burning a Kimi turn.
- The dryrun run completes in ~7s, which is why the spec clicks "Watch live"
  immediately after triggering and narrates from the run-detail page.
- `/api/runs` returns slim stats; `branchResults` (and the migrated-page `target`
  URL for the payoff scene) only exist on `/api/runs/:id`.
