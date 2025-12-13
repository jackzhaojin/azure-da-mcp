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
}

/**
 * Inject images and YouTube thumbnails into HTML content
 */
export async function processContent(
  content: string,
  embeddedAssets: EmbeddedAsset[]
): Promise<string> {
  let processedContent = content;

  // Create HTML for each asset
  for (const asset of embeddedAssets) {
    let assetHtml = '';

    if (asset.type === 'youtube') {
      assetHtml = `
        <div class="video-container">
          <img src="${asset.dataUri}" alt="YouTube video thumbnail" />
          ${asset.caption ? `<p class="video-caption">${escapeHtml(asset.caption)}</p>` : ''}
        </div>
      `;
    } else if (asset.type === 'image') {
      assetHtml = `
        <div class="image-container">
          <img src="${asset.dataUri}" alt="Content image" />
          ${asset.caption ? `<p class="image-caption">${escapeHtml(asset.caption)}</p>` : ''}
        </div>
      `;
    }

    // For now, append assets at the end of content
    // TODO: Implement position-based insertion (after-paragraph-2, etc.)
    processedContent += assetHtml;
  }

  return processedContent;
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
