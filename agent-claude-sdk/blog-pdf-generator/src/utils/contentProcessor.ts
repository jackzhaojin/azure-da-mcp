/**
 * Content Processor
 * Processes HTML content to embed images and YouTube thumbnails
 */

import { imageToDataUri } from './imageToDataUri.js';

export interface EmbeddedAsset {
  id: string;
  dataUri: string;
  caption?: string;
  type: 'image' | 'youtube';
  position?: string; // e.g., "after-paragraph-3", "after-section-2"
  relativePath?: string; // e.g., "assets/image-xyz-0-optimized.jpg"
  videoUrl?: string; // For YouTube videos: https://www.youtube.com/watch?v=...
}

/**
 * Inject images and YouTube thumbnails into HTML content at specified positions
 */
export async function processContent(
  content: string,
  embeddedAssets: EmbeddedAsset[]
): Promise<string> {
  let processedContent = content;

  // Sort assets by position to process them in order
  const sortedAssets = [...embeddedAssets].sort((a, b) => {
    // Assets without position go at the end
    if (!a.position) return 1;
    if (!b.position) return -1;
    return 0;
  });

  // Process each asset
  for (const asset of sortedAssets) {
    let assetHtml = '';

    if (asset.type === 'youtube') {
      assetHtml = `
        <div class="video-container">
          <img src="${asset.dataUri}" alt="YouTube video thumbnail" style="max-width: 100%; height: auto;" />
          ${asset.caption ? `<p class="video-caption">${escapeHtml(asset.caption)}</p>` : ''}
          ${asset.videoUrl ? `<p class="video-url" style="font-size: 0.8rem; color: #0066cc; margin-top: 0.5rem; font-family: 'Courier New', monospace;">Video: <a href="${escapeHtml(asset.videoUrl)}" style="color: #0066cc; text-decoration: underline;">${escapeHtml(asset.videoUrl)}</a></p>` : ''}
          ${asset.relativePath ? `<p class="asset-path" style="font-size: 0.75rem; color: #666; margin-top: 0.25rem;">Thumbnail: ${escapeHtml(asset.relativePath)}</p>` : ''}
        </div>
      `;
    } else if (asset.type === 'image') {
      assetHtml = `
        <div class="image-container">
          <img src="${asset.dataUri}" alt="${escapeHtml(asset.caption || 'Content image')}" style="max-width: 100%; height: auto;" />
          ${asset.caption ? `<p class="image-caption">${escapeHtml(asset.caption)}</p>` : ''}
          ${asset.relativePath ? `<p class="asset-path" style="font-size: 0.75rem; color: #666; margin-top: 0.25rem;">Asset: ${escapeHtml(asset.relativePath)}</p>` : ''}
        </div>
      `;
    }

    // Insert asset at specified position
    if (asset.position) {
      processedContent = insertAtPosition(processedContent, assetHtml, asset.position);
    } else {
      // Fallback: append at the end if no position specified
      processedContent += assetHtml;
    }
  }

  return processedContent;
}

/**
 * Insert HTML content at a specified position in the document
 * Supports positions like:
 * - "after-paragraph-2" (after the 2nd <p> tag)
 * - "after-section-1" (after the 1st <h2> tag)
 */
function insertAtPosition(content: string, htmlToInsert: string, position: string): string {
  // Parse position (e.g., "after-paragraph-3" or "after-section-2")
  const match = position.match(/after-(paragraph|section)-(\d+)/);

  if (!match) {
    // Invalid position format, append at end
    return content + htmlToInsert;
  }

  const [, elementType, indexStr] = match;
  const targetIndex = parseInt(indexStr, 10);

  // Determine the tag to search for
  let tagPattern: RegExp;
  if (elementType === 'paragraph') {
    // Match closing </p> tags
    tagPattern = /<\/p>/gi;
  } else if (elementType === 'section') {
    // Match closing tags after h2 (section headers)
    // We'll insert after the paragraph following the h2
    tagPattern = /<\/h2>/gi;
  } else {
    // Unknown element type, append at end
    return content + htmlToInsert;
  }

  // Find all matches
  const matches = Array.from(content.matchAll(tagPattern));

  if (matches.length === 0 || targetIndex > matches.length) {
    // Not enough elements, append at end
    return content + htmlToInsert;
  }

  // Get the match at the target index (1-indexed)
  const targetMatch = matches[targetIndex - 1];
  if (!targetMatch || targetMatch.index === undefined) {
    return content + htmlToInsert;
  }

  // Insert after the closing tag
  const insertionPoint = targetMatch.index + targetMatch[0].length;
  return content.slice(0, insertionPoint) + '\n' + htmlToInsert + '\n' + content.slice(insertionPoint);
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
