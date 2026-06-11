#!/usr/bin/env node
/**
 * extract-captions.mjs -- Parse Playwright spec file, output JSON manifest
 *
 * Two modes:
 *   1. Heuristic (default): Parse spec file, estimate timestamps from code
 *   2. From-log (recommended): Parse __CAPTION_TS__ markers from Playwright
 *      test output for exact timestamps. Use with startTimestampRecording().
 *
 * Zero npm dependencies -- uses Node.js builtins only.
 *
 * Usage:
 *   node extract-captions.mjs <spec-file> [options]
 *
 * Options:
 *   --output, -o <path>      Output JSON manifest path (default: captions.json in cwd)
 *   --from-log <path>        Parse real timestamps from Playwright test output log
 *                             (produced when spec calls startTimestampRecording())
 *   --show-fn <name>         Custom showCaption function name (default: showCaption)
 *   --caption-fn <name>      Custom caption function name (default: caption)
 *   --hide-fn <name>         Custom hideCaption function name (default: hideCaption)
 *   --dry-run                Print manifest to stdout, do not write file
 *
 * Output: JSON array of caption objects:
 *   [{ id, text, startSec, type, line, durationMs? }]
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node extract-captions.mjs <spec-file> [options]

Options:
  --output, -o <path>      Output JSON manifest path (default: captions.json)
  --from-log <path>        Parse real timestamps from Playwright test output
  --show-fn <name>         Custom showCaption function name (default: showCaption)
  --caption-fn <name>      Custom caption function name (default: caption)
  --hide-fn <name>         Custom hideCaption function name (default: hideCaption)
  --dry-run                Print manifest to stdout, do not write file`);
  process.exit(0);
}

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

const specFile = args.find((a) => !a.startsWith('-'));
const outputPath = getArg('--output', getArg('-o', 'captions.json'));
const fromLog = getArg('--from-log', null);
const showFn = getArg('--show-fn', 'showCaption');
const captionFn = getArg('--caption-fn', 'caption');
const hideFn = getArg('--hide-fn', 'hideCaption');
const dryRun = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// From-log mode: parse real timestamps from Playwright test output
// ---------------------------------------------------------------------------

/**
 * Parse __CAPTION_TS__ markers from a Playwright test output log.
 *
 * Expected marker formats (emitted by caption-overlay.ts):
 *   __CAPTION_TS__:init:<offsetSec>
 *   __CAPTION_TS__:show:<sec>:<json-text>
 *   __CAPTION_TS__:caption:<sec>:<durationMs>:<json-text>
 *
 * Returns a caption manifest array with exact timestamps.
 */
function parseTimestampLog(logContent) {
  const lines = logContent.split('\n');
  const captions = [];
  let captionId = 1;
  let hasInit = false;

  for (const line of lines) {
    if (!line.includes('__CAPTION_TS__')) continue;

    // Extract the marker portion (may be prefixed by Playwright output formatting)
    const markerIdx = line.indexOf('__CAPTION_TS__');
    const marker = line.substring(markerIdx);

    // Init marker
    const initMatch = marker.match(/^__CAPTION_TS__:init:(.+)$/);
    if (initMatch) {
      hasInit = true;
      continue;
    }

    // showCaption marker: __CAPTION_TS__:show:<sec>:<json-text>
    const showMatch = marker.match(/^__CAPTION_TS__:show:(\d+\.?\d*):(.+)$/);
    if (showMatch) {
      const startSec = parseFloat(showMatch[1]);
      let text;
      try {
        text = JSON.parse(showMatch[2]);
      } catch {
        text = showMatch[2];
      }
      captions.push({
        id: captionId++,
        text,
        startSec: Math.round(startSec * 10) / 10,
        type: 'showCaption',
      });
      continue;
    }

    // caption marker: __CAPTION_TS__:caption:<sec>:<durationMs>:<json-text>
    const captionMatch = marker.match(/^__CAPTION_TS__:caption:(\d+\.?\d*):(\d+):(.+)$/);
    if (captionMatch) {
      const startSec = parseFloat(captionMatch[1]);
      const durationMs = parseInt(captionMatch[2], 10);
      let text;
      try {
        text = JSON.parse(captionMatch[3]);
      } catch {
        text = captionMatch[3];
      }
      captions.push({
        id: captionId++,
        text,
        startSec: Math.round(startSec * 10) / 10,
        type: 'caption',
        durationMs,
      });
      continue;
    }
  }

  if (!hasInit) {
    console.warn('WARNING: No __CAPTION_TS__:init marker found in log.');
    console.warn('  Did the spec call startTimestampRecording()?');
    console.warn('  Timestamps may not be aligned to video start.');
  }

  return captions;
}

// ---------------------------------------------------------------------------
// Validate spec file (only needed for heuristic mode)
// ---------------------------------------------------------------------------

if (!fromLog) {
  if (!specFile || !fs.existsSync(specFile)) {
    console.error(`Error: Spec file not found: ${specFile}`);
    console.error('  Use --from-log <file> to extract from a recording log instead.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Timing constants (derived from helper function internals)
// ---------------------------------------------------------------------------

const TIMING = {
  showCaption: 0.3,           // 300ms fade-in
  hideCaption: 0.3,           // 300ms fade-out
  captionDefault: 3000,       // default caption hold ms
  smoothScroll: 0.8,          // 800ms internal wait
  setViewport: 0.4,           // 400ms React settle
  pageGoto: 1.0,              // estimated network + render
  waitForLoadState: 0.5,      // estimated settle
  pageClick: 0.1,             // near-instant
  pageHover: 0.1,             // near-instant
  mouseMove: 0.05,            // near-instant
  pauseDefault: undefined,    // no default -- ms always provided
  scenicPauseDefault: 1800,   // default 1800ms
  quickPauseDefault: 600,     // default 600ms
  naturalTypePerChar: 0.1,    // ~100ms per character average
  pageEvaluate: 0.1,          // estimated JS execution
  dragAndDropSettle: 300,     // 300ms settle after drop
};

// ---------------------------------------------------------------------------
// Build regex patterns (supports custom function names)
// ---------------------------------------------------------------------------

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const showFnEsc = escapeRegex(showFn);
const captionFnEsc = escapeRegex(captionFn);
const hideFnEsc = escapeRegex(hideFn);

// Caption extraction patterns
const showCaptionRx = new RegExp(`${showFnEsc}\\(\\s*page\\s*,\\s*['"](.+?)['"]\\s*\\)`, 'g');
const captionRx = new RegExp(`${captionFnEsc}\\(\\s*page\\s*,\\s*['"](.+?)['"](?:\\s*,\\s*(\\d+))?\\s*\\)`, 'gs');
const hideCaptionRx = new RegExp(`${hideFnEsc}\\(\\s*page\\s*\\)`, 'g');

// Timing extraction patterns
const waitForTimeoutRx = /waitForTimeout\(\s*(\d+)\s*\)/g;
const pauseRx = /\bpause\(\s*page\s*(?:,\s*(\d+))?\s*\)/g;
const scenicPauseRx = /scenicPause\(\s*page\s*(?:,\s*(\d+))?\s*\)/g;
const quickPauseRx = /quickPause\(\s*page\s*(?:,\s*(\d+))?\s*\)/g;
const smoothScrollRx = /smoothScroll\(\s*page/g;
const setViewportRx = /setViewport\(\s*page/g;
const gotoRx = /page\.goto\(/g;
const waitForLoadStateRx = /page\.waitForLoadState\(/g;
const clickRx = /page\.click\(/g;
const hoverRx = /page\.hover\(/g;
const mouseMoveRx = /page\.mouse\.move\(/g;
const evaluateRx = /page\.evaluate\(/g;
const dragAndDropRx = /dragAndDrop\(\s*page\s*,.*?(?:holdMs:\s*(\d+))?/g;
const naturalTypeRx = /naturalType\(\s*page\s*,\s*['"][^'"]*['"]\s*,\s*['"]([^'"]*)['"]\s*\)/g;

// ---------------------------------------------------------------------------
// Function definition detection (to skip internal waits)
// ---------------------------------------------------------------------------

function findFunctionBounds(source, fnName) {
  const fnRx = new RegExp(`^\\s*(?:async\\s+)?function\\s+${escapeRegex(fnName)}\\s*\\(`, 'm');
  const match = fnRx.exec(source);
  if (!match) return null;

  const startIdx = match.index;
  // Find opening brace
  let braceIdx = source.indexOf('{', startIdx);
  if (braceIdx === -1) return null;

  // Count braces to find the closing one
  let depth = 1;
  let i = braceIdx + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }

  // Convert char indices to line numbers
  const startLine = source.substring(0, startIdx).split('\n').length;
  const endLine = source.substring(0, i).split('\n').length;
  return { startLine, endLine };
}

// ---------------------------------------------------------------------------
// Main extraction algorithm (heuristic mode)
// ---------------------------------------------------------------------------

function extractCaptions(source) {
  const lines = source.split('\n');
  const captions = [];
  let captionId = 1;
  let currentTime = 0.0;

  // Find function definition regions to skip
  const skipRegions = [];
  for (const fnName of [showFn, hideFn, captionFn, 'naturalType']) {
    const bounds = findFunctionBounds(source, fnName);
    if (bounds) skipRegions.push(bounds);
  }

  function isInSkipRegion(lineNum) {
    return skipRegions.some((r) => lineNum >= r.startLine && lineNum <= r.endLine);
  }

  // Find the test body start (process only after test(...) line)
  let inTestBody = false;
  let testBodyBraceDepth = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const line = lines[lineIdx];

    // Detect test body start
    if (!inTestBody && /\btest\s*\(/.test(line)) {
      inTestBody = true;
      testBodyBraceDepth = 0;
      // Count braces on this line
      for (const ch of line) {
        if (ch === '{') testBodyBraceDepth++;
        if (ch === '}') testBodyBraceDepth--;
      }
      continue;
    }

    if (!inTestBody) continue;

    // Track brace depth for test body
    for (const ch of line) {
      if (ch === '{') testBodyBraceDepth++;
      if (ch === '}') testBodyBraceDepth--;
    }

    // Skip function definitions within the test body
    if (isInSkipRegion(lineNum)) continue;

    // --- Accumulate timing ---

    // waitForTimeout(N)
    let m;
    const wtRx = new RegExp(waitForTimeoutRx.source, 'g');
    while ((m = wtRx.exec(line)) !== null) {
      currentTime += parseInt(m[1], 10) / 1000;
    }

    // pause(page, N)
    const pRx = new RegExp(pauseRx.source, 'g');
    while ((m = pRx.exec(line)) !== null) {
      const ms = m[1] ? parseInt(m[1], 10) : TIMING.pauseDefault;
      if (ms !== undefined) currentTime += ms / 1000;
    }

    // scenicPause(page, N?)
    const spRx = new RegExp(scenicPauseRx.source, 'g');
    while ((m = spRx.exec(line)) !== null) {
      const ms = m[1] ? parseInt(m[1], 10) : TIMING.scenicPauseDefault;
      currentTime += ms / 1000;
    }

    // quickPause(page, N?)
    const qpRx = new RegExp(quickPauseRx.source, 'g');
    while ((m = qpRx.exec(line)) !== null) {
      const ms = m[1] ? parseInt(m[1], 10) : TIMING.quickPauseDefault;
      currentTime += ms / 1000;
    }

    // smoothScroll
    if (new RegExp(smoothScrollRx.source).test(line)) {
      currentTime += TIMING.smoothScroll;
    }

    // setViewport
    if (new RegExp(setViewportRx.source).test(line)) {
      currentTime += TIMING.setViewport;
    }

    // page.goto
    if (new RegExp(gotoRx.source).test(line)) {
      currentTime += TIMING.pageGoto;
    }

    // page.waitForLoadState
    if (new RegExp(waitForLoadStateRx.source).test(line)) {
      currentTime += TIMING.waitForLoadState;
    }

    // page.click (but not inside a caption/show/hide function name)
    if (new RegExp(clickRx.source).test(line)) {
      currentTime += TIMING.pageClick;
    }

    // page.hover
    if (new RegExp(hoverRx.source).test(line)) {
      currentTime += TIMING.pageHover;
    }

    // page.mouse.move
    if (new RegExp(mouseMoveRx.source).test(line)) {
      currentTime += TIMING.mouseMove;
    }

    // page.evaluate
    if (new RegExp(evaluateRx.source).test(line)) {
      currentTime += TIMING.pageEvaluate;
    }

    // dragAndDrop
    const ddRx = new RegExp(dragAndDropRx.source, 'g');
    while ((m = ddRx.exec(line)) !== null) {
      const holdMs = m[1] ? parseInt(m[1], 10) : 100;
      currentTime += (holdMs * 2 + TIMING.dragAndDropSettle) / 1000;
    }

    // naturalType
    const ntRx = new RegExp(naturalTypeRx.source, 'g');
    while ((m = ntRx.exec(line)) !== null) {
      currentTime += m[1].length * TIMING.naturalTypePerChar;
    }

    // --- Detect caption calls ---

    // showCaption(page, 'text')
    const scRx = new RegExp(showCaptionRx.source, 'g');
    while ((m = scRx.exec(line)) !== null) {
      captions.push({
        id: captionId++,
        text: m[1],
        startSec: Math.round(currentTime * 10) / 10,
        type: 'showCaption',
        line: lineNum,
      });
      currentTime += TIMING.showCaption;
    }

    // caption(page, 'text', ms?) -- must check BEFORE showCaption to avoid double-matching
    // Since showCaption already matched above, we check for standalone caption() calls
    // by ensuring the function name is exactly captionFn (not showCaption or hideCaption)
    if (captionFn !== showFn) {
      // Build a regex that matches captionFn but NOT showCaptionFn
      const standaloneCaptionRx = new RegExp(
        `(?<!\\w)${captionFnEsc}\\(\\s*page\\s*,\\s*['"](.+?)['"](?:\\s*,\\s*(\\d+))?\\s*,?\\s*\\)`,
        'gs',
      );
      while ((m = standaloneCaptionRx.exec(line)) !== null) {
        const ms = m[2] ? parseInt(m[2], 10) : TIMING.captionDefault;
        captions.push({
          id: captionId++,
          text: m[1],
          startSec: Math.round(currentTime * 10) / 10,
          type: 'caption',
          line: lineNum,
          durationMs: ms,
        });
        // caption() = show(300ms) + hold(ms) + hide(300ms)
        currentTime += TIMING.showCaption + ms / 1000 + TIMING.hideCaption;
      }
    }

    // hideCaption(page)
    if (new RegExp(hideCaptionRx.source).test(line)) {
      currentTime += TIMING.hideCaption;
    }
  }

  return captions;
}

// ---------------------------------------------------------------------------
// Handle multiline caption() calls
// ---------------------------------------------------------------------------

function normalizeMultiline(source) {
  // Join lines where a caption/showCaption call spans multiple lines
  // Strategy: when we see an opening paren for caption/showCaption that
  // doesn't close on the same line, join subsequent lines until we find
  // the closing paren.
  const lines = source.split('\n');
  const result = [];
  let buffer = '';
  let parenDepth = 0;
  let inCaption = false;

  const captionStartRx = new RegExp(
    `(?:${escapeRegex(showFn)}|${escapeRegex(captionFn)})\\s*\\(`,
    'g',
  );

  for (const line of lines) {
    if (!inCaption) {
      captionStartRx.lastIndex = 0;
      if (captionStartRx.test(line)) {
        // Check if the call closes on this line
        let depth = 0;
        for (const ch of line) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
        }
        if (depth > 0) {
          // Multiline call -- start buffering
          inCaption = true;
          parenDepth = depth;
          buffer = line;
          continue;
        }
      }
      result.push(line);
    } else {
      // Continue buffering
      buffer += ' ' + line.trim();
      for (const ch of line) {
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
      }
      if (parenDepth <= 0) {
        result.push(buffer);
        buffer = '';
        inCaption = false;
      }
    }
  }

  if (buffer) result.push(buffer);
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  let captions;

  if (fromLog) {
    // --from-log mode: parse real timestamps from Playwright test output
    if (!fs.existsSync(fromLog)) {
      console.error(`Error: Log file not found: ${fromLog}`);
      process.exit(1);
    }

    const logContent = fs.readFileSync(fromLog, 'utf-8');
    console.log(`Extracting captions from recording log: ${path.resolve(fromLog)}`);
    console.log('  Mode: real timestamps (from startTimestampRecording)\n');

    captions = parseTimestampLog(logContent);

    if (captions.length === 0) {
      console.warn('WARNING: No __CAPTION_TS__ markers found in the log file.');
      console.warn('  Ensure the spec calls startTimestampRecording() and uses');
      console.warn('  the updated caption-overlay.ts template.');

      if (specFile && fs.existsSync(specFile)) {
        console.warn(`\n  Falling back to heuristic extraction from: ${specFile}`);
        const rawSource = fs.readFileSync(specFile, 'utf-8');
        const source = normalizeMultiline(rawSource);
        captions = extractCaptions(source);
      } else {
        process.exit(1);
      }
    }
  } else {
    // Heuristic mode: parse spec file and estimate timestamps
    if (!specFile || !fs.existsSync(specFile)) {
      console.error(`Error: Spec file not found: ${specFile}`);
      console.error('  Use --from-log <file> to extract from a recording log instead.');
      process.exit(1);
    }

    const rawSource = fs.readFileSync(specFile, 'utf-8');
    const source = normalizeMultiline(rawSource);

    console.log(`Extracting captions from: ${path.resolve(specFile)}`);
    console.log(`  Mode: heuristic timestamp estimation`);
    console.log(`  Show function:    ${showFn}`);
    console.log(`  Caption function: ${captionFn}`);
    console.log(`  Hide function:    ${hideFn}`);
    console.log('  NOTE: For exact timestamps, use startTimestampRecording() in your spec');
    console.log('        and pass --from-log <recording.log> to this script.\n');

    captions = extractCaptions(source);
  }

  if (captions.length === 0) {
    console.warn('WARNING: No captions found.');
    if (!fromLog) {
      console.warn(`  Looked for: ${showFn}(page, '...') and ${captionFn}(page, '...', ms)`);
      console.warn('  Try --show-fn / --caption-fn if your spec uses different function names.');
    }
    process.exit(0);
  }

  // Print summary
  const modeLabel = fromLog ? 'real' : 'estimated';
  console.log(`Found ${captions.length} captions (${modeLabel} timestamps):\n`);
  for (const cap of captions) {
    const dur = cap.durationMs ? ` (${cap.durationMs}ms hold)` : '';
    console.log(`  #${String(cap.id).padStart(2, ' ')} [${cap.startSec.toFixed(1)}s] ${cap.type}: "${cap.text.slice(0, 60)}${cap.text.length > 60 ? '...' : ''}"${dur}`);
  }

  const lastCap = captions[captions.length - 1];
  const estEnd = lastCap.startSec + (lastCap.durationMs ? lastCap.durationMs / 1000 : 3);
  console.log(`\n${fromLog ? 'Actual' : 'Estimated'} video duration: ~${estEnd.toFixed(0)}s`);

  // Write manifest
  const manifest = JSON.stringify(captions, null, 2);
  if (dryRun) {
    console.log('\n--- Manifest (dry run) ---');
    console.log(manifest);
  } else {
    const outDir = path.dirname(outputPath);
    if (outDir !== '.' && !fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, manifest);
    console.log(`\nManifest written to: ${path.resolve(outputPath)}`);
    if (!fromLog) {
      console.log('Edit this file to adjust timestamps before running generate-voice.mjs');
    }
  }
}

main();
