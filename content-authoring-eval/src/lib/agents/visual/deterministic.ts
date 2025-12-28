/**
 * Visual Correctness Agent - Deterministic Analysis
 *
 * Captures webpage screenshots using Playwright and performs
 * pixel-level image comparison using pixelmatch.
 */

import { chromium } from 'playwright';
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
 * Capture screenshot of a webpage
 */
export async function captureScreenshot(
  url: string,
  viewport: { width: number; height: number } = { width: 1280, height: 720 }
): Promise<ScreenshotResult> {
  const timer = new Timer();
  logger.info('Capturing screenshot', { url, viewport });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport,
      bypassCSP: true,
    });

    const page = await context.newPage();
    logger.debug('Navigating to URL', { url });

    await page.goto(url, { waitUntil: 'networkidle' });
    logger.debug('Page loaded', { url });

    // Generate unique filename based on URL and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const urlHash = Buffer.from(url).toString('base64').slice(0, 10).replace(/[/+=]/g, '');
    const filename = `screenshot-${urlHash}-${timestamp}.png`;
    const relativePath = `screenshots/${filename}`;
    const absolutePath = path.join(process.cwd(), 'public', relativePath);

    // Ensure screenshots directory exists
    const screenshotsDir = path.dirname(absolutePath);
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Capture full page screenshot
    logger.debug('Taking screenshot', { fullPage: true });
    await page.screenshot({
      path: absolutePath,
      fullPage: true,
    });

    // Get file stats
    const stats = fs.statSync(absolutePath);

    // Read PNG to get dimensions
    const pngBuffer = fs.readFileSync(absolutePath);
    const png = PNG.sync.read(pngBuffer);

    const result: ScreenshotResult = {
      path: relativePath,
      absolutePath,
      size: stats.size,
      dimensions: {
        width: png.width,
        height: png.height,
      },
      capturedAt: new Date().toISOString(),
    };

    logger.operationComplete('Screenshot capture', timer.elapsed(), {
      path: relativePath,
      size: stats.size,
      dimensions: result.dimensions,
    });

    await browser.close();
    logger.debug('Browser closed');

    return result;
  } catch (error) {
    await browser.close();
    logger.error('Screenshot capture failed', error as Error, { url, duration: timer.elapsed() });
    throw error;
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
