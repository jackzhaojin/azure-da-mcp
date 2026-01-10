/**
 * Generate Blog HTML
 * Generates individual blog post HTML files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { renderTemplate } from '../utils/templateRenderer.js';
import { renderBlock } from '../utils/blockRenderer.js';
import { fetchImage } from './fetchImage.js';
import { optimizeImage } from './optimizeImage.js';
import type { BlogContent } from '../types/blogContent.js';

export interface GenerateBlogHtmlInput {
  content: BlogContent;
  outputDir: string;
  postNumber: number;
}

export interface GenerateBlogHtmlResult {
  success: boolean;
  htmlPath?: string;
  filename?: string;
  error?: string;
}

export async function generateBlogHtml(
  input: GenerateBlogHtmlInput
): Promise<GenerateBlogHtmlResult> {
  try {
    const { content, outputDir } = input;
    const postsDir = path.join(outputDir, 'posts');
    const assetsDir = path.join(outputDir, 'assets');

    await fs.mkdir(assetsDir, { recursive: true });

    let heroImageForPost = content.heroImage || '';

    // Process hero image (copied from PDF generator asset flow)
    if (content.heroImage && isRemoteUrl(content.heroImage)) {
      const heroPath = path.join(assetsDir, `hero-${content.id}.jpg`);
      const heroResult = await fetchImage({
        imageUrl: content.heroImage,
        outputPath: heroPath,
      });

      if (heroResult.success && heroResult.localPath) {
        const optimizedResult = await optimizeImage({
          imagePath: heroResult.localPath,
          outputDir: assetsDir,
          maxWidth: 1600,
          quality: 85,
          outputFilename: `hero-${content.id}-optimized.jpg`,
        });

        if (optimizedResult.success && optimizedResult.optimizedPath) {
          const heroImagePath = optimizedResult.optimizedPath;
          const heroImageRelativeToOutput = path.relative(outputDir, heroImagePath);
          const heroImageRelativeToPosts = path.relative(postsDir, heroImagePath);
          content.heroImage = heroImageRelativeToOutput;
          heroImageForPost = heroImageRelativeToPosts;
        }
      }
    }

    // Process image blocks (copied from PDF generator asset flow)
    let imageIndex = 0;
    for (const block of content.blocks) {
      if (block.type !== 'image') {
        continue;
      }

      const imageSrc = block.content?.src;
      if (!imageSrc || !isRemoteUrl(imageSrc)) {
        continue;
      }

      const imagePath = path.join(assetsDir, `image-${content.id}-${imageIndex}.jpg`);
      const fetchResult = await fetchImage({
        imageUrl: imageSrc,
        outputPath: imagePath,
      });

      if (fetchResult.success && fetchResult.localPath) {
        const optimizedResult = await optimizeImage({
          imagePath: fetchResult.localPath,
          outputDir: assetsDir,
          maxWidth: 1200,
          quality: 80,
          outputFilename: `image-${content.id}-${imageIndex}-optimized.jpg`,
        });

        if (optimizedResult.success && optimizedResult.optimizedPath) {
          block.content.src = path.relative(postsDir, optimizedResult.optimizedPath);
        }
      }

      imageIndex += 1;
    }

    // Render all blocks
    const renderedBlocks = await Promise.all(
      content.blocks.map((block) => renderBlock(block))
    );

    // Generate slug from title if not provided
    const slug = content.slug || slugify(content.title);

    // Combine blocks into content
    const blocksHtml = renderedBlocks.join('\n\n');

    // Render full blog post template
    const html = await renderTemplate('blog-post', {
      TITLE: content.title,
      TEASER: content.teaser,
      AUTHOR: content.metadata.author,
      DATE: formatDate(content.metadata.date),
      TAGS: content.metadata.tags.join(', '),
      HERO_IMAGE: heroImageForPost,
      CONTENT: blocksHtml,
    });

    // Write to file
    const filename = `${slug}.html`;
    await fs.mkdir(postsDir, { recursive: true });

    const htmlPath = path.join(postsDir, filename);
    await fs.writeFile(htmlPath, html, 'utf-8');

    return {
      success: true,
      htmlPath,
      filename,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate blog HTML',
    };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
