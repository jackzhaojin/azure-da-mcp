# Pipeline Scripts — Full CLI Reference

All scripts live in `scripts/` and use Node.js builtins only (zero npm dependencies).

## scripts/auto-discover.mjs

Scan a project to detect features and generate a Playwright demo spec.

```bash
node scripts/auto-discover.mjs <project-dir> [options]

Options:
  --output, -o <path>      Output spec file (default: <project>/demo/auto-demo.spec.ts)
  --inventory <path>       Feature inventory JSON output
  --focus <feature>        Guided mode: focus on specific feature
  --project-name <name>    Override project name
  --base-url <url>         Dev server URL (default: http://localhost:5173)
  --dry-run                Print without writing files
  --inventory-only         Only output feature inventory
  --helpers-dir <path>     Directory containing helpers.ts
```

**Discovery pipeline:**
1. Read `package.json` to detect framework (React, Next.js, Vue, Angular, Svelte) and build tool
2. Scan for `<Route>` definitions, navItems configs, and file-based routes
3. Grep `data-testid` attributes and `testId` props across all components
4. Detect dynamic test ID patterns (template literals like `` data-testid={`nav-${var}`} ``)
5. Categorize features by demo impact: charts > tables > kanban > dark mode > forms > navigation > responsive > settings
6. Generate a Playwright spec with caption calls compatible with the extract-captions pipeline

**Output:** Feature inventory JSON + Playwright spec file ready for recording.

## scripts/extract-captions.mjs

Parse spec file or recording log, output JSON manifest with captions and timestamps.

```bash
# Recommended: use real timestamps from recording log
node scripts/extract-captions.mjs <spec-file> --from-log recording.log [options]

# Fallback: heuristic estimation from spec code
node scripts/extract-captions.mjs <spec-file> [options]

Options:
  --output, -o <path>      Output JSON manifest path (default: captions.json)
  --from-log <path>        Parse real timestamps from Playwright test output
  --show-fn <name>         Custom showCaption function name
  --caption-fn <name>      Custom caption function name
  --hide-fn <name>         Custom hideCaption function name
  --dry-run                Print manifest to stdout
```

**Two modes:**

| Mode | Flag | Accuracy | When to use |
|------|------|----------|-------------|
| From-log | `--from-log <file>` | Exact | Spec uses `startTimestampRecording()`. Pipeline captures test output. |
| Heuristic | (default) | +/-1-8s | Legacy specs without `startTimestampRecording()`. Drift worsens with demo length. |

**From-log mode** parses `__CAPTION_TS__` markers emitted by `caption-overlay.ts`:
```
__CAPTION_TS__:init:1.0
__CAPTION_TS__:show:17.32:"Authentication is handled by Keycloak"
__CAPTION_TS__:caption:8.15:6000:"Built with Next.js and Spring Boot"
```

**Heuristic mode** uses line-by-line sequential timing estimation. See [RESEARCH.md](RESEARCH.md) for algorithm details. Known limitation: operations like `page.goto()`, `waitForLoadState()`, network calls, and `expect()` assertions have variable real-world duration that causes cumulative drift.

**Output format:**
```json
[
  { "id": 1, "text": "Welcome to the dashboard.", "startSec": 1.4, "type": "caption", "durationMs": 5000 },
  { "id": 2, "text": "Interactive stat cards.", "startSec": 5.5, "type": "showCaption" }
]
```

The manifest is user-editable before TTS generation -- the safety valve for timestamp corrections.

## scripts/generate-voice.mjs

Per-caption ElevenLabs TTS with caching and voice continuity.

```bash
node scripts/generate-voice.mjs <manifest.json> [options]

Options:
  --output-dir, -d <dir>   Audio output directory (default: ./audio)
  --voice-id <id>          ElevenLabs voice ID (default: Matilda)
  --model <id>             ElevenLabs model (default: eleven_turbo_v2_5)
  --api-key <key>          API key (overrides ELEVENLABS_API_KEY env)
  --dry-run                Print plan without API calls
  --force                  Regenerate all, ignore cache
```

Features:
- **Caching:** Skips generation if `caption_NN.mp3` exists and non-empty
- **Voice continuity:** Sends `previous_text`/`next_text` with every API call
- **Retry:** 3 attempts with exponential backoff (1s, 2s, 4s)
- **Cost estimate:** Prints total character count and credit estimate before starting

## scripts/merge-video.mjs

Freeze-frame merge algorithm (generalized from merge-highlights-v2.mjs).

```bash
node scripts/merge-video.mjs --video <video> --manifest <manifest.json> --audio-dir <dir> [options]

Options:
  --output, -o <path>      Output video path (default: demo-with-voice.mp4)
  --audio-shift <sec>      Voice before visual caption (default: -0.5)
  --min-gap <sec>          Min silence between clips (default: 0.3)
  --crf <n>                Video quality (default: 20)
  --dry-run                Print ffmpeg command only
```

**Golden Rules:**
1. Audio clips NEVER overlap
2. Audio starts 500ms before visual caption (`AUDIO_SHIFT = -0.5`)
3. Minimum 300ms silence gap between clips (`MIN_GAP = 0.3`)
4. Freeze frames via ffmpeg `trim` + `tpad=stop_mode=clone` + `concat`

## scripts/add-music.mjs

Background music overlay.

```bash
node scripts/add-music.mjs --video <voiced.mp4> --music <music.mp3> [options]

Options:
  --output, -o <path>      Output path (default: demo-final.mp4)
  --volume <0-1>           Music volume (default: 0.15 = 15%)
  --fade-out <sec>         Fade music before end (default: 3s)
  --no-loop                Do not loop music
  --dry-run                Print command only
```

Music at 15% volume, looped if shorter than video, `-c:v copy` for fast processing.
Music source: [Pixabay Music](https://pixabay.com/music/) (CC0, no attribution required).

## scripts/run-pipeline.mjs

Orchestrator that chains all steps with pre-flight checks. Supports `--record` mode for single-command workflow.

```bash
# Recommended: record + process in one command
node scripts/run-pipeline.mjs --record --spec <spec.ts> [options]

# Alternative: provide pre-recorded video
node scripts/run-pipeline.mjs --spec <spec.ts> --video <video.webm> [options]

Options:
  --spec, -s <path>        Playwright spec with caption calls
  --video, -v <path>       Recorded video file
  --record                 Run Playwright test, capture output for timestamps
  --playwright-config <p>  Playwright config (default: playwright.video.config.ts)
  --grep <pattern>         Playwright grep pattern (default: @demo)
  --project-dir <path>     Project dir for Playwright (default: cwd)
  --music <path>           Background music (optional)
  --output-dir, -d <dir>   Working directory (default: ./demo-output)
  --output, -o <path>      Final output path
  --skip-voice             Use existing audio files
  --skip-music             Skip music overlay
  --dry-run                Print plan without executing
  (+ all options from individual scripts)
```

**`--record` mode:**
1. Runs `npx playwright test --config=<config> --grep <pattern>` in the project dir
2. Captures stdout to `<output-dir>/recording.log`
3. Auto-finds the video file in `test-results/` (most recent .webm)
4. Detects `__CAPTION_TS__` markers in the log for exact timestamps
5. Falls back to heuristic extraction if no markers found

**WARNING:** `--grep` defaults to `@demo` and runs ALL matching specs. If multiple specs have `@demo`, ALL run and their markers/videos mix. Use a specific grep pattern (e.g., `--grep "My Specific Test Name"`) when multiple demo specs exist. See [troubleshooting.md](troubleshooting.md).

Pre-flight checks: ffmpeg, ffprobe, Node.js version, ElevenLabs API key, Playwright (if `--record`).

## Timestamp Estimation Constants

Used by extract-captions.mjs heuristic mode (fallback when `startTimestampRecording()` markers are absent).

| Function | Duration |
|----------|----------|
| `waitForTimeout(N)` | N/1000 s |
| `pause(page, N)` | N/1000 s |
| `scenicPause(page, N)` | N/1000 s (default 1800ms) |
| `quickPause(page, N)` | N/1000 s (default 600ms) |
| `smoothScroll(...)` | 0.8 s |
| `scrollToLocator(...)` | 0.8 s |
| `setViewport(...)` | 0.4 s |
| `dragAndDrop(..., {holdMs})` | holdMs*2 + 300 ms |
| `page.goto(...)` | 1.0 s (estimated) |
| `page.waitForLoadState(...)` | 0.5 s (estimated) |
| `page.click(...)` | 0.1 s |
| `page.hover(...)` | 0.1 s |
| `showCaption(...)` | +0.3 s (fade-in) |
| `hideCaption(...)` | +0.3 s (fade-out) |
| `caption(page, text, ms)` | 0.3 + ms/1000 + 0.3 s |

**Why regex (for fallback):** Caption texts are always string literals. The freeze-frame merge compensates for moderate drift. Zero dependencies.

**When to upgrade to AST:** If specs use variables for captions (e.g., `const msg = 'Hello'; showCaption(page, msg)`), add `@babel/parser`.

## Error Handling

### Pre-Flight (Fail Fast)

1. Verify ffmpeg/ffprobe installed
2. Verify ElevenLabs API key set (if voice requested)
3. Verify spec file and video file exist
4. Verify Node.js 18+ (native fetch required)

### Extraction (Degrade Gracefully)

1. Zero captions: warn, suggest `--show-fn`/`--caption-fn` overrides
2. Negative timestamps: clamp to 0
3. Non-monotonic: warn, offer linear interpolation
4. Multiline caption(): handled automatically by whitespace normalization

### Pipeline (Retry or Report)

1. ElevenLabs failure: retry 3x with exponential backoff (1s, 2s, 4s)
2. ffmpeg failure: capture stderr, suggest fixes
3. ffprobe failure: estimate duration from text length
