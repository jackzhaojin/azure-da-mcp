/**
 * Content Generator
 * Uses Agent SDK to generate blog content JSON files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadPrompt } from './utils/promptLoader.js';
import type { BlogContent } from './types/blogContent.js';
import type { DesignSystem } from './types/designSystem.js';

export interface ContentGenerationConfig {
  count: number;
  theme: string;
  topics: string[];
  designSystem: DesignSystem;
  outputDir: string;
}

export interface ContentGenerationResult {
  success: boolean;
  contents?: BlogContent[];
  error?: string;
  messages: string[];
}

export async function generateBlogContents(
  config: ContentGenerationConfig
): Promise<ContentGenerationResult> {
  const messages: string[] = [];

  try {
    // Prepare prompt
    const availableBlocks = Object.keys(config.designSystem.blocks).join(', ');
    const prompt = await loadPrompt('blog-content-generation', {
      COUNT: config.count.toString(),
      THEME: config.theme,
      TOPICS: config.topics.join(', '),
      AVAILABLE_BLOCKS: availableBlocks,
    });

    messages.push('Starting AI content generation...');

    // Create temp directory for JSON files
    const tempDir = path.join(config.outputDir, '.temp-content');
    await fs.mkdir(tempDir, { recursive: true });

    // Run Agent SDK
    const abortController = new AbortController();
    const queryIterator = query({
      prompt,
      options: {
        cwd: tempDir,
        abortController,
        maxTurns: 50,
        model: process.env.MODEL || 'claude-sonnet-4-5-20250929',
        allowedTools: ['Write', 'Read'],
      },
    });

    // Process streaming results
    for await (const event of queryIterator) {
      // Agent SDK events - just consume them
      if (event.type) {
        // Event processed
      }
    }

    messages.push('Content generation complete. Loading generated files...');

    // Load generated JSON files
    const contents: BlogContent[] = [];
    const files = await fs.readdir(tempDir);

    for (const file of files) {
      if (file.endsWith('.json') && file.startsWith('blog-content-')) {
        const filePath = path.join(tempDir, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const blogContent = JSON.parse(fileContent) as BlogContent;
        contents.push(blogContent);
      }
    }

    if (contents.length === 0) {
      return {
        success: false,
        error: 'No blog content files were generated',
        messages,
      };
    }

    messages.push(`Loaded ${contents.length} blog posts`);

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      success: true,
      contents,
      messages,
    };
  } catch (error) {
    messages.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Content generation failed',
      messages,
    };
  }
}
