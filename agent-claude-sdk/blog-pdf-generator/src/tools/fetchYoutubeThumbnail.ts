/**
 * YouTube Thumbnail Fetching Tool
 * Fetches high-resolution YouTube thumbnails and overlays a play button icon
 */

import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export interface FetchYoutubeThumbnailInput {
  videoId: string;
  outputDir?: string;
  caption?: string;
}

export interface FetchYoutubeThumbnailResult {
  success: boolean;
  imagePath?: string;
  caption?: string;
  error?: string;
  metadata?: {
    width: number;
    height: number;
    fileSize: number;
  };
}

/**
 * Fetch YouTube thumbnail and overlay play button
 */
export async function fetchYoutubeThumbnail(
  input: FetchYoutubeThumbnailInput
): Promise<FetchYoutubeThumbnailResult> {
  try {
    // Try maxresdefault first (1280x720), fall back to hqdefault (480x360)
    const thumbnailUrls = [
      `https://img.youtube.com/vi/${input.videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${input.videoId}/hqdefault.jpg`,
    ];

    let thumbnailBuffer: Buffer | null = null;
    let fetchError: string | null = null;

    for (const url of thumbnailUrls) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });

        thumbnailBuffer = Buffer.from(response.data);

        // Check if it's a valid image (not the YouTube placeholder)
        const metadata = await sharp(thumbnailBuffer).metadata();
        if (metadata.width && metadata.width > 120) {
          // Valid thumbnail
          break;
        }
      } catch (error) {
        fetchError = error instanceof Error ? error.message : 'Unknown error';
        // Try next URL
        continue;
      }
    }

    if (!thumbnailBuffer) {
      return {
        success: false,
        error: `Failed to fetch YouTube thumbnail for video ID: ${input.videoId}. ${fetchError}`,
      };
    }

    // Create play button overlay (semi-transparent circle with triangle)
    const playIconSvg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="90" fill="rgba(0,0,0,0.7)" />
        <circle cx="100" cy="100" r="88" fill="none" stroke="white" stroke-width="4" />
        <polygon points="75,60 75,140 140,100" fill="white" />
      </svg>
    `;

    const playIconBuffer = Buffer.from(playIconSvg);

    // Get thumbnail dimensions
    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();
    const width = thumbnailMetadata.width || 1280;
    const height = thumbnailMetadata.height || 720;

    // Position play icon in center
    const playIconSize = Math.min(width, height) / 4;
    const playIcon = await sharp(playIconBuffer)
      .resize(Math.round(playIconSize), Math.round(playIconSize))
      .toBuffer();

    // Composite play icon over thumbnail
    const processedImage = await sharp(thumbnailBuffer)
      .composite([
        {
          input: playIcon,
          top: Math.round((height - playIconSize) / 2),
          left: Math.round((width - playIconSize) / 2),
        },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();

    // Save to output directory
    const outputDir = input.outputDir || './output/assets';
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `youtube-${input.videoId}.jpg`;
    const imagePath = path.join(outputDir, filename);

    await fs.writeFile(imagePath, processedImage);

    const finalMetadata = await sharp(processedImage).metadata();

    return {
      success: true,
      imagePath,
      caption: input.caption,
      metadata: {
        width: finalMetadata.width || 0,
        height: finalMetadata.height || 0,
        fileSize: processedImage.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
