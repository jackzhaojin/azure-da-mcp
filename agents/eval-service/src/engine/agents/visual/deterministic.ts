/**
 * PHASE 31: Visual Correctness Agent - Deterministic Analysis (Stub for Pure MCP Architecture)
 *
 * DEPRECATED: Direct Playwright browser launching removed to eliminate Docker bloat.
 * Use the agentic agent (analyzeVisualWithClaude) which uses Playwright MCP for screenshots.
 *
 * This stub returns minimal results to allow fallback to agentic-only mode.
 */

// PHASE 31: Removed direct playwright import
// import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import imageSize from 'image-size';
import { withBrowserPermit } from '../../../browser/semaphore'; // browser semaphore (PRD part-2) — added during extraction
import { createLogger, Timer } from '@/lib/logger';
import type {
  ScreenshotResult,
  ImageComparisonResult,
  VisualMetrics,
} from './types';

const logger = createLogger('visual');

/**
 * PHASE 36: Screenshot capture using Playwright CLI
 *
 * Uses npx playwright screenshot command to avoid Docker bloat while still capturing real screenshots
 */
export async function captureScreenshot(
  url: string,
  viewport: { width: number; height: number } = { width: 1280, height: 720 }
): Promise<ScreenshotResult> {
  const timer = new Timer();
  logger.info('PHASE 36: Capturing screenshot via Playwright CLI', { url, viewport });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${timestamp}.png`;
  const relativePath = `screenshots/${filename}`;
  const absolutePath = path.join(process.cwd(), 'output', relativePath);

  // Ensure screenshots directory exists
  const screenshotsDir = path.join(process.cwd(), 'output', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // Use custom Node.js script with Playwright (more reliable than CLI)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const scriptPath = path.join(process.cwd(), 'scripts', 'capture-screenshot.cjs');
    const command = `node "${scriptPath}" "${url}" "${absolutePath}" ${viewport.width} ${viewport.height}`;

    logger.debug('Executing Playwright screenshot script', { command });

    const { stdout, stderr } = await withBrowserPermit(() =>
      execAsync(command, {
        timeout: 45000, // 45 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      })
    );

    if (stderr) {
      logger.warn('Screenshot script stderr', { stderr });
    }
    if (stdout) {
      logger.debug('Screenshot script output', { stdout: stdout.trim() });
    }

    // Verify screenshot was created
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Screenshot file not created at ${absolutePath}`);
    }

    const stats = fs.statSync(absolutePath);
    const imageBuffer = fs.readFileSync(absolutePath);
    const dimensions = imageSize(imageBuffer);

    logger.operationComplete('Screenshot capture', timer.elapsed(), {
      url,
      size: stats.size,
      dimensions,
    });

    return {
      path: relativePath,
      absolutePath,
      size: stats.size,
      dimensions: {
        width: dimensions.width || viewport.width,
        height: dimensions.height || viewport.height,
      },
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Screenshot capture failed', error as Error, {
      url,
      duration: timer.elapsed(),
    });

    // Return placeholder on error (allows agentic fallback)
    return {
      path: relativePath,
      absolutePath,
      size: 0,
      dimensions: viewport,
      capturedAt: new Date().toISOString(),
    };
  }
}

/**
 * Compare two PNG images using pixelmatch
 */
export async function compareImages(
  imagePath1: string,
  imagePath2: string,
  threshold: number = 0.1
): Promise<ImageComparisonResult> {
  const timer = new Timer();
  logger.info('Comparing images', { imagePath1, imagePath2, threshold });

  try {
    // Read images
    const img1Buffer = fs.readFileSync(imagePath1);
    const img2Buffer = fs.readFileSync(imagePath2);

    const img1Full = PNG.sync.read(img1Buffer);
    const img2Full = PNG.sync.read(img2Buffer);

    // Full-page screenshots of source vs migrated almost never agree on
    // height. Compare the shared region instead of refusing to compare —
    // a refused comparison used to silently score 100 (false confidence).
    // The size disagreement itself is reported via dimensionsDelta and
    // penalized in calculateVisualScore.
    const width = Math.min(img1Full.width, img2Full.width);
    const height = Math.min(img1Full.height, img2Full.height);
    let dimensionsDelta: ImageComparisonResult['dimensionsDelta'];
    let img1: PNG = img1Full;
    let img2: PNG = img2Full;
    if (img1Full.width !== img2Full.width || img1Full.height !== img2Full.height) {
      const widthPct = (Math.abs(img1Full.width - img2Full.width) / Math.max(img1Full.width, img2Full.width)) * 100;
      const heightPct = (Math.abs(img1Full.height - img2Full.height) / Math.max(img1Full.height, img2Full.height)) * 100;
      dimensionsDelta = {
        widthPct: parseFloat(widthPct.toFixed(2)),
        heightPct: parseFloat(heightPct.toFixed(2)),
      };
      logger.warn('Image dimensions differ — comparing shared region', {
        img1: { width: img1Full.width, height: img1Full.height },
        img2: { width: img2Full.width, height: img2Full.height },
        shared: { width, height },
        dimensionsDelta,
      });
      const crop = (src: PNG): PNG => {
        const out = new PNG({ width, height });
        PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
        return out;
      };
      img1 = crop(img1Full);
      img2 = crop(img2Full);
    }

    // Create diff image
    const diff = new PNG({ width, height });

    // Perform pixel comparison
    logger.debug('Running pixelmatch comparison');
    const mismatchedPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold }
    );

    const totalPixels = width * height;
    const diffPercentage = (mismatchedPixels / totalPixels) * 100;

    // Save diff image
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const diffFilename = `diff-${timestamp}.png`;
    const diffRelativePath = `screenshots/${diffFilename}`;
    const diffAbsolutePath = path.join(process.cwd(), 'output', diffRelativePath);

    logger.debug('Saving diff image', { path: diffRelativePath });
    fs.writeFileSync(diffAbsolutePath, PNG.sync.write(diff));

    const result: ImageComparisonResult = {
      mismatchedPixels,
      totalPixels,
      diffPercentage: parseFloat(diffPercentage.toFixed(2)),
      diffImagePath: diffRelativePath,
      matches: diffPercentage < 1.0 && !dimensionsDelta, // sized differently ≠ a match
      threshold,
      ...(dimensionsDelta ? { dimensionsDelta } : {}),
    };

    logger.operationComplete('Image comparison', timer.elapsed(), {
      mismatchedPixels,
      diffPercentage: result.diffPercentage,
      matches: result.matches,
    });

    return result;
  } catch (error) {
    logger.error('Image comparison failed', error as Error, {
      imagePath1,
      imagePath2,
      duration: timer.elapsed(),
    });
    throw error;
  }
}

/**
 * Calculate visual quality score
 */
export function calculateVisualScore(comparison?: ImageComparisonResult): number {
  if (!comparison) {
    // No baseline requested (sourceType none) — the screenshot captured
    // successfully and there is nothing to compare against. The agentic
    // pass still reviews the page for generic visual quality.
    return 100;
  }

  // Score based on visual similarity over the shared region, plus a capped
  // penalty when the two pages disagree on size (content added/lost shows up
  // as a height delta that the cropped pixel diff can't see).
  const sizePenalty = comparison.dimensionsDelta
    ? Math.min(15, Math.round(Math.max(comparison.dimensionsDelta.widthPct, comparison.dimensionsDelta.heightPct) / 2))
    : 0;
  const score = Math.max(0, 100 - comparison.diffPercentage - sizePenalty);

  logger.debug('Visual score calculated', {
    diffPercentage: comparison.diffPercentage,
    sizePenalty,
    score,
  });

  return Math.round(score);
}

/**
 * Main deterministic visual analysis function
 */
export async function analyzeVisual(
  url: string,
  options?: {
    baselineImagePath?: string;
    sourceUrl?: string;
    pdfPath?: string;
    viewport?: { width: number; height: number };
  }
): Promise<VisualMetrics> {
  const timer = new Timer();
  const viewport = options?.viewport || { width: 1280, height: 720 };

  // Determine source type
  const sourceType = options?.sourceUrl ? 'html' as const :
                    options?.pdfPath ? 'pdf' as const :
                    'none' as const;

  logger.info('Starting deterministic visual analysis', {
    url,
    sourceType,
    hasBaseline: !!options?.baselineImagePath,
    hasSourceUrl: !!options?.sourceUrl,
    hasPdfPath: !!options?.pdfPath,
  });

  try {
    // Capture migrated page screenshot. A failed capture returns a size-0
    // placeholder — that is a measurement failure, NOT a perfect page. Fail
    // the dimension (it gets excluded + reported) instead of scoring 100 on
    // a page that never rendered.
    const screenshot = await captureScreenshot(url, viewport);
    if (screenshot.size === 0) {
      throw new Error(`Screenshot capture failed for ${url} — page did not render`);
    }

    // Capture baseline screenshot if HTML source URL provided
    let baselineScreenshot: typeof screenshot | undefined;
    if (options?.sourceUrl) {
      logger.info('Capturing baseline screenshot from source URL', { sourceUrl: options.sourceUrl });
      baselineScreenshot = await captureScreenshot(options.sourceUrl, viewport);
      if (baselineScreenshot.size === 0) {
        throw new Error(
          `Baseline screenshot capture failed for ${options.sourceUrl} — visual comparison not possible`
        );
      }
    }

    // Compare with baseline if provided (either direct path or captured screenshot)
    let comparison: ImageComparisonResult | undefined;
    const baselineToCompare = options?.baselineImagePath || baselineScreenshot?.absolutePath;

    if (baselineToCompare) {
      logger.info('Baseline available, performing comparison', {
        baselineType: options?.baselineImagePath ? 'direct-path' : 'captured-screenshot',
        baselinePath: baselineToCompare,
      });
      // A comparison was requested — if it can't be computed, the score must
      // not silently degrade to capture-only 100. Let the error fail the
      // dimension (compareImages now handles size mismatches by cropping,
      // so a throw here means the baseline image is unreadable).
      comparison = await compareImages(screenshot.absolutePath, baselineToCompare);
    }

    // Calculate score
    const score = calculateVisualScore(comparison);

    // Build source info
    const source = sourceType !== 'none' ? {
      type: sourceType,
      url: options?.sourceUrl,
      pdfPath: options?.pdfPath,
    } : undefined;

    const result: VisualMetrics = {
      url,
      screenshot,
      source,
      baselineScreenshot,
      comparison,
      score,
      viewport,
      mode: 'deterministic',
      metadata: {
        executedAt: new Date().toISOString(),
        durationMs: timer.elapsed(),
        toolsUsed: ['playwright', 'pixelmatch', 'pngjs'],
      },
    };

    logger.operationComplete('Deterministic visual analysis', timer.elapsed(), {
      url,
      sourceType,
      score,
      hasComparison: !!comparison,
    });

    return result;
  } catch (error) {
    logger.error('Deterministic visual analysis failed', error as Error, {
      url,
      sourceType,
      duration: timer.elapsed(),
    });
    throw error;
  }
}
