#!/usr/bin/env node
/**
 * generate-voice.mjs -- Per-caption ElevenLabs TTS with caching and voice continuity
 *
 * Reads a caption manifest (JSON) and generates one MP3 per caption via the
 * ElevenLabs text-to-speech API. Supports caching (skip existing files),
 * voice continuity (previous_text/next_text), and retry with exponential backoff.
 *
 * Zero npm dependencies -- uses Node.js builtins only (native fetch, Node 18+).
 *
 * Usage:
 *   node generate-voice.mjs <manifest.json> [options]
 *
 * Options:
 *   --output-dir, -d <dir>   Directory for audio files (default: ./audio)
 *   --voice-id <id>          ElevenLabs voice ID (default: Matilda)
 *   --model <id>             ElevenLabs model ID (default: eleven_turbo_v2_5)
 *   --api-key <key>          ElevenLabs API key (overrides ELEVENLABS_API_KEY env var)
 *   --stability <0-1>        Voice stability (default: 0.5)
 *   --similarity <0-1>       Similarity boost (default: 0.75)
 *   --dry-run                Print plan without making API calls
 *   --force                  Regenerate all files, ignore cache
 *   --env-file <path>        Path to .env file (default: .env in cwd)
 *
 * Environment:
 *   ELEVENLABS_API_KEY       API key (also accepts ELEVAN_LABS_API_KEY for compat)
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node generate-voice.mjs <manifest.json> [options]

Options:
  --output-dir, -d <dir>   Directory for audio files (default: ./audio)
  --voice-id <id>          ElevenLabs voice ID (default: Matilda)
  --model <id>             ElevenLabs model ID (default: eleven_turbo_v2_5)
  --api-key <key>          ElevenLabs API key (overrides env var)
  --stability <0-1>        Voice stability (default: 0.5)
  --similarity <0-1>       Similarity boost (default: 0.75)
  --dry-run                Print plan without making API calls
  --force                  Regenerate all files, ignore cache
  --env-file <path>        Path to .env file (default: .env)`);
  process.exit(0);
}

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

const manifestFile = args.find((a) => !a.startsWith('-'));
const outputDir = getArg('--output-dir', getArg('-d', './audio'));
const voiceId = getArg('--voice-id', 'XrExE9yKIg1WjnnlVkGX'); // Matilda
const modelId = getArg('--model', 'eleven_turbo_v2_5');
const stability = parseFloat(getArg('--stability', '0.5'));
const similarity = parseFloat(getArg('--similarity', '0.75'));
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const envFile = getArg('--env-file', '.env');

const API_BASE = 'https://api.elevenlabs.io/v1';
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// API key loading
// ---------------------------------------------------------------------------

function loadApiKey() {
  // CLI argument takes priority
  const cliKey = getArg('--api-key', null);
  if (cliKey) return cliKey;

  // Environment variable
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (process.env.ELEVAN_LABS_API_KEY) return process.env.ELEVAN_LABS_API_KEY;

  // .env file
  const envPath = path.resolve(envFile);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match =
      content.match(/ELEVENLABS_API_KEY=(.+)/) ||
      content.match(/ELEVAN_LABS_API_KEY=(.+)/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

function captionFilename(id) {
  return `caption_${pad(id)}.mp3`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// TTS generation with caching and retry
// ---------------------------------------------------------------------------

async function generateCaption(apiKey, caption, prevText, nextText) {
  const outPath = path.join(outputDir, captionFilename(caption.id));

  // Cache check
  if (!force && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    console.log(`  [cached]  #${pad(caption.id)}: "${caption.text.slice(0, 50)}${caption.text.length > 50 ? '...' : ''}"`);
    return outPath;
  }

  const body = {
    text: caption.text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarity,
    },
  };

  // Voice continuity: provide context for natural transitions
  if (prevText) body.previous_text = prevText;
  if (nextText) body.next_text = nextText;

  // Retry with exponential backoff
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errBody}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outPath, buffer);
      console.log(`  [new]     #${pad(caption.id)}: "${caption.text.slice(0, 50)}${caption.text.length > 50 ? '...' : ''}" (${(buffer.length / 1024).toFixed(0)} KB)`);
      return outPath;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const waitMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(`  [retry ${attempt}/${MAX_RETRIES}] Caption ${caption.id}: ${err.message} -- waiting ${waitMs}ms`);
        await sleep(waitMs);
      }
    }
  }

  throw new Error(`Failed to generate caption ${caption.id} after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Validate manifest
  if (!manifestFile || !fs.existsSync(manifestFile)) {
    console.error(`Error: Manifest file not found: ${manifestFile}`);
    process.exit(1);
  }

  const captions = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
  if (!Array.isArray(captions) || captions.length === 0) {
    console.error('Error: Manifest is empty or not an array');
    process.exit(1);
  }

  // Validate API key
  const apiKey = loadApiKey();
  if (!apiKey && !dryRun) {
    console.error('Error: ElevenLabs API key not found.');
    console.error('Set ELEVENLABS_API_KEY in environment, .env file, or use --api-key flag.');
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Calculate cost estimate
  const totalChars = captions.reduce((sum, c) => sum + c.text.length, 0);
  const estimatedCredits = Math.ceil(totalChars * 0.5); // Turbo v2.5 rate

  console.log('=== Generate Voice (ElevenLabs TTS) ===\n');
  console.log(`Manifest:    ${path.resolve(manifestFile)}`);
  console.log(`Output dir:  ${path.resolve(outputDir)}`);
  console.log(`Voice ID:    ${voiceId}`);
  console.log(`Model:       ${modelId}`);
  console.log(`Captions:    ${captions.length}`);
  console.log(`Total chars: ${totalChars} (~${estimatedCredits} credits)`);
  console.log(`Mode:        ${dryRun ? 'DRY RUN' : force ? 'FORCE (no cache)' : 'normal (cached)'}`);
  console.log();

  if (dryRun) {
    console.log('Dry run -- no API calls will be made.\n');
    for (const cap of captions) {
      const outPath = path.join(outputDir, captionFilename(cap.id));
      const cached = fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
      console.log(`  #${pad(cap.id)} ${cached ? '[cached]' : '[pending]'}: "${cap.text.slice(0, 60)}${cap.text.length > 60 ? '...' : ''}"`);
    }
    const pending = captions.filter((c) => {
      const p = path.join(outputDir, captionFilename(c.id));
      return !fs.existsSync(p) || fs.statSync(p).size === 0;
    });
    console.log(`\n${pending.length} of ${captions.length} captions need generation.`);
    return;
  }

  // Generate audio for each caption
  console.log('Generating audio...\n');
  const generated = [];
  for (let i = 0; i < captions.length; i++) {
    const prev = i > 0 ? captions[i - 1].text : undefined;
    const next = i < captions.length - 1 ? captions[i + 1].text : undefined;
    const outPath = await generateCaption(apiKey, captions[i], prev, next);
    generated.push({ ...captions[i], audioPath: outPath });
  }

  // Summary
  const cached = generated.filter((_, i) => {
    const p = path.join(outputDir, captionFilename(captions[i].id));
    return fs.existsSync(p);
  }).length;
  console.log(`\nDone! ${generated.length} audio files in ${path.resolve(outputDir)}`);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
