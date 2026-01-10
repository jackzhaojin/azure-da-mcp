/**
 * Image Fetching Tool
 * Downloads images from URLs and saves them locally
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export interface FetchImageInput {
  imageUrl: string;
  outputPath: string;
}

export interface FetchImageResult {
  success: boolean;
  localPath?: string;
  error?: string;
  metadata?: {
    contentType: string;
    fileSize: number;
  };
}

export async function fetchImage(
  input: FetchImageInput
): Promise<FetchImageResult> {
  try {
    // Ensure output directory exists
    const outputDir = path.dirname(input.outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Fetch image with timeout
    const response = await axios.get(input.imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000, // 15 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Blog-PDF-Generator/1.0)',
      },
    });

    // Validate content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        error: `URL does not point to an image (content-type: ${contentType})`,
      };
    }

    // Write to file
    await fs.writeFile(input.outputPath, response.data);

    // Get file stats
    const stats = await fs.stat(input.outputPath);

    return {
      success: true,
      localPath: input.outputPath,
      metadata: {
        contentType,
        fileSize: stats.size,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Image download timed out after 15 seconds',
        };
      }
      if (error.response) {
        return {
          success: false,
          error: `HTTP ${error.response.status}: ${error.response.statusText}`,
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching image',
    };
  }
}

// Tool definition for Agent SDK
export const fetchImageTool = {
  name: 'fetch_image',
  description: 'Downloads an image from a URL and saves it to a local path. Validates that the URL points to an actual image file. Returns the local path and metadata.',
  parameters: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: 'The URL of the image to download',
      },
      outputPath: {
        type: 'string',
        description: 'The absolute path where the image should be saved',
      },
    },
    required: ['imageUrl', 'outputPath'],
  },
  execute: fetchImage,
};
