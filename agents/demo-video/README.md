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
  --output-dir ./$(date +%F)-content-factory-loop \
  --project-dir "$(pwd)"
```

Output: `<YYYY-MM-DD>-content-factory-loop/demo-final.mp4` (~2.2 min). The spec emits
`__CAPTION_TS__` markers (`startTimestampRecording()`), so voice timing is exact — no
drift. Each run is archived in its own dated `YYYY-MM-DD-slug/` directory (gitignored);
the last recorded loop demo is in `2026-06-11-content-factory-loop/`.

## Tour demo (coordinator + eval, no live trigger)

`demo/factory-tour.spec.ts` (`@factory-tour`) is a guided tour that narrates the
**retro coordinator flow** (dashboard / previous runs → a completed full-loop run
with branches + variance → a bulk batch) **and the new eval flow** (Direct eval +
the evidence panel). It does **not** trigger a live run — with the agentic eval
token enabled a full-loop's eval stage takes 1–2 min — so it navigates REAL
completed runs already in the store (resolved dynamically via `/api/runs`). Seed
one full-loop, one bulk batch, and one Direct eval first.

Run the coordinator in **production** mode for the recording (`NODE_ENV=production
npm run start -w coordinator`, SSO off): no dev-tools overlay, and it avoids the
Next dev hot-reload chunk corruption that 500s `/runs/[id]` after a component edit.

```bash
cd agents/demo-video && set -a; source ../.env; set +a
SK=../../.claude/skills/playwright-demo-video/scripts
OUT=$(date +%F)-factory-tour; mkdir -p "$OUT"   # dated archive dir (gitignored)
# 1) record (captures __CAPTION_TS__ markers → exact timestamps)
npx playwright test --config=playwright.video.config.ts --grep "@factory-tour" \
  2>&1 | tee "$OUT/recording.log"
# 2) exact captions from the log (heuristic mode drops the ${score} caption + drifts)
node $SK/extract-captions.mjs demo/factory-tour.spec.ts \
  --from-log "$OUT/recording.log" --output "$OUT/captions.json"
# 3) voice + 4) merge
node $SK/generate-voice.mjs "$OUT/captions.json" \
  --output-dir "$OUT/audio" --env-file ../.env
node $SK/merge-video.mjs --video test-results/*factory-tour*/video.webm \
  --manifest "$OUT/captions.json" --audio-dir "$OUT/audio" \
  --output "$OUT/factory-tour-final.mp4"
```

Output: `<YYYY-MM-DD>-factory-tour/factory-tour-final.mp4` (~2.2 min). Use `--from-log`
for exact sync — `run-pipeline.mjs --video` (without `--record`) falls back to heuristic
timing, which both drifts and fails to parse captions containing `${…}`. The last
recorded tour is in `2026-06-14-factory-tour/`.

## Notes

- `DEMO_BACKEND=opencode` fires a **real** Kimi K2.6 migration that keeps running
  ~10 min after the recording ends and authors a real da.live page. `dryrun`
  (default) is for iterating on scenes without burning a Kimi turn.
- The dryrun run completes in ~7s, which is why the spec clicks "Watch live"
  immediately after triggering and narrates from the run-detail page.
- `/api/runs` returns slim stats; `branchResults` (and the migrated-page `target`
  URL for the payoff scene) only exist on `/api/runs/:id`.
