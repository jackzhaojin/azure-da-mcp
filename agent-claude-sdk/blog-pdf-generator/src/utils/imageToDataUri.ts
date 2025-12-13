/**
 * Image to Data URI Converter
 * Converts local image files to base64 data URIs for PDF embedding
 */

import fs from 'fs/promises';
import path from 'path';

export async function imageToDataUri(imagePath: string): Promise<string> {
  try {
    // Read image file
    const imageBuffer = await fs.readFile(imagePath);

    // Determine MIME type from extension
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg';

    if (ext === '.png') {
      mimeType = 'image/png';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    } else if (ext === '.svg') {
      mimeType = 'image/svg+xml';
    }

    // Convert to base64
    const base64 = imageBuffer.toString('base64');

    // Return data URI
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to convert image to data URI: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
