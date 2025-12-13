#!/usr/bin/env tsx
/**
 * PDF Generation Workflow
 * Orchestrates the complete blog-to-PDF generation process
 */

import fs from 'fs/promises';
import path from 'path';
import { fetchImage } from './src/tools/fetchImage.js';
import { optimizeImage } from './src/tools/optimizeImage.js';
import { fetchYoutubeThumbnail } from './src/tools/fetchYoutubeThumbnail.js';
import { imageToDataUri } from './src/utils/imageToDataUri.js';
import { processContent, EmbeddedAsset } from './src/utils/contentProcessor.js';
import { renderTemplate } from './src/utils/templateRenderer.js';
import { generatePdf } from './src/tools/generatePdf.js';
import { validatePdf } from './src/tools/validatePdf.js';

interface BlogSpec {
  id: string;
  title: string;
  teaser?: string;
  template: string;
  heroImage?: string;
  content: string;
  images?: Array<{
    url: string;
    alt: string;
    position: string;
  }>;
  youtube?: Array<{
    videoId: string;
    caption?: string;
    position: string;
  }>;
  metadata?: {
    author?: string;
    date?: string;
    tags?: string[];
  };
}

async function main() {
  const specPath = process.argv[2];

  if (!specPath) {
    console.error('Usage: tsx workflow.ts <path-to-spec.json>');
    process.exit(1);
  }

  console.log('📄 Reading blog specification...');
  const specContent = await fs.readFile(specPath, 'utf-8');
  const spec: BlogSpec = JSON.parse(specContent);

  console.log(`\n✨ Processing: "${spec.title}"`);
  console.log(`📋 Template: ${spec.template}`);
  console.log(`🆔 ID: ${spec.id}\n`);

  const outputDir = 'output';
  const assetsDir = path.join(outputDir, 'assets');
  const embeddedAssets: EmbeddedAsset[] = [];

  // Ensure directories exist
  await fs.mkdir(assetsDir, { recursive: true });

  // Step 1: Process hero image (if featured template)
  let heroImageDataUri: string | undefined;
  if (spec.heroImage && spec.template === 'featured') {
    console.log('🖼️  Processing hero image...');

    const heroPath = path.join(assetsDir, `hero-${spec.id}.jpg`);
    const heroOptimizedPath = path.join(assetsDir, `hero-${spec.id}-optimized.jpg`);

    const fetchResult = await fetchImage({
      imageUrl: spec.heroImage,
      outputPath: heroPath,
    });

    if (!fetchResult.success) {
      console.error(`❌ Failed to fetch hero image: ${fetchResult.error}`);
      process.exit(1);
    }

    console.log(`   ✓ Downloaded (${Math.round((fetchResult.metadata?.fileSize || 0) / 1024)}KB)`);

    const optimizeResult = await optimizeImage({
      inputPath: heroPath,
      outputPath: heroOptimizedPath,
      maxWidth: 1600,
      quality: 85,
    });

    if (!optimizeResult.success) {
      console.error(`❌ Failed to optimize hero image: ${optimizeResult.error}`);
      process.exit(1);
    }

    console.log(`   ✓ Optimized (${Math.round((optimizeResult.metadata?.fileSize || 0) / 1024)}KB)`);

    heroImageDataUri = await imageToDataUri(heroOptimizedPath);
    console.log('   ✓ Converted to data URI\n');
  }

  // Step 2: Process YouTube videos
  if (spec.youtube && spec.youtube.length > 0) {
    console.log(`🎬 Processing ${spec.youtube.length} YouTube video(s)...`);

    for (const [index, video] of spec.youtube.entries()) {
      const thumbnailPath = path.join(assetsDir, `youtube-${spec.id}-${index}.jpg`);

      const thumbnailResult = await fetchYoutubeThumbnail({
        videoId: video.videoId,
        outputPath: thumbnailPath,
      });

      if (!thumbnailResult.success) {
        console.error(`❌ Failed to fetch YouTube thumbnail: ${thumbnailResult.error}`);
        process.exit(1);
      }

      console.log(`   ✓ Thumbnail ${index + 1} downloaded`);

      const dataUri = await imageToDataUri(thumbnailPath);

      embeddedAssets.push({
        id: `youtube-${index}`,
        dataUri,
        caption: video.caption,
        type: 'youtube',
      });
    }
    console.log();
  }

  // Step 3: Process content images
  if (spec.images && spec.images.length > 0) {
    console.log(`🖼️  Processing ${spec.images.length} content image(s)...`);

    for (const [index, image] of spec.images.entries()) {
      const imagePath = path.join(assetsDir, `image-${spec.id}-${index}.jpg`);
      const imageOptimizedPath = path.join(assetsDir, `image-${spec.id}-${index}-optimized.jpg`);

      const fetchResult = await fetchImage({
        imageUrl: image.url,
        outputPath: imagePath,
      });

      if (!fetchResult.success) {
        console.error(`❌ Failed to fetch image ${index + 1}: ${fetchResult.error}`);
        process.exit(1);
      }

      const optimizeResult = await optimizeImage({
        inputPath: imagePath,
        outputPath: imageOptimizedPath,
        maxWidth: 1200,
        quality: 80,
      });

      if (!optimizeResult.success) {
        console.error(`❌ Failed to optimize image ${index + 1}: ${optimizeResult.error}`);
        process.exit(1);
      }

      console.log(`   ✓ Image ${index + 1} processed (${Math.round((optimizeResult.metadata?.fileSize || 0) / 1024)}KB)`);

      const dataUri = await imageToDataUri(imageOptimizedPath);

      embeddedAssets.push({
        id: `image-${index}`,
        dataUri,
        caption: image.alt,
        type: 'image',
      });
    }
    console.log();
  }

  // Step 4: Process content with embedded assets
  console.log('📝 Processing content with embedded assets...');
  const processedContent = await processContent(spec.content, embeddedAssets);
  console.log('   ✓ Content processed\n');

  // Step 5: Render HTML template
  console.log('🎨 Rendering HTML template...');
  const htmlContent = await renderTemplate(spec.template, {
    title: spec.title,
    content: processedContent,
    teaser: spec.teaser,
    author: spec.metadata?.author,
    date: spec.metadata?.date,
    tags: spec.metadata?.tags,
    heroImage: heroImageDataUri,
  });
  console.log('   ✓ Template rendered\n');

  // Step 6: Generate PDF
  const pdfPath = path.join(outputDir, `${spec.id}.pdf`);
  console.log('📄 Generating PDF...');

  const pdfResult = await generatePdf({
    htmlContent,
    outputPath: pdfPath,
    title: spec.title,
  });

  if (!pdfResult.success) {
    console.error(`❌ Failed to generate PDF: ${pdfResult.error}`);
    process.exit(1);
  }

  console.log(`   ✓ PDF generated: ${pdfPath}`);
  console.log(`   📊 Size: ${Math.round((pdfResult.metadata?.fileSize || 0) / 1024)}KB\n`);

  // Step 7: Validate PDF
  console.log('✅ Validating PDF...');
  const validationResult = await validatePdf({
    pdfPath,
  });

  if (!validationResult.success) {
    console.error(`❌ PDF validation failed: ${validationResult.error}`);
    process.exit(1);
  }

  console.log('   ✓ PDF is valid');
  console.log(`   📄 Pages: ${validationResult.metadata?.pageCount}`);
  console.log(`   📐 Size: ${validationResult.metadata?.dimensions}\n`);

  console.log('🎉 PDF generation complete!');
  console.log(`📍 Output: ${pdfPath}`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
