---
name: playwright-demo-video
description: |
  Generate polished demo videos (MP4) from Playwright specs with AI voiceover, captions, and music.
  Use when the user says "demo video", "playwright demo", "generate demo", "caption extraction",
  "voiceover pipeline", "freeze frame merge", or "auto-discover demo" — or wants to: create demo
  videos for web projects, extract captions from Playwright specs, generate TTS voiceover with
  ElevenLabs, merge video with freeze-frame timing, add background music, or auto-discover project
  features to generate demo specs.
---

# Playwright Demo Video Skill

Generate end-to-end demo videos (MP4) from Playwright specs with on-screen captions, AI voiceover (ElevenLabs), freeze-frame timing, and background music.

## When to Use

- User says "create a demo video", "generate a demo", "playwright demo"
- User wants to convert a Playwright spec into a narrated video
- User wants to add voiceover to an existing video recording
- User wants to auto-discover project features and generate a demo spec
- User wants to extract captions from a Playwright test file

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| ffmpeg + ffprobe | Video/audio processing | `brew install ffmpeg` |
| Node.js 18+ | Pipeline scripts (native fetch) | Required for Playwright |
| Playwright | Video recording | In target project |
| ElevenLabs API key | TTS voice generation | `ELEVENLABS_API_KEY` in `.env` |

## Quick Start

One command records the spec, captures exact timestamps, generates voiceover, and merges the final MP4:

```bash
node scripts/run-pipeline.mjs \
  --record \
  --spec path/to/demo.spec.ts \
  --grep "Exact Test Title Here" \
  --music path/to/background.mp3 \
  --output-dir ./demo-output \
  --project-dir /path/to/web-project
```

Two non-negotiables before running it:
1. The spec calls `startTimestampRecording()` as its first line (exact video-audio sync)
2. `--grep` matches exactly ONE test (see Multiple `@demo` Specs below)

## Data-First Approach (MANDATORY)

**You cannot narrate what doesn't exist.** Before writing any demo script or narration, you MUST verify that the application has real data to show. A demo that says "here are our recipes" while the screen shows "No items found" is a failed demo.

### Stage 0: Data Setup & Discovery

This stage runs BEFORE any recording or script writing. Full copy-paste specs for each step are in [references/verification.md](references/verification.md).

**Step 1: Verify or create data.** Run a data-check spec that visits the main pages, scans body text for empty-state indicators ("No items", "Create your first", ...), and counts visible content elements (cards, articles, list items).

If the app shows empty states:
1. Find and run the seed script (`npm run seed`, `npx prisma db seed`, `npx tsx lib/db/seed.ts`, etc.)
2. If no seed script exists, create minimal seed data via the app's API or direct DB inserts
3. Re-run the data check to confirm content now appears
4. **Do NOT proceed to script writing until content is verified**

**Step 2: Explore what Playwright can see.** Run an exploration spec that visits every route, checks for error states, catalogs interactive elements (buttons, links, forms, images, cards), and screenshots each page. **Use the exploration output to write the demo script.** Only narrate features the exploration confirmed exist — if a route shows 0 cards, don't write narration about "browsing our collection."

**Step 3: Build the demo script incrementally.** Do NOT write the entire demo spec at once. Write scene 1, record it, verify the output shows real content; then add scene 2 and verify both; continue until complete.

```typescript
test('demo scene 1 - landing page @demo', async ({ page }) => {
  startTimestampRecording();  // REQUIRED first line
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // ASSERT content is visible BEFORE writing any caption about it
  await expect(page.locator('h1, [data-testid="hero"]').first())
    .toBeVisible({ timeout: 10000 });

  // Only NOW describe what's actually on screen
  caption(page, 'Welcome to Recipe Discovery', 3000);
});
```

**Rule: Assert, then narrate.** Every caption must be preceded by an assertion that the content it describes is actually visible. The narration is a description of what IS on screen, not what SHOULD be on screen.

### Demo Script Writing Rules

1. **Always call `startTimestampRecording()` as the first line of the test.** This is the single most important step for reliable video-audio sync. Without it, the pipeline uses heuristic timestamp estimation that drifts on demos >60s.
2. **Never assume data exists.** Always assert before narrating.
3. **Never use `.catch(() => {})`.** If an interaction fails, the demo should fail. For genuinely optional elements (cookie banners), use an explicit `isVisible()` conditional — see [references/verification.md](references/verification.md).
4. **Match narration to visuals exactly.** If the page shows 3 recipes, say "3 recipes" not "our collection of recipes."
5. **Test each scene in isolation first.** Don't chain 10 scenes together and hope they all work.
6. **Use specific, observable descriptions.** Instead of "powerful search capabilities," say "searching for pasta dishes" while the search box shows "pasta" and results are filtered.
7. **Size caption hold times to text length.** The voiceover takes longer than you think:
   ```
   holdMs = max(textLength * 80, 3000)
   ```
   Example: a 72-char caption → `caption(page, text, 5760)` not `caption(page, text, 3000)`. Short captions (< 40 chars) can use 3000ms.
8. **Add a closing pause.** The last scene must include `await page.waitForTimeout(5000)` AFTER the final caption so the voiceover finishes before the Playwright recording ends. The merge script adds a tail freeze for safety, but the spec should still provide enough buffer.

## Visual Verification (MANDATORY)

Demo videos are worthless if the screen shows errors while the narration describes features. Every demo recording MUST pass verification at three stages — skipping these is not acceptable; a demo of an error page is worse than no demo at all. Full code for each stage is in [references/verification.md](references/verification.md).

| Stage | What | How |
|-------|------|-----|
| 1. Pre-recording health check | App responds, every demo route renders without errors | `curl` returns 200; navigate each route, screenshot it, assert no "Runtime Error" / "Application error" / Next.js error overlay. If any route errors, **fix the app first** — do not record. |
| 2. During-recording assertions | Spec fails loudly if content is missing | Error-text assertions after every `page.goto()`; visibility assertion before every caption; no `.catch(() => {})` on demo-critical interactions |
| 3. Post-recording validation | Output video is not blank or corrupted | Extract frames at 25/50/75% via ffmpeg, check pixel variance and bitrate. If validation fails, **do not deliver the video** — report with the extracted frames. |

Auto-discover-generated specs must additionally include navigation assertions, content visibility waits, a pre-flight test block, and no try/catch suppression — see [references/verification.md](references/verification.md).

## Common Failure Modes

Known issues that cause demos to record error pages or blank screens:

| Failure Mode | Symptom in Video | Root Cause | Fix |
|-------------|-----------------|------------|-----|
| Database not running | White screen or "connection refused" error overlay | PostgreSQL/MySQL/SQLite not started or not migrated | Start DB service, run `npx prisma migrate dev` or equivalent seed script |
| Unconfigured image domains | "Unhandled Runtime Error" overlay mentioning `next/image` | `next.config.js` missing remote image hostnames in `images.remotePatterns` | Add the domain to `next.config.js` `images.remotePatterns` or `images.domains` |
| Auth required but no test user | Stuck on login page for entire video, narration describes dashboard | App requires authentication but no test user was seeded | Seed a test user, or configure the demo to log in first |
| Missing environment variables | Server crashes on startup, blank page in browser | `.env` or `.env.local` missing required values (`DATABASE_URL`, API keys, etc.) | Copy `.env.example` to `.env.local`, fill in required values |
| Port already in use | Dev server fails to start, Playwright times out | Another process occupying port 3000/5173 | Kill the existing process or configure a different port |
| Missing dependencies | Module not found errors in browser | `npm install` not run after cloning or after changing branches | Run `npm install` in the project directory |
| Stale build cache | Hydration errors or old UI rendering | `.next/` or `dist/` cache from a different branch or config | Delete `.next/` (or `dist/`) and restart the dev server |
| No data seeded | App loads but shows "No items found" or empty lists for the entire demo | Database is running but has no seed data | Run the seed script (`npx prisma db seed`, `npm run seed`, etc.) |
| Voiceover cut off | Narration abruptly stops mid-sentence near the end of the video | Playwright recording ends before voiceover finishes; `caption()` hold times too short for text length | Use `holdMs = max(textLength * 80, 3000)` for caption timing; add 5s `waitForTimeout` after the final caption |
| **Video freezes, audio continues** | Video shows the same frame for the last 30-50% while voiceover keeps narrating different content | **Multiple `@demo` specs ran during `--record`**, mixing their `__CAPTION_TS__` markers into one log | Use `--grep "Exact Test Name"` to run only one spec — see below and [references/troubleshooting.md](references/troubleshooting.md) |
| Wrong video for captions | Video shows content from a different demo while narration describes the intended demo | `findRecordedVideo()` picks the most recently modified `.webm` — the LAST test's video when multiple tests run | Pass `--video <path>` explicitly: `test-results/<test-folder>/video.webm` |

When any of these are detected during the pre-recording health check, fix the underlying issue before proceeding. **Never record a demo of a broken application.**

## Critical: Multiple `@demo` Specs

**The `--spec` flag does NOT filter which Playwright tests run.** It only controls caption extraction. The `--grep` flag (default: `@demo`) controls test execution. If multiple spec files contain `@demo` in their test name, ALL of them run during `--record` — markers from every test mix into one log, `captions.json` gets entries from all of them, and the auto-found video is the LAST test's, not yours.

**Prevention:** always pass a grep pattern that matches exactly one test:

```bash
# BAD: matches ALL @demo specs
node run-pipeline.mjs --record --spec demo/auth-demo.spec.ts --grep @demo

# GOOD: matches only the specific test by title
node run-pipeline.mjs --record --spec demo/auth-demo.spec.ts \
  --grep "Five Authentication Strategies"

# GOOD: use a unique tag per spec (@auth-demo vs @exec-demo)
node run-pipeline.mjs --record --spec demo/auth-demo.spec.ts \
  --grep @auth-demo
```

**Recovery after a bad recording** (find the per-test video, trim `captions.json`, re-merge with `--skip-voice` — no ElevenLabs credits needed): see [references/troubleshooting.md](references/troubleshooting.md).

## Two Modes

### Mode 1: Guided (User Provides Spec)

User has a Playwright spec with `showCaption()`/`caption()` calls.

**Steps:**

1. Copy templates into the target project:
   - `templates/caption-overlay.ts` -- caption CSS + functions + timestamp recording
   - `templates/demo-helpers.ts` -- pause/scroll/viewport/dragAndDrop helpers
   - `templates/playwright.video.config.ts` -- video recording config
2. **IMPORTANT:** Ensure the spec calls `startTimestampRecording()` as the first line of the test:
   ```typescript
   import { startTimestampRecording, showCaption, caption, hideCaption } from './caption-overlay';

   test('My Demo @demo', async ({ page }) => {
     startTimestampRecording();  // <-- REQUIRED for exact timestamps
     await page.goto('/');
     // ... rest of demo
   });
   ```
3. **Recommended (one command):** Run the pipeline with `--record` (see Quick Start above). This runs Playwright, captures timestamp markers from stdout, auto-finds the video, and produces the final MP4 with exact audio-video sync.
4. **Alternative (separate steps):** Record manually, then run pipeline:
   ```bash
   # Record and capture output
   npx playwright test --config=playwright.video.config.ts --grep @demo 2>&1 | tee demo-output/recording.log
   # Run pipeline with captured log
   node scripts/run-pipeline.mjs \
     --spec path/to/demo.spec.ts \
     --video path/to/recording.webm \
     --music path/to/background.mp3 \
     --output-dir ./demo-output
   ```
   If `recording.log` exists in the output dir, extract-captions will auto-detect `__CAPTION_TS__` markers.

### Mode 2: Auto-Discover (Generate Spec from Project)

Scan a project's source code and generate a demo spec automatically.
See [references/auto-discover.md](references/auto-discover.md) for detailed patterns.

**Steps:**

1. Run auto-discover to generate spec and feature inventory:
   ```bash
   node scripts/auto-discover.mjs <project-dir> [--focus <feature>] [--dry-run]
   ```
   (Full options in [references/scripts-reference.md](references/scripts-reference.md).)
2. Review the generated spec -- adjust captions and timing as needed
3. Copy templates into the target project (helpers.ts, caption-overlay.ts, playwright.video.config.ts)
4. Record the video: `npx playwright test --config=playwright.video.config.ts --grep @auto-demo`
5. Run the pipeline on generated spec + recorded video

**What auto-discover detects:**

| Feature | Detection Method | Demo Section |
|---------|-----------------|--------------|
| Framework | package.json dependencies | Tech stack label |
| Routes | React Router `<Route>`, Next.js pages/app, nav configs | Page navigation |
| Stat cards | `testId` prop, `data-testid="stat-*"` | Hover interaction |
| Charts | Recharts/Chart.js/D3 imports + chart test IDs | Scroll + tooltip hover |
| Data tables | `data-testid="*-table"`, sort indicators | Sort column headers |
| Kanban board | `kanban-*` test IDs, draggable attributes | Drag-and-drop cards |
| Dark mode | `theme-toggle` test ID, appearance settings | Toggle + navigate |
| Forms | `*-form`, `*-input`, `invite-*` test IDs | Show section |
| Responsive | Tailwind CSS detected | Mobile/tablet/desktop |
| Settings | Profile, notification, accent color test IDs | Navigate + interact |

**Guided mode:** Pass `--focus <feature>` to generate a spec focused on a single feature (e.g., `--focus kanban`, `--focus "dark mode"`, `--focus charts`). The focus string matches against feature category, label, and description. If no match is found, falls back to full discovery with a warning.

## Pipeline Architecture

```
Project source code
  |  auto-discover       Scan framework, routes, features, test IDs
  v                      Generate Playwright spec with captions
Playwright spec (*.spec.ts)
  |  record (optional)   Run Playwright test, capture __CAPTION_TS__ markers
  v                      from startTimestampRecording() -> recording.log
  |  extract-captions    Parse markers for exact timestamps (preferred)
  v                      OR estimate from code heuristic (fallback)
  |  generate-voice      Per-caption ElevenLabs API -> caption_NN.mp3 (cached)
  v
  |  merge-video         Video + audio -> freeze-frame merge -> MP4
  v                      Zero audio overlaps guaranteed
  |  add-music           Voiced MP4 + music -> final MP4 (15% volume, looped)
  v
Final demo.mp4
```

### Timestamp Modes

| Mode | Accuracy | How It Works |
|------|----------|--------------|
| **Real timestamps** (recommended) | Exact | Spec calls `startTimestampRecording()`. Caption functions emit `__CAPTION_TS__` markers to stdout during recording. Pipeline parses these for precise video-aligned timestamps. |
| **Heuristic estimation** (fallback) | +/-1-8s on long demos | `extract-captions.mjs` parses the spec code and estimates timing from `page.goto()`, `waitForTimeout()`, etc. Non-deterministic operations (`waitForLoadState`, network calls) cause cumulative drift. |

**Always prefer real timestamps.** The heuristic mode exists as a fallback for specs that don't use `startTimestampRecording()`, but it will drift on demos longer than ~60s with many navigation/network operations.

## Pipeline Scripts

All scripts live in `scripts/` and use Node.js builtins only (zero npm dependencies). Full CLI options, timestamp estimation constants, and error-handling behavior are in [references/scripts-reference.md](references/scripts-reference.md).

| Script | Purpose | Key flags |
|--------|---------|-----------|
| `run-pipeline.mjs` | Orchestrator: record → extract → voice → merge → music, with pre-flight checks | `--record`, `--grep`, `--skip-voice`, `--skip-music`, `--dry-run` |
| `auto-discover.mjs` | Scan project, detect features, generate demo spec + inventory JSON | `--focus`, `--inventory-only`, `--dry-run` |
| `extract-captions.mjs` | Spec/log → JSON caption manifest with timestamps (user-editable before TTS) | `--from-log` (exact), default heuristic |
| `generate-voice.mjs` | Per-caption ElevenLabs TTS with caching, voice continuity, retry, cost estimate | `--voice-id`, `--dry-run`, `--force` |
| `merge-video.mjs` | Freeze-frame merge: audio never overlaps, 500ms audio lead, 300ms min gap | `--audio-shift`, `--min-gap` |
| `add-music.mjs` | Background music at 15% volume, looped, faded out | `--volume`, `--no-loop` |

## Templates

Copy these into your target project.

- **`templates/caption-overlay.ts`** — Caption CSS + `showCaption`/`hideCaption`/`caption` functions + `startTimestampRecording()`. When recording starts, each caption function emits `__CAPTION_TS__` markers to stdout that the pipeline parses for exact video-audio sync. extract-captions.mjs parses these function calls, so the naming convention matters.
- **`templates/demo-helpers.ts`** — Demo pacing utilities: `pause`, `scenicPause`, `quickPause`, `smoothScroll`, `setViewport`, `naturalType`, `dragAndDrop`. Each has documented internal timing that extract-captions.mjs uses for timestamp estimation.
- **`templates/playwright.video.config.ts`** — Playwright config optimized for video recording: headless mode, 1280x800 viewport, generous timeouts, sequential execution, auto-start dev server.

## Reference Files

- **Verification specs (full code)**: [references/verification.md](references/verification.md) -- data-check, route exploration, pre-flight, during-recording assertions, post-recording frame validation
- **Scripts CLI reference**: [references/scripts-reference.md](references/scripts-reference.md) -- all options per script, timestamp estimation constants, error handling
- **Troubleshooting**: [references/troubleshooting.md](references/troubleshooting.md) -- multiple `@demo` specs deep dive, recovery after bad recordings, `--skip-voice`, expanded failure checklist
- **Auto-discover patterns**: [references/auto-discover.md](references/auto-discover.md) -- framework detection, feature scanning, spec generation
- **Pipeline patterns**: [references/pipeline-patterns.md](references/pipeline-patterns.md) -- ffmpeg commands, ElevenLabs API, freeze-frame algorithm
- **Full research findings**: [references/RESEARCH.md](references/RESEARCH.md) -- AST vs regex analysis, prototype results, algorithm pseudocode

## Success Criteria

- Caption extraction matches all showCaption/caption calls in the spec
- With `startTimestampRecording()`: timestamps are exact (within ~1s absolute, 0 relative drift)
- Without: heuristic timestamps within +/-1s for short demos, may drift on long demos
- JSON manifest produced and editable
- Auto-discover identifies major features from project structure
- Pipeline produces working MP4 with synchronized voice and captions
- Audio clips never overlap in the final video

## On Failure

| Symptom | Action |
|---------|--------|
| Regex misses captions | Check function names; try `--show-fn`, `--caption-fn` overrides |
| Timestamps far off (heuristic mode) | Add `startTimestampRecording()` to spec and use `--record` mode — eliminates drift entirely |
| No `__CAPTION_TS__` markers in log | Ensure spec imports and calls `startTimestampRecording()` from the `caption-overlay.ts` template |
| Auto-discover finds nothing | Check data-testid attributes; fall back to guided mode |
| ffmpeg errors | Run `ffmpeg -version`; check input formats; try `--dry-run` |
| ElevenLabs errors | Check API key and credits; `--dry-run` to verify manifest first |
| Audio overlaps | Increase `--min-gap`; reduce caption density in spec |
| Video freezes / wrong video / too many captions | Multiple `@demo` specs ran — see [references/troubleshooting.md](references/troubleshooting.md) for recovery |
