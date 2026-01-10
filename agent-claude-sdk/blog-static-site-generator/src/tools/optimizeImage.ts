/**
 * Image Optimization Tool
 * Resizes and compresses images to keep PDF file sizes manageable
 * Strategy: Aggressive optimization (max 1200px width, 80% quality)
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export interface OptimizeImageInput {
  imagePath: string;
  outputDir?: string;
  maxWidth?: number; // Default: 1200px
  quality?: number; // Default: 80
  outputFilename?: string;
}

export interface OptimizeImageResult {
  success: boolean;
  optimizedPath?: string;
  error?: string;
  metadata?: {
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    width: number;
    height: number;
  };
}

/**
 * Optimize image for PDF embedding
 */
export async function optimizeImage(
  input: OptimizeImageInput
): Promise<OptimizeImageResult> {
  try {
    // Read original image
    const imageBuffer = await fs.readFile(input.imagePath);
    const originalSize = imageBuffer.length;

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      return {
        success: false,
        error: 'Unable to read image dimensions',
      };
    }

    // Configuration
    const maxWidth = input.maxWidth || 1200;
    const quality = input.quality || 80;

    // Calculate new dimensions (maintain aspect ratio)
    let width = metadata.width;
    let height = metadata.height;

    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * ratio);
    }

    // Optimize image
    let pipeline = sharp(imageBuffer).resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Apply format-specific optimization
    const format = metadata.format;
    if (format === 'jpeg' || format === 'jpg') {
      pipeline = pipeline.jpeg({ quality, progressive: true });
    } else if (format === 'png') {
      // Convert to JPEG for better compression if it doesn't need transparency
      if (!metadata.hasAlpha) {
        pipeline = pipeline.jpeg({ quality, progressive: true });
      } else {
        pipeline = pipeline.png({ quality, compressionLevel: 9 });
      }
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else {
      // Convert unknown formats to JPEG
      pipeline = pipeline.jpeg({ quality, progressive: true });
    }

    const optimizedBuffer = await pipeline.toBuffer();
    const optimizedSize = optimizedBuffer.length;

    // Save optimized image
    const outputDir = input.outputDir || './output/assets';
    await fs.mkdir(outputDir, { recursive: true });

    const originalFilename = path.basename(input.imagePath);
    const outputFilename =
      input.outputFilename ||
      `optimized-${originalFilename.replace(/\.\w+$/, '.jpg')}`;
    const optimizedPath = path.join(outputDir, outputFilename);

    await fs.writeFile(optimizedPath, optimizedBuffer);

    const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

    return {
      success: true,
      optimizedPath,
      metadata: {
        originalSize,
        optimizedSize,
        compressionRatio,
        width,
        height,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
