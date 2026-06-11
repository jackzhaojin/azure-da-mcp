#!/usr/bin/env node
/**
 * add-music.mjs -- Background music overlay
 *
 * Mixes a background music track under a voiced video at a configurable
 * volume level. Music loops if shorter than video, trims if longer.
 * Video stream is copied without re-encoding (fast).
 *
 * Zero npm dependencies -- uses Node.js builtins only.
 *
 * Usage:
 *   node add-music.mjs --video <voiced.mp4> --music <music.mp3> [options]
 *
 * Options:
 *   --video, -v <path>       Input video with voice (from merge-video.mjs)
 *   --music, -m <path>       Background music track (MP3)
 *   --output, -o <path>      Output video path (default: demo-final.mp4)
 *   --volume <0-1>           Music volume relative to original (default: 0.15 = 15%)
 *   --fade-out <sec>         Fade out music N seconds before end (default: 3)
 *   --no-loop                Do not loop music (use once, pad with silence)
 *   --dry-run                Print ffmpeg command without executing
 *
 * Music sources:
 *   Pixabay Music (CC0, no attribution required): https://pixabay.com/music/
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node add-music.mjs --video <voiced.mp4> --music <music.mp3> [options]

Options:
  --video, -v <path>       Input video with voice
  --music, -m <path>       Background music track (MP3)
  --output, -o <path>      Output video path (default: demo-final.mp4)
  --volume <0-1>           Music volume (default: 0.15 = 15%)
  --fade-out <sec>         Fade out music before end (default: 3)
  --no-loop                Do not loop music
  --dry-run                Print command without executing

Music: Pixabay Music (CC0, no attribution required)`);
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
const musicInput = getArg(['--music', '-m'], null);
const outputPath = getArg(['--output', '-o'], 'demo-final.mp4');
const musicVolume = parseFloat(getArg(['--volume'], '0.15'));
const fadeOut = parseFloat(getArg(['--fade-out'], '3'));
const noLoop = args.includes('--no-loop');
const dryRun = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateInputs() {
  const errors = [];
  if (!videoInput) errors.push('--video is required');
  else if (!fs.existsSync(videoInput)) errors.push(`Video not found: ${videoInput}`);

  if (!musicInput) errors.push('--music is required');
  else if (!fs.existsSync(musicInput)) errors.push(`Music file not found: ${musicInput}`);

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    errors.push('ffmpeg not found. Install: brew install ffmpeg');
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

function getDuration(filePath) {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim(),
  );
}

// ---------------------------------------------------------------------------
// Build ffmpeg command
// ---------------------------------------------------------------------------

function buildCommand(videoDuration, musicDuration) {
  const loopFlag = noLoop ? '' : '-stream_loop -1 ';

  // Build audio filter
  // 1. Set music volume
  // 2. Optionally fade out near end
  // 3. Mix with video audio, trim to video length
  let musicFilter = `[1:a]volume=${musicVolume}`;

  if (fadeOut > 0 && videoDuration > fadeOut) {
    const fadeStart = videoDuration - fadeOut;
    musicFilter += `,afade=t=out:st=${fadeStart.toFixed(1)}:d=${fadeOut}`;
  }

  musicFilter += '[music]';

  const filterComplex = `${musicFilter};[0:a][music]amix=inputs=2:duration=first[aout]`;

  return [
    'ffmpeg -y',
    `-i "${videoInput}"`,
    `${loopFlag}-i "${musicInput}"`,
    `-filter_complex "${filterComplex}"`,
    '-map 0:v -map "[aout]"',
    '-c:v copy -c:a aac -b:a 192k',
    `"${outputPath}"`,
  ].join(' \\\n  ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  validateInputs();

  const videoDuration = getDuration(videoInput);
  const musicDuration = getDuration(musicInput);

  console.log('=== Add Background Music ===\n');
  console.log(`Video:    ${path.resolve(videoInput)} (${videoDuration.toFixed(1)}s)`);
  console.log(`Music:    ${path.resolve(musicInput)} (${musicDuration.toFixed(1)}s)`);
  console.log(`Volume:   ${(musicVolume * 100).toFixed(0)}%`);
  console.log(`Loop:     ${noLoop ? 'no' : musicDuration < videoDuration ? 'yes (track shorter than video)' : 'no (track longer)'}`);
  console.log(`Fade out: ${fadeOut > 0 ? `${fadeOut}s before end` : 'none'}`);
  console.log(`Output:   ${path.resolve(outputPath)}`);

  const cmd = buildCommand(videoDuration, musicDuration);

  if (dryRun) {
    console.log('\n--- DRY RUN (command not executed) ---\n');
    console.log(cmd);
    return;
  }

  console.log('\n' + cmd + '\n');
  execSync(cmd, { stdio: 'inherit' });

  const stats = fs.statSync(outputPath);
  const outDuration = getDuration(outputPath);
  console.log(`\nDone! ${path.resolve(outputPath)}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Duration: ${outDuration.toFixed(1)}s`);
}

main();
