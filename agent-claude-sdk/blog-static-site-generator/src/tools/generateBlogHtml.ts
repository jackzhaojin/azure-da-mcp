/**
 * Generate Blog HTML
 * Generates individual blog post HTML files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { renderTemplate } from '../utils/templateRenderer.js';
import { renderBlock } from '../utils/blockRenderer.js';
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
      CONTENT: blocksHtml,
    });

    // Write to file
    const filename = `${slug}.html`;
    const postsDir = path.join(outputDir, 'posts');
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
