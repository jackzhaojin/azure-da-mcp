# Troubleshooting — Failure Modes and Recovery

## Multiple `@demo` Specs: Deep Dive

**The `--spec` flag does NOT filter which Playwright tests run.** It only controls caption extraction. The `--grep` flag (default: `@demo`) controls test execution. If multiple spec files contain `@demo` in their test name, ALL of them run during `--record`.

### The Problem

When a project has multiple demo specs (e.g., `auth-demo.spec.ts`, `executive-demo.spec.ts`, `v121-demo.spec.ts`) all tagged `@demo`:

1. `--record` runs ALL of them sequentially via `--grep @demo`
2. ALL `__CAPTION_TS__` markers from ALL tests end up in `recording.log`
3. `captions.json` includes entries from ALL tests (e.g., 86 entries when only 52 belong to the target spec)
4. `findRecordedVideo()` picks the MOST RECENT video — likely the LAST test, not the intended one
5. The merge creates a mismatched video: wrong visuals + wrong audio timing

### Prevention: Use Specific `--grep` Patterns

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

### Recovery: Fix After a Bad Recording

If you already ran `--record` with `--grep @demo` and got mixed results:

1. **Find the correct per-test video:**
   ```bash
   ls test-results/   # Each test gets its own folder with video.webm
   # e.g., test-results/auth-strategies-demo-Five--xxxxx-video/video.webm
   ```

2. **Trim captions.json** to only the target spec's entries (check `recording.log` to see where one test ends and another begins — look for the `✓` pass line):
   ```bash
   node -e "
   const c = require('./demo-output/captions.json');
   const trimmed = c.filter(x => x.id <= 52); // adjust ID cutoff
   require('fs').writeFileSync('./demo-output/captions.json', JSON.stringify(trimmed, null, 2));
   "
   ```

3. **Re-merge with correct inputs** (no ElevenLabs credits needed):
   ```bash
   # Merge video + audio (using first 52 audio files)
   node scripts/merge-video.mjs \
     --video test-results/<correct-test>/video.webm \
     --manifest demo-output/captions.json \
     --audio-dir demo-output/audio \
     --output demo-output/demo-with-voice.mp4

   # Add music
   node scripts/add-music.mjs \
     --video demo-output/demo-with-voice.mp4 \
     --music path/to/music.mp3 \
     --output demo-output/demo-final.mp4
   ```

## `--skip-voice`: Reuse Existing Audio

When re-recording or re-merging, use `--skip-voice` to skip ElevenLabs TTS and reuse existing `caption_NN.mp3` files:

```bash
node run-pipeline.mjs --record --skip-voice \
  --spec demo/auth-demo.spec.ts \
  --grep "Five Authentication" \
  --music path/to/music.mp3 \
  --output-dir ./demo-output
```

This re-records the video, re-extracts captions (with new timestamps), and re-merges — but keeps the existing audio files. Useful when:
- You ran out of ElevenLabs credits
- The voiceover is good but the video timing needs adjustment
- You changed the spec's visual flow but not the narration text

## On Failure: Expanded Checklist

1. **Regex misses captions**: Check function names; try `--show-fn`, `--caption-fn` overrides
2. **Timestamps far off (heuristic mode)**: Add `startTimestampRecording()` to spec and use `--record` mode. This eliminates drift entirely.
3. **No `__CAPTION_TS__` markers in log**: Ensure spec imports and calls `startTimestampRecording()` from the updated `caption-overlay.ts` template. The pipeline falls back to heuristic if markers are missing.
4. **Auto-discover empty**: Check data-testid attributes; fall back to guided mode
5. **ffmpeg errors**: Run `ffmpeg -version`; check input file formats; try `--dry-run`
6. **ElevenLabs errors**: Check API key and credits; use `--dry-run` to verify manifest first
7. **Audio overlaps**: Increase `--min-gap`; reduce caption density in spec
8. **Video freezes while audio continues**: Multiple specs ran — see the deep dive above. Trim `captions.json`, use per-test video, re-merge with `--skip-voice`.
9. **Wrong video content for narration**: `findRecordedVideo()` picked the wrong test's video. Pass `--video <path>` explicitly or use the per-test video from `test-results/<test-folder>/video.webm`.
10. **Too many captions in manifest**: Recording captured markers from multiple specs. Check `recording.log` for the `✓` line marking where your spec ends. Trim `captions.json` to entries before that point.
