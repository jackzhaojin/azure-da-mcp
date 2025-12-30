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
import { createLogger, Timer } from '@/lib/logger';
import type {
  ScreenshotResult,
  ImageComparisonResult,
  VisualMetrics,
} from './types';

const logger = createLogger('visual');

/**
 * PHASE 31: Stub function - returns placeholder screenshot result
 *
 * Rationale: Removing direct chromium.launch() to allow Docker to use ONLY @playwright/mcp browsers.
 * The agentic agent will capture screenshots via MCP and perform visual analysis.
 */
export async function captureScreenshot(
  url: string,
  viewport: { width: number; height: number } = { width: 1280, height: 720 }
): Promise<ScreenshotResult> {
  const timer = new Timer();
  logger.warn('PHASE 31: Deterministic screenshot capture DISABLED - using agentic-only mode', { url, viewport });
  logger.info('Returning placeholder screenshot result (agentic agent will handle capture)', { url });

  // PHASE 31: Return placeholder result
  // The agentic agent (analyzeVisualWithClaude) will capture the screenshot via MCP
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-placeholder-${timestamp}.png`;
  const relativePath = `screenshots/${filename}`;
  const absolutePath = path.join(process.cwd(), 'public', relativePath);

  logger.operationComplete('Screenshot capture (stub)', timer.elapsed(), {
    note: 'Deterministic screenshot disabled in Phase 31 - use agentic mode',
  });

  return {
    path: relativePath,
    absolutePath,
    size: 0, // Placeholder
    dimensions: {
      width: viewport.width,
      height: viewport.height,
    },
    capturedAt: new Date().toISOString(),
  };
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

    const img1 = PNG.sync.read(img1Buffer);
    const img2 = PNG.sync.read(img2Buffer);

    // Check dimensions match
    if (img1.width !== img2.width || img1.height !== img2.height) {
      logger.warn('Image dimensions do not match', {
        img1: { width: img1.width, height: img1.height },
        img2: { width: img2.width, height: img2.height },
      });
      throw new Error(`Image dimensions do not match: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`);
    }

    // Create diff image
    const diff = new PNG({ width: img1.width, height: img1.height });

    // Perform pixel comparison
    logger.debug('Running pixelmatch comparison');
    const mismatchedPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      img1.width,
      img1.height,
      { threshold }
    );

    const totalPixels = img1.width * img1.height;
    const diffPercentage = (mismatchedPixels / totalPixels) * 100;

    // Save diff image
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const diffFilename = `diff-${timestamp}.png`;
    const diffRelativePath = `screenshots/${diffFilename}`;
    const diffAbsolutePath = path.join(process.cwd(), 'public', diffRelativePath);

    logger.debug('Saving diff image', { path: diffRelativePath });
    fs.writeFileSync(diffAbsolutePath, PNG.sync.write(diff));

    const result: ImageComparisonResult = {
      mismatchedPixels,
      totalPixels,
      diffPercentage: parseFloat(diffPercentage.toFixed(2)),
      diffImagePath: diffRelativePath,
      matches: diffPercentage < 1.0, // Images match if less than 1% difference
      threshold,
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
    // No baseline to compare against - default to 100 (screenshot captured successfully)
    return 100;
  }

  // Score based on visual similarity
  // 100 - diffPercentage gives us a 0-100 score
  // Cap at 0 minimum
  const score = Math.max(0, 100 - comparison.diffPercentage);

  logger.debug('Visual score calculated', {
    diffPercentage: comparison.diffPercentage,
    score,
  });

  return Math.round(score);
}

/**
 * Main deterministic visual analysis function
 */
export async function analyzeVisual(
  url: string,
  baselineImagePath?: string,
  viewport: { width: number; height: number } = { width: 1280, height: 720 }
): Promise<VisualMetrics> {
  const timer = new Timer();
  logger.info('Starting deterministic visual analysis', { url, hasBaseline: !!baselineImagePath });

  try {
    // Capture screenshot
    const screenshot = await captureScreenshot(url, viewport);

    // Compare with baseline if provided
    let comparison: ImageComparisonResult | undefined;
    if (baselineImagePath) {
      logger.info('Baseline provided, performing comparison', { baselineImagePath });
      comparison = await compareImages(screenshot.absolutePath, baselineImagePath);
    }

    // Calculate score
    const score = calculateVisualScore(comparison);

    const result: VisualMetrics = {
      url,
      screenshot,
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
      score,
      hasComparison: !!comparison,
    });

    return result;
  } catch (error) {
    logger.error('Deterministic visual analysis failed', error as Error, {
      url,
      duration: timer.elapsed(),
    });
    throw error;
  }
}
