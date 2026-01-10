/**
 * Generate Landing Page
 * Creates index.html with featured post and blog grid
 */

import { promises as fs } from 'fs';
import path from 'path';
import { renderTemplate } from '../utils/templateRenderer.js';
import type { BlogContent } from '../types/blogContent.js';

export interface BlogPageInfo {
  title: string;
  teaser: string;
  filename: string;
  date: string;
  tags: string[];
  heroImage?: string;
}

export interface GenerateLandingPageInput {
  blogPages: BlogPageInfo[];
  siteTitle: string;
  siteDescription?: string;
  outputDir: string;
}

export interface GenerateLandingPageResult {
  success: boolean;
  indexPath?: string;
  error?: string;
}

export async function generateLandingPage(
  input: GenerateLandingPageInput
): Promise<GenerateLandingPageResult> {
  try {
    const { blogPages, siteTitle, siteDescription, outputDir } = input;

    if (blogPages.length === 0) {
      return {
        success: false,
        error: 'No blog pages to display on landing page',
      };
    }

    // Select featured post (first one)
    const featuredPost = blogPages[0];

    // Render featured post component
    const featuredHtml = await renderTemplate('components/featured-post', {
      TITLE: featuredPost.title,
      TEASER: featuredPost.teaser,
      LINK: `posts/${featuredPost.filename}`,
      IMAGE: featuredPost.heroImage || '',
    });

    // Render blog cards for remaining posts
    const cardPromises = blogPages.slice(1).map((post) =>
      renderTemplate('components/blog-card', {
        TITLE: post.title,
        TEASER: post.teaser,
        LINK: `posts/${post.filename}`,
        DATE: formatDate(post.date),
        TAGS: post.tags.join(', '),
      })
    );

    const cards = await Promise.all(cardPromises);
    const blogGridHtml = cards.join('\n');

    // Render landing page
    const landingHtml = await renderTemplate('landing-page', {
      SITE_TITLE: siteTitle || 'Blog',
      SITE_DESCRIPTION: siteDescription || '',
      FEATURED_POST: featuredHtml,
      BLOG_GRID: blogGridHtml,
    });

    // Write to index.html
    const indexPath = path.join(outputDir, 'index.html');
    await fs.writeFile(indexPath, landingHtml, 'utf-8');

    return {
      success: true,
      indexPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate landing page',
    };
  }
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}
