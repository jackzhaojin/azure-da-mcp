#!/usr/bin/env node
/**
 * run-pipeline.mjs -- Orchestrator: chains all pipeline steps
 *
 * Coordinates the full demo video pipeline from Playwright spec to final MP4:
 *   1. (Optional) Record the Playwright demo test and capture timestamp markers
 *   2. Extract captions from spec file or recording log -> JSON manifest
 *   3. Generate per-caption TTS audio via ElevenLabs (cached)
 *   4. Merge video + audio with freeze-frame algorithm
 *   5. Add background music overlay
 *
 * Zero npm dependencies -- uses Node.js builtins only.
 *
 * Usage:
 *   node run-pipeline.mjs --spec <spec.ts> --video <video.webm> [options]
 *
 *   # Or let the pipeline record + process in one command:
 *   node run-pipeline.mjs --record --spec <spec.ts> [options]
 *
 * Options:
 *   --spec, -s <path>        Playwright spec file with caption calls
 *   --video, -v <path>       Recorded video file (webm or mp4)
 *   --record                 Run Playwright test first, capture output for timestamps
 *   --playwright-config <p>  Playwright config file (default: playwright.video.config.ts)
 *   --grep <pattern>         Playwright test grep pattern (default: @demo)
 *   --project-dir <path>     Project directory to run Playwright in (default: cwd)
 *   --music <path>           Background music track (optional)
 *   --output-dir, -d <dir>   Working directory for intermediate files (default: ./demo-output)
 *   --output, -o <path>      Final output video path (default: <output-dir>/demo-final.mp4)
 *   --voice-id <id>          ElevenLabs voice ID (default: Matilda)
 *   --model <id>             ElevenLabs model (default: eleven_turbo_v2_5)
 *   --show-fn <name>         Custom showCaption function name
 *   --caption-fn <name>      Custom caption function name
 *   --hide-fn <name>         Custom hideCaption function name
 *   --music-volume <0-1>     Background music volume (default: 0.15)
 *   --skip-voice             Skip TTS generation (use existing audio files)
 *   --skip-music             Skip music overlay step
 *   --dry-run                Print commands without executing
 *   --api-key <key>          ElevenLabs API key (overrides env var)
 *   --env-file <path>        Path to .env file
 *
 * Environment:
 *   ELEVENLABS_API_KEY       API key for TTS generation
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node run-pipeline.mjs --spec <spec.ts> --video <video.webm> [options]
       node run-pipeline.mjs --record --spec <spec.ts> [options]

Options:
  --spec, -s <path>        Playwright spec file with caption calls
  --video, -v <path>       Recorded video file (webm or mp4)
  --record                 Run Playwright test, capture output for timestamps
  --playwright-config <p>  Playwright config file (default: playwright.video.config.ts)
  --grep <pattern>         Playwright test grep pattern (default: @demo)
  --project-dir <path>     Project dir for Playwright (default: cwd)
  --music <path>           Background music track (optional)
  --output-dir, -d <dir>   Working directory (default: ./demo-output)
  --output, -o <path>      Final output path (default: <dir>/demo-final.mp4)
  --voice-id <id>          ElevenLabs voice ID (default: Matilda)
  --model <id>             ElevenLabs model (default: eleven_turbo_v2_5)
  --show-fn <name>         Custom showCaption function name
  --caption-fn <name>      Custom caption function name
  --hide-fn <name>         Custom hideCaption function name
  --music-volume <0-1>     Music volume (default: 0.15)
  --skip-voice             Skip TTS, use existing audio
  --skip-music             Skip music overlay
  --dry-run                Print plan without executing
  --api-key <key>          ElevenLabs API key
  --env-file <path>        Path to .env file`);
  process.exit(0);
}

function getArg(flags, defaultVal) {
  const flagList = Array.isArray(flags) ? flags : [flags];
  for (const flag of flagList) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  }
  return defaultVal;
}

function hasFlag(flag) {
  return args.includes(flag);
}

const specFile = getArg(['--spec', '-s'], null);
let videoFile = getArg(['--video', '-v'], null);
const record = hasFlag('--record');
const playwrightConfig = getArg(['--playwright-config'], 'playwright.video.config.ts');
const grepPattern = getArg(['--grep'], '@demo');
const projectDir = getArg(['--project-dir'], process.cwd());
const musicFile = getArg(['--music'], null);
const outputDir = getArg(['--output-dir', '-d'], './demo-output');
const voiceId = getArg(['--voice-id'], null);
const modelId = getArg(['--model'], null);
const showFn = getArg(['--show-fn'], null);
const captionFn = getArg(['--caption-fn'], null);
const hideFn = getArg(['--hide-fn'], null);
const musicVolume = getArg(['--music-volume'], null);
const apiKey = getArg(['--api-key'], null);
const envFile = getArg(['--env-file'], null);
const skipVoice = hasFlag('--skip-voice');
const skipMusic = hasFlag('--skip-music');
const dryRun = hasFlag('--dry-run');

// Computed paths
const manifestPath = path.join(outputDir, 'captions.json');
const audioDir = path.join(outputDir, 'audio');
const voicedVideo = path.join(outputDir, 'demo-with-voice.mp4');
const finalOutput = getArg(['--output', '-o'], path.join(outputDir, 'demo-final.mp4'));
const recordingLog = path.join(outputDir, 'recording.log');

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

function preflight() {
  console.log('=== Demo Video Pipeline ===\n');
  console.log('Pre-flight checks...');

  const errors = [];

  // Required inputs
  if (!specFile) errors.push('--spec is required: path to Playwright spec file');
  else if (!fs.existsSync(specFile)) errors.push(`Spec file not found: ${specFile}`);

  if (!record && !videoFile) errors.push('--video is required (or use --record to capture automatically)');
  else if (videoFile && !fs.existsSync(videoFile)) errors.push(`Video file not found: ${videoFile}`);

  if (musicFile && !fs.existsSync(musicFile)) {
    errors.push(`Music file not found: ${musicFile}`);
  }

  // ffmpeg/ffprobe
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('  [OK] ffmpeg');
  } catch {
    errors.push('ffmpeg not found. Install: brew install ffmpeg');
  }

  try {
    execSync('ffprobe -version', { stdio: 'pipe' });
    console.log('  [OK] ffprobe');
  } catch {
    errors.push('ffprobe not found. Install: brew install ffmpeg');
  }

  // Node.js version (need 18+ for native fetch)
  const nodeVersion = parseInt(process.version.slice(1), 10);
  if (nodeVersion < 18) {
    errors.push(`Node.js 18+ required for native fetch (found ${process.version})`);
  } else {
    console.log(`  [OK] Node.js ${process.version}`);
  }

  // Playwright (only if recording)
  if (record) {
    try {
      execSync('npx playwright --version', { stdio: 'pipe', cwd: projectDir });
      console.log('  [OK] Playwright');
    } catch {
      errors.push('Playwright not found. Run: npm install -D @playwright/test');
    }
  }

  // ElevenLabs API key (only if not skipping voice)
  if (!skipVoice) {
    const key = apiKey ||
      process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVAN_LABS_API_KEY ||
      loadKeyFromEnvFile();
    if (!key) {
      errors.push('ElevenLabs API key not found. Set ELEVENLABS_API_KEY or use --api-key');
    } else {
      console.log('  [OK] ElevenLabs API key');
    }
  }

  if (errors.length > 0) {
    console.error('\nPre-flight FAILED:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('\nAll checks passed.\n');
}

function loadKeyFromEnvFile() {
  const envPath = envFile ? path.resolve(envFile) : path.resolve('.env');
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf-8');
  const match =
    content.match(/ELEVENLABS_API_KEY=(.+)/) ||
    content.match(/ELEVAN_LABS_API_KEY=(.+)/);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

// ---------------------------------------------------------------------------
// Pipeline step execution
// ---------------------------------------------------------------------------

function runScript(scriptName, scriptArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  const cmd = `node "${scriptPath}" ${scriptArgs.join(' ')}`;

  if (dryRun) {
    console.log(`  [DRY RUN] ${cmd}\n`);
    return;
  }

  console.log(`  Running: ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
  console.log();
}

// ---------------------------------------------------------------------------
// Recording step: run Playwright and capture output
// ---------------------------------------------------------------------------

function runRecording() {
  console.log('========================================');
  console.log('STEP 0: Record Playwright Demo');
  console.log('========================================\n');

  const configPath = path.resolve(projectDir, playwrightConfig);
  if (!fs.existsSync(configPath)) {
    console.error(`  Playwright config not found: ${configPath}`);
    console.error('  Use --playwright-config to specify the correct path.');
    process.exit(1);
  }

  const cmd = `npx playwright test --config="${playwrightConfig}" --grep "${grepPattern}"`;
  console.log(`  Running: ${cmd}`);
  console.log(`  Working dir: ${projectDir}`);
  console.log(`  Log output: ${path.resolve(recordingLog)}\n`);

  if (dryRun) {
    console.log('  [DRY RUN] Skipping recording.\n');
    return null;
  }

  // Run Playwright and capture all output (stdout + stderr)
  try {
    const output = execSync(cmd, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
      timeout: 600_000, // 10 minute timeout
    });

    // Save the full output log
    fs.writeFileSync(recordingLog, output);
    console.log(`  Recording complete. Log saved to: ${path.resolve(recordingLog)}`);

    // Print the output so user can see it
    console.log(output);

    return output;
  } catch (err) {
    // Playwright test may "fail" with exit code 1 but still produce video + output
    const output = (err.stdout || '') + '\n' + (err.stderr || '');
    fs.writeFileSync(recordingLog, output);
    console.log(`  Recording output saved (test may have had warnings): ${path.resolve(recordingLog)}`);

    // Check if output has our timestamp markers -- if so, recording was good enough
    if (output.includes('__CAPTION_TS__')) {
      console.log('  Timestamp markers found in output -- proceeding with pipeline.');
      console.log(output);
      return output;
    }

    console.error('\n  Recording FAILED. Playwright output:');
    console.error(output);
    process.exit(1);
  }
}

/**
 * Find the video file in test-results/ after a Playwright recording.
 * Playwright saves videos to test-results/<test-folder>/video.webm
 */
function findRecordedVideo() {
  const testResultsDir = path.resolve(projectDir, 'test-results');
  if (!fs.existsSync(testResultsDir)) {
    console.error(`  test-results/ directory not found at: ${testResultsDir}`);
    return null;
  }

  // Recursively find .webm files in test-results
  const videoFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.webm') || entry.name.endsWith('.mp4')) {
        videoFiles.push({ path: fullPath, mtime: fs.statSync(fullPath).mtime });
      }
    }
  }
  walk(testResultsDir);

  if (videoFiles.length === 0) {
    console.error('  No video files found in test-results/');
    return null;
  }

  // Use the most recently modified video
  videoFiles.sort((a, b) => b.mtime - a.mtime);
  console.log(`  Found ${videoFiles.length} video file(s). Using most recent:`);
  console.log(`    ${videoFiles[0].path}\n`);
  return videoFiles[0].path;
}

/**
 * Check if recording log contains __CAPTION_TS__ markers.
 * Returns true if real timestamps are available.
 */
function logHasTimestamps(logContent) {
  return logContent && logContent.includes('__CAPTION_TS__:init:');
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function main() {
  preflight();

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const startTime = Date.now();
  let recordingOutput = null;

  // --- Step 0 (optional): Record Playwright demo ---
  if (record) {
    recordingOutput = runRecording();

    if (!dryRun) {
      // Find the recorded video if --video was not provided
      if (!videoFile) {
        videoFile = findRecordedVideo();
        if (!videoFile) {
          console.error('  Could not find recorded video. Use --video to specify path manually.');
          process.exit(1);
        }
      }
    }
  }

  // --- Step 1: Extract captions ---
  console.log('========================================');
  console.log('STEP 1/4: Extract Captions');
  console.log('========================================\n');

  // Check for real timestamps in recording log
  const hasRealTimestamps = recordingOutput && logHasTimestamps(recordingOutput);

  if (hasRealTimestamps) {
    console.log('  Real timestamps detected in recording output (startTimestampRecording).');
    console.log('  Using exact timestamps instead of heuristic estimation.\n');

    const extractArgs = [
      specFile ? `"${specFile}"` : '',
      `--output "${manifestPath}"`,
      `--from-log "${recordingLog}"`,
    ];

    runScript('extract-captions.mjs', extractArgs.filter(Boolean));
  } else {
    if (record && recordingOutput) {
      console.warn('  WARNING: No __CAPTION_TS__ markers found in recording output.');
      console.warn('  The spec should call startTimestampRecording() for exact timestamps.');
      console.warn('  Falling back to heuristic estimation (may drift on long demos).\n');
    }

    const extractArgs = [
      `"${specFile}"`,
      `--output "${manifestPath}"`,
    ];
    if (showFn) extractArgs.push(`--show-fn ${showFn}`);
    if (captionFn) extractArgs.push(`--caption-fn ${captionFn}`);
    if (hideFn) extractArgs.push(`--hide-fn ${hideFn}`);

    runScript('extract-captions.mjs', extractArgs);
  }

  // Verify manifest was created
  if (!dryRun && (!fs.existsSync(manifestPath) || fs.statSync(manifestPath).size === 0)) {
    console.error('Error: Caption manifest was not created. Check spec file for caption calls.');
    process.exit(1);
  }

  // --- Step 2: Generate voice ---
  console.log('========================================');
  console.log('STEP 2/4: Generate Voice (ElevenLabs)');
  console.log('========================================\n');

  if (skipVoice) {
    console.log('  [SKIPPED] --skip-voice flag set. Using existing audio files.\n');
  } else {
    const voiceArgs = [
      `"${manifestPath}"`,
      `--output-dir "${audioDir}"`,
    ];
    if (voiceId) voiceArgs.push(`--voice-id ${voiceId}`);
    if (modelId) voiceArgs.push(`--model ${modelId}`);
    if (apiKey) voiceArgs.push(`--api-key ${apiKey}`);
    if (envFile) voiceArgs.push(`--env-file "${envFile}"`);

    runScript('generate-voice.mjs', voiceArgs);
  }

  // --- Step 3: Merge video ---
  console.log('========================================');
  console.log('STEP 3/4: Merge Video (Freeze-Frame)');
  console.log('========================================\n');

  const mergeOutput = (musicFile && !skipMusic) ? voicedVideo : finalOutput;
  const mergeArgs = [
    `--video "${videoFile}"`,
    `--manifest "${manifestPath}"`,
    `--audio-dir "${audioDir}"`,
    `--output "${mergeOutput}"`,
  ];

  runScript('merge-video.mjs', mergeArgs);

  // --- Step 4: Add music ---
  console.log('========================================');
  console.log('STEP 4/4: Add Background Music');
  console.log('========================================\n');

  if (!musicFile || skipMusic) {
    const reason = skipMusic ? '--skip-music flag set' : 'no --music provided';
    console.log(`  [SKIPPED] ${reason}. Voiced video is the final output.\n`);
  } else {
    const musicArgs = [
      `--video "${voicedVideo}"`,
      `--music "${musicFile}"`,
      `--output "${finalOutput}"`,
    ];
    if (musicVolume) musicArgs.push(`--volume ${musicVolume}`);

    runScript('add-music.mjs', musicArgs);

    // Clean up intermediate voiced video if music was added
    if (!dryRun && fs.existsSync(voicedVideo) && finalOutput !== voicedVideo) {
      // Keep it -- user might want to compare
      console.log(`  Intermediate file kept: ${voicedVideo}\n`);
    }
  }

  // --- Summary ---
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('========================================');
  console.log('PIPELINE COMPLETE');
  console.log('========================================\n');

  if (!dryRun) {
    const effectiveOutput = (musicFile && !skipMusic) ? finalOutput : mergeOutput;
    if (fs.existsSync(effectiveOutput)) {
      const stats = fs.statSync(effectiveOutput);
      console.log(`Output:     ${path.resolve(effectiveOutput)}`);
      console.log(`Size:       ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    console.log(`Timestamps: ${hasRealTimestamps ? 'exact (from recording)' : 'heuristic (estimated)'}`);
  }

  console.log(`Elapsed:    ${elapsed}s`);
  console.log(`\nFiles in ${path.resolve(outputDir)}:`);

  if (!dryRun) {
    const files = fs.readdirSync(outputDir);
    for (const f of files) {
      const fp = path.join(outputDir, f);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        const subfiles = fs.readdirSync(fp);
        console.log(`  ${f}/ (${subfiles.length} files)`);
      } else {
        console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
      }
    }
  }
}

main();
