/**
 * Caption Overlay System -- Copy this into your Playwright demo spec
 *
 * Provides showCaption(), hideCaption(), and caption() functions that render
 * text overlays at the bottom of the viewport during video recording.
 *
 * These functions are the primary input to the demo video pipeline:
 *   extract-captions.mjs parses these calls to generate the caption manifest.
 *
 * TIMESTAMP RECORDING (recommended):
 *   Call startTimestampRecording() at the very start of your demo test.
 *   Each showCaption()/caption() call will emit __CAPTION_TS__ markers to
 *   stdout, which the pipeline parses for exact timestamp alignment.
 *   Without this, the pipeline falls back to heuristic estimation (+/-1s).
 *
 * Usage:
 *   1. Copy this entire block into the top of your spec file (or import it)
 *   2. Call startTimestampRecording() as the first line of your test
 *   3. Use showCaption/caption/hideCaption in your test body
 *   4. Run the pipeline (extract-captions.mjs or run-pipeline.mjs)
 */

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Timestamp recording state
// ---------------------------------------------------------------------------

let _tsBase = 0;
let _suppressLog = false;

/**
 * Start recording caption timestamps. Call this as the FIRST LINE of your
 * demo test, before any page.goto() or other actions.
 *
 * Emits __CAPTION_TS__ markers to stdout that the pipeline parses for
 * exact video-audio synchronization. Without this call, the pipeline
 * falls back to heuristic timestamp estimation (which can drift).
 *
 * @param videoStartOffsetSec  Estimated seconds between Playwright video
 *   recording start (browser context creation) and this function call.
 *   Playwright begins recording when the browser context is created;
 *   by the time your test function starts, ~1s has typically elapsed.
 *   Default: 1.0. Adjust if you see consistent offset in the final video.
 */
export function startTimestampRecording(videoStartOffsetSec = 1.0): void {
  _tsBase = Date.now() - videoStartOffsetSec * 1000;
  console.log(`__CAPTION_TS__:init:${videoStartOffsetSec}`);
}

// ---------------------------------------------------------------------------
// Caption CSS -- gradient background, white text, fixed to bottom
// ---------------------------------------------------------------------------

const CAPTION_CSS = [
  'position:fixed',
  'bottom:0',
  'left:0',
  'right:0',
  'z-index:99999',
  'padding:20px 40px 28px',
  'background:linear-gradient(transparent 0%,rgba(0,0,0,0.15) 15%,rgba(0,0,0,0.82) 100%)',
  'color:#fff',
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  'font-size:20px',
  'font-weight:500',
  'line-height:1.4',
  'text-align:center',
  'letter-spacing:0.01em',
  'text-shadow:0 1px 3px rgba(0,0,0,0.5)',
  'pointer-events:none',
  'opacity:0',
  'transition:opacity 0.3s ease',
].join(';');

// ---------------------------------------------------------------------------
// Caption functions
// ---------------------------------------------------------------------------

/**
 * Show caption text at the bottom of the viewport.
 * Persists until next showCaption() or hideCaption() call.
 * Re-injects the overlay element if lost after page navigation.
 */
export async function showCaption(page: Page, text: string): Promise<void> {
  if (_tsBase > 0 && !_suppressLog) {
    const sec = ((Date.now() - _tsBase) / 1000).toFixed(2);
    console.log(`__CAPTION_TS__:show:${sec}:${JSON.stringify(text)}`);
  }
  await page.evaluate(([t, css]: string[]) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      el.style.cssText = css;
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = '1';
  }, [text, CAPTION_CSS]);
  await page.waitForTimeout(300); // fade-in duration
}

/**
 * Fade out the current caption.
 */
export async function hideCaption(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) el.style.opacity = '0';
  });
  await page.waitForTimeout(300); // fade-out duration
}

/**
 * Show caption, hold for specified duration, then fade out.
 * Convenience wrapper: showCaption + wait + hideCaption.
 *
 * @param page  Playwright Page instance
 * @param text  Caption text to display
 * @param ms    Hold duration in milliseconds (default: 3000)
 */
export async function caption(page: Page, text: string, ms = 3000): Promise<void> {
  if (_tsBase > 0) {
    const sec = ((Date.now() - _tsBase) / 1000).toFixed(2);
    console.log(`__CAPTION_TS__:caption:${sec}:${ms}:${JSON.stringify(text)}`);
  }
  _suppressLog = true;
  await showCaption(page, text);
  _suppressLog = false;
  await page.waitForTimeout(ms);
  await hideCaption(page);
}
