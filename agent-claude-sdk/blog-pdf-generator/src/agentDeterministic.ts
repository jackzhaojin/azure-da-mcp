/**
 * Blog PDF Generator - Phase 2
 * Enhanced with YouTube support, image optimization, and multiple templates
 */

import { renderTemplate } from './utils/templateRenderer.js';
import { generatePdf } from './tools/generatePdf.js';
import { validatePdf } from './tools/validatePdf.js';
import { fetchYoutubeThumbnail } from './tools/fetchYoutubeThumbnail.js';
import { optimizeImage } from './tools/optimizeImage.js';
import { fetchImage } from './tools/fetchImage.js';
import { imageToDataUri } from './utils/imageToDataUri.js';
import { processContent, EmbeddedAsset } from './utils/contentProcessor.js';
import path from 'path';
import fs from 'fs/promises';

export interface BlogPdfSpec {
  id: string;
  title: string;
  content: string;
  teaser?: string;
  template?: 'basic' | 'featured'; // Template selection
  heroImage?: string; // Hero image URL for featured template
  images?: Array<{
    url: string;
    alt?: string;
    position?: string;
  }>;
  youtube?: Array<{
    videoId: string;
    position?: string;
    caption?: string;
  }>;
  metadata?: {
    author?: string;
    date?: string;
    tags?: string[];
  };
}

export interface PdfGenerationResult {
  success: boolean;
  pdfPath?: string;
  validation?: any;
  error?: string;
  messages: string[];
}

export async function generateBlogPdf(
  spec: BlogPdfSpec,
  outputDir: string
): Promise<PdfGenerationResult> {
  const messages: string[] = [];

  try {
    messages.push('Starting PDF generation...');
    messages.push(`Title: ${spec.title}`);
    messages.push(`Template: ${spec.template || 'basic'}`);

    // Step 1: Process assets (YouTube thumbnails, images, hero image)
    const assetsDir = path.join(outputDir, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });

    let heroImagePath: string | undefined;
    const processedImages: string[] = [];
    const processedYoutubeVideos: string[] = [];
    const embeddedAssets: EmbeddedAsset[] = [];

    // Process hero image for featured template
    if (spec.heroImage && spec.template === 'featured') {
      messages.push(`Fetching hero image: ${spec.heroImage}`);
      const heroPath = path.join(assetsDir, `hero-${spec.id}.jpg`);
      const heroResult = await fetchImage({
        imageUrl: spec.heroImage,
        outputPath: heroPath,
      });

      if (heroResult.success && heroResult.localPath) {
        // Optimize hero image
        const optimizedResult = await optimizeImage({
          imagePath: heroResult.localPath,
          outputDir: assetsDir,
          maxWidth: 1600, // Slightly higher quality for hero
          quality: 85,
          outputFilename: `hero-${spec.id}-optimized.jpg`,
        });

        if (optimizedResult.success && optimizedResult.optimizedPath) {
          heroImagePath = optimizedResult.optimizedPath;
          messages.push(
            `✓ Hero image processed (${(optimizedResult.metadata!.compressionRatio).toFixed(1)}% compression)`
          );
        }
      } else {
        messages.push(`⚠ Warning: Could not fetch hero image`);
      }
    }

    // Process YouTube videos
    if (spec.youtube && spec.youtube.length > 0) {
      messages.push(`Processing ${spec.youtube.length} YouTube video(s)...`);
      for (const video of spec.youtube) {
        const result = await fetchYoutubeThumbnail({
          videoId: video.videoId,
          outputDir: assetsDir,
          caption: video.caption,
        });

        if (result.success && result.imagePath) {
          processedYoutubeVideos.push(result.imagePath);
          // Convert to data URI for embedding
          const dataUri = await imageToDataUri(result.imagePath);
          embeddedAssets.push({
            id: `youtube-${video.videoId}`,
            dataUri,
            caption: video.caption,
            type: 'youtube',
          });
          messages.push(`✓ YouTube thumbnail: ${video.videoId}`);
        } else {
          messages.push(`⚠ Warning: Failed to fetch YouTube thumbnail for ${video.videoId}`);
        }
      }
    }

    // Process images
    if (spec.images && spec.images.length > 0) {
      messages.push(`Processing ${spec.images.length} image(s)...`);
      for (let i = 0; i < spec.images.length; i++) {
        const image = spec.images[i];
        const imagePath = path.join(assetsDir, `image-${spec.id}-${i}.jpg`);
        const fetchResult = await fetchImage({
          imageUrl: image.url,
          outputPath: imagePath,
        });

        if (fetchResult.success && fetchResult.localPath) {
          // Optimize image
          const optimizedResult = await optimizeImage({
            imagePath: fetchResult.localPath,
            outputDir: assetsDir,
            maxWidth: 1200,
            quality: 80,
            outputFilename: `image-${spec.id}-${i}-optimized.jpg`,
          });

          if (optimizedResult.success && optimizedResult.optimizedPath) {
            processedImages.push(optimizedResult.optimizedPath);
            // Convert to data URI for embedding
            const dataUri = await imageToDataUri(optimizedResult.optimizedPath);
            embeddedAssets.push({
              id: `image-${i}`,
              dataUri,
              caption: image.alt,
              type: 'image',
            });
            messages.push(
              `✓ Image ${i + 1} processed (${(optimizedResult.metadata!.compressionRatio).toFixed(1)}% compression)`
            );
          }
        } else {
          messages.push(`⚠ Warning: Failed to fetch image ${i + 1}`);
        }
      }
    }

    // Step 2: Process content to embed images and YouTube thumbnails
    messages.push('Processing content with embedded assets...');
    const processedContentHtml = await processContent(spec.content, embeddedAssets);
    messages.push(`✓ Content processed (${embeddedAssets.length} assets embedded)`);

    // Step 3: Render HTML from template
    messages.push('Rendering HTML template...');
    const templateName = spec.template || 'basic';

    // Convert hero image to data URI if it exists
    let heroImageDataUri: string | undefined;
    if (heroImagePath) {
      heroImageDataUri = await imageToDataUri(heroImagePath);
      messages.push('✓ Hero image converted to data URI');
    }

    const html = await renderTemplate(templateName, {
      title: spec.title,
      content: processedContentHtml,
      teaser: spec.teaser,
      author: spec.metadata?.author,
      date: spec.metadata?.date,
      tags: spec.metadata?.tags,
      heroImage: heroImageDataUri,
    });
    messages.push('✓ HTML rendered');

    // Step 4: Generate PDF
    const pdfPath = path.join(outputDir, `${spec.id}.pdf`);
    messages.push(`Generating PDF at: ${pdfPath}`);

    const pdfResult = await generatePdf({
      htmlContent: html,
      outputPath: pdfPath,
      title: spec.title,
    });

    if (!pdfResult.success) {
      return {
        success: false,
        error: pdfResult.error,
        messages: [...messages, `✗ PDF generation failed: ${pdfResult.error}`],
      };
    }

    messages.push(`✓ PDF generated (${(pdfResult.metadata!.fileSize / 1024).toFixed(2)}KB)`);

    // Step 3: Validate PDF
    messages.push('Validating PDF...');
    const validation = await validatePdf({ pdfPath });

    if (!validation.passed) {
      messages.push('✗ Validation failed');
      messages.push(`  Errors: ${validation.errors.join(', ')}`);

      return {
        success: false,
        pdfPath,
        validation,
        error: 'PDF validation failed',
        messages,
      };
    }

    messages.push('✓ Validation passed');
    messages.push(`  Pages: ${validation.metadata!.pages}`);
    messages.push(`  Size: ${validation.metadata!.fileSizeMB}MB`);

    if (validation.warnings.length > 0) {
      validation.warnings.forEach((warning: string) => {
        messages.push(`  Warning: ${warning}`);
      });
    }

    return {
      success: true,
      pdfPath,
      validation,
      messages,
    };
  } catch (error) {
    messages.push(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      messages,
    };
  }
}
