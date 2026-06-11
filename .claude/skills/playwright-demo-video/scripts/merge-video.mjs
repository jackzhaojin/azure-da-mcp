#!/usr/bin/env node
/**
 * merge-video.mjs -- Freeze-frame merge: video + audio clips -> synchronized MP4
 *
 * Generalized from merge-highlights-v2.mjs. Takes a video file, a caption
 * manifest (JSON), and pre-generated audio clips. Inserts freeze frames where
 * narration needs more time so audio clips NEVER overlap.
 *
 * Zero npm dependencies -- uses Node.js builtins only.
 *
 * Usage:
 *   node merge-video.mjs --video <video> --manifest <manifest.json> --audio-dir <dir> [options]
 *
 * Options:
 *   --video, -v <path>       Input video file (webm or mp4)
 *   --manifest, -m <path>    Caption manifest JSON (from extract-captions.mjs)
 *   --audio-dir, -a <dir>    Directory containing caption_NN.mp3 files
 *   --output, -o <path>      Output video path (default: demo-with-voice.mp4)
 *   --audio-shift <sec>      Voice starts N sec before visual caption (default: -0.5)
 *   --min-gap <sec>          Minimum silence between clips (default: 0.3)
 *   --crf <n>                Video quality (default: 20, lower = better)
 *   --dry-run                Print ffmpeg command without executing
 *
 * Golden Rules:
 *   1. Audio clips NEVER overlap
 *   2. Audio starts 500ms before visual caption (AUDIO_SHIFT = -0.5)
 *   3. Minimum 300ms silence gap between clips (MIN_GAP = 0.3)
 *   4. Freeze frames via ffmpeg trim + tpad=stop_mode=clone + concat
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node merge-video.mjs --video <video> --manifest <manifest.json> --audio-dir <dir> [options]

Options:
  --video, -v <path>       Input video file (webm or mp4)
  --manifest, -m <path>    Caption manifest JSON
  --audio-dir, -a <dir>    Directory containing caption_NN.mp3 files
  --output, -o <path>      Output video path (default: demo-with-voice.mp4)
  --audio-shift <sec>      Voice starts N sec before visual (default: -0.5)
  --min-gap <sec>          Min silence gap between clips (default: 0.3)
  --crf <n>                Video quality (default: 20)
  --dry-run                Print ffmpeg command without executing`);
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

const videoInput = getArg(['--video', '-v'], null);
const manifestFile = getArg(['--manifest', '-m'], null);
const audioDir = getArg(['--audio-dir', '-a'], null);
const outputPath = getArg(['--output', '-o'], 'demo-with-voice.mp4');
const AUDIO_SHIFT = parseFloat(getArg(['--audio-shift'], '-0.5'));
const MIN_GAP = parseFloat(getArg(['--min-gap'], '0.3'));
const CRF = parseInt(getArg(['--crf'], '20'), 10);
const dryRun = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateInputs() {
  const errors = [];
  if (!videoInput) errors.push('--video is required');
  else if (!fs.existsSync(videoInput)) errors.push(`Video not found: ${videoInput}`);

  if (!manifestFile) errors.push('--manifest is required');
  else if (!fs.existsSync(manifestFile)) errors.push(`Manifest not found: ${manifestFile}`);

  if (!audioDir) errors.push('--audio-dir is required');
  else if (!fs.existsSync(audioDir)) errors.push(`Audio directory not found: ${audioDir}`);

  // Check ffmpeg/ffprobe
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    errors.push('ffmpeg not found. Install: brew install ffmpeg');
  }
  try {
    execSync('ffprobe -version', { stdio: 'pipe' });
  } catch {
    errors.push('ffprobe not found. Install: brew install ffmpeg');
  }

  if (errors.length > 0) {
    console.error('Validation errors:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

function getAudioDuration(filePath) {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim(),
  );
}

function getVideoDuration(filePath) {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim(),
  );
}

// ---------------------------------------------------------------------------
// Step 1: Load caption manifest and audio durations
// ---------------------------------------------------------------------------

function loadCaptionsWithAudio() {
  const captions = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
  if (!Array.isArray(captions) || captions.length === 0) {
    throw new Error('Manifest is empty or not an array');
  }

  for (const cap of captions) {
    cap.audioPath = path.join(audioDir, `caption_${pad(cap.id)}.mp3`);
    if (!fs.existsSync(cap.audioPath)) {
      throw new Error(`Missing audio file: ${cap.audioPath}`);
    }
    cap.audioDuration = getAudioDuration(cap.audioPath);
  }

  return captions;
}

// ---------------------------------------------------------------------------
// Step 2: Calculate freeze points and new audio timestamps
//
// Walk captions in order. For each:
//   ideal audio start = (visual time in new timeline) + AUDIO_SHIFT
//   earliest start    = previous clip end + MIN_GAP
//   if earliest > ideal -> insert freeze frame
// ---------------------------------------------------------------------------

function calculateFreezes(captions, videoDuration) {
  let videoShift = 0;
  let prevEnd = -Infinity;
  const freezes = [];

  for (const cap of captions) {
    const visualNew = cap.startSec + videoShift;
    let idealStart = visualNew + AUDIO_SHIFT;
    const earliest = prevEnd + MIN_GAP;

    if (idealStart < earliest) {
      const freezeDur = Math.ceil((earliest - idealStart) * 10) / 10; // round up to 0.1s
      freezes.push({
        originalTime: cap.startSec,
        duration: freezeDur,
      });
      videoShift += freezeDur;
      idealStart = earliest;
    }

    cap.newAudioStart = Math.max(idealStart, 0);
    prevEnd = cap.newAudioStart + cap.audioDuration;
  }

  // Tail freeze: if the last audio clip extends past the frozen video end,
  // freeze the last frame to prevent -shortest from cutting off the voiceover
  const frozenVideoDuration = videoDuration + videoShift;
  const lastAudioEnd = prevEnd;
  if (lastAudioEnd > frozenVideoDuration) {
    const tailPadding = Math.ceil((lastAudioEnd - frozenVideoDuration + 1.0) * 10) / 10; // +1s buffer
    freezes.push({
      originalTime: videoDuration - 0.1, // freeze near the end of original video
      duration: tailPadding,
    });
    console.log(`  Tail freeze: extending video by ${tailPadding}s so voiceover isn't cut off`);
  }

  return freezes;
}

// ---------------------------------------------------------------------------
// Step 3: Build ffmpeg video filter (freeze-frame insertion)
// ---------------------------------------------------------------------------

function buildVideoFilter(freezes) {
  const parts = [];
  const labels = [];
  let idx = 0;
  let lastCut = 0;

  for (const f of freezes) {
    // Normal segment: lastCut -> freeze point
    parts.push(
      `[0:v]trim=start=${lastCut}:end=${f.originalTime},setpts=PTS-STARTPTS[seg${idx}]`,
    );
    labels.push(`[seg${idx}]`);
    idx++;

    // Freeze frame: grab frame at freeze point, clone for duration
    parts.push(
      `[0:v]trim=start=${f.originalTime}:end=${(f.originalTime + 0.08).toFixed(2)},setpts=PTS-STARTPTS,tpad=stop_duration=${f.duration}:stop_mode=clone[seg${idx}]`,
    );
    labels.push(`[seg${idx}]`);
    idx++;

    lastCut = f.originalTime;
  }

  // Final segment: last cut -> end of video
  parts.push(
    `[0:v]trim=start=${lastCut},setpts=PTS-STARTPTS[seg${idx}]`,
  );
  labels.push(`[seg${idx}]`);
  idx++;

  // Concat all segments
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[vfrozen]`);

  return parts;
}

// ---------------------------------------------------------------------------
// Step 4: Build full ffmpeg command
// ---------------------------------------------------------------------------

function buildFullCommand(captions, freezes) {
  const videoFilter = buildVideoFilter(freezes);

  // Audio delay filters
  const audioFilters = captions.map((cap, i) => {
    const delayMs = Math.round(cap.newAudioStart * 1000);
    return `[${i + 1}]adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=mono[a${i + 1}]`;
  });

  const mixLabels = captions.map((_, i) => `[a${i + 1}]`).join('');
  audioFilters.push(
    `${mixLabels}amix=inputs=${captions.length}:normalize=0,apad=pad_dur=5[voice]`,
  );

  const allFilters = [...videoFilter, ...audioFilters].join(';\n');

  const inputs = [
    `-i "${videoInput}"`,
    ...captions.map((c) => `-i "${c.audioPath}"`),
  ];

  return [
    'ffmpeg -y',
    ...inputs,
    `-filter_complex "${allFilters}"`,
    '-map "[vfrozen]" -map "[voice]"',
    `-c:v libx264 -crf ${CRF} -preset medium`,
    '-c:a aac -b:a 192k',
    '-shortest',
    `"${outputPath}"`,
  ].join(' \\\n  ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  validateInputs();

  console.log('=== Merge Video (Freeze-Frame Approach) ===\n');

  // Load captions with audio durations
  console.log('Loading caption manifest and audio durations...');
  const captions = loadCaptionsWithAudio();
  const videoDuration = getVideoDuration(videoInput);

  console.log(`Video:    ${path.resolve(videoInput)} (${videoDuration.toFixed(1)}s)`);
  console.log(`Captions: ${captions.length}`);
  console.log(`Audio shift: ${AUDIO_SHIFT}s  |  Min gap: ${MIN_GAP}s`);

  // Calculate freeze points (pass videoDuration for tail-freeze calculation)
  const freezes = calculateFreezes(captions, videoDuration);
  const totalFreeze = freezes.reduce((s, f) => s + f.duration, 0);

  console.log(`\nFreeze points (${freezes.length}):`);
  for (const f of freezes) {
    console.log(`  Video pauses at ${f.originalTime}s for ${f.duration}s`);
  }
  console.log(`Total freeze time: ${totalFreeze.toFixed(1)}s`);
  console.log(`New video duration: ~${(videoDuration + totalFreeze).toFixed(1)}s`);

  // Timing report
  console.log('\nAudio placement (zero overlaps guaranteed):');
  for (const cap of captions) {
    const end = cap.newAudioStart + cap.audioDuration;
    const next = captions.find((c) => c.id === cap.id + 1);
    const gap = next ? next.newAudioStart - end : 0;
    const gapStr = next ? `  gap=${gap.toFixed(1)}s` : '';
    console.log(`  #${pad(cap.id)}: ${cap.newAudioStart.toFixed(1)}s -> ${end.toFixed(1)}s  (${cap.audioDuration.toFixed(1)}s)${gapStr}`);
  }

  // Build command
  console.log('\nBuilding ffmpeg command...');
  const cmd = buildFullCommand(captions, freezes);

  if (dryRun) {
    console.log('\n--- DRY RUN (command not executed) ---\n');
    console.log(cmd);
    return;
  }

  console.log('\n' + cmd + '\n');
  execSync(cmd, { stdio: 'inherit' });

  const stats = fs.statSync(outputPath);
  const outDuration = getVideoDuration(outputPath);
  console.log(`\nDone! ${path.resolve(outputPath)}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Duration: ${outDuration.toFixed(1)}s`);
}

main();
