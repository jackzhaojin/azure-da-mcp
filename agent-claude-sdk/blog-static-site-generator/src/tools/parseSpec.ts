/**
 * Parse Spec File
 * Parses both JSON and markdown spec files into StaticSiteSpec interface
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SpecParseInput, SpecParseResult, StaticSiteSpec } from '../types/spec.js';

export async function parseSpec(input: SpecParseInput): Promise<SpecParseResult> {
  try {
    const ext = path.extname(input.specPath).toLowerCase();

    if (ext === '.json') {
      return await parseJsonSpec(input.specPath);
    } else if (ext === '.md' || ext === '.markdown') {
      return await parseMarkdownSpec(input.specPath);
    } else {
      return {
        success: false,
        error: `Unsupported spec format: ${ext}. Use .json or .md`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

async function parseJsonSpec(specPath: string): Promise<SpecParseResult> {
  try {
    const content = await fs.readFile(specPath, 'utf-8');
    const spec = JSON.parse(content) as StaticSiteSpec;

    // Validate required fields
    const validation = validateSpec(spec);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid spec: ${validation.error}`,
      };
    }

    return {
      success: true,
      spec,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse JSON spec',
    };
  }
}

async function parseMarkdownSpec(specPath: string): Promise<SpecParseResult> {
  try {
    const content = await fs.readFile(specPath, 'utf-8');
    const spec = extractSpecFromMarkdown(content);

    // Validate required fields
    const validation = validateSpec(spec);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid spec: ${validation.error}`,
      };
    }

    return {
      success: true,
      spec,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse markdown spec',
    };
  }
}

function extractSpecFromMarkdown(content: string): StaticSiteSpec {
  const lines = content.split('\n');
  const spec: Partial<StaticSiteSpec> = {
    designSystem: { path: '', format: 'consolidated' },
    content: { count: 1, theme: '', topics: [] },
    output: { directory: './output', includeLandingPage: false },
  };

  let currentSection: string | null = null;
  let collectingTopics = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.substring(3).toLowerCase();
      collectingTopics = false;
      continue;
    }

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse key-value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      switch (currentSection) {
        case 'design system':
          if (key === 'path') spec.designSystem!.path = value;
          if (key === 'format') {
            spec.designSystem!.format = value as 'consolidated' | 'tokens';
          }
          break;

        case 'content':
          if (key === 'count') spec.content!.count = parseInt(value, 10);
          if (key === 'theme') spec.content!.theme = value;
          if (key === 'topics') {
            collectingTopics = true;
          }
          break;

        case 'output':
          if (key === 'directory') spec.output!.directory = value;
          if (key === 'includeLandingPage') {
            spec.output!.includeLandingPage = value.toLowerCase() === 'true';
          }
          if (key === 'siteTitle') spec.output!.siteTitle = value;
          if (key === 'siteDescription') spec.output!.siteDescription = value;
          break;

        case 'deployment':
          if (!spec.deployment) {
            spec.deployment = {} as any;
          }
          if (key === 'storageAccount') spec.deployment!.storageAccount = value;
          if (key === 'resourceGroup') spec.deployment!.resourceGroup = value;
          if (key === 'containerName') spec.deployment!.containerName = value;
          break;
      }
    }

    // Collect list items (topics)
    if (collectingTopics && trimmed.startsWith('-')) {
      const topic = trimmed.substring(1).trim();
      spec.content!.topics.push(topic);
    }
  }

  return spec as StaticSiteSpec;
}

function validateSpec(spec: Partial<StaticSiteSpec>): { valid: boolean; error?: string } {
  // Validate design system
  if (!spec.designSystem?.path) {
    return { valid: false, error: 'Missing designSystem.path' };
  }
  if (!['consolidated', 'tokens'].includes(spec.designSystem.format)) {
    return { valid: false, error: 'Invalid designSystem.format (must be "consolidated" or "tokens")' };
  }

  // Validate content
  if (!spec.content?.count || spec.content.count < 1) {
    return { valid: false, error: 'Invalid content.count (must be >= 1)' };
  }
  if (!spec.content.theme) {
    return { valid: false, error: 'Missing content.theme' };
  }
  if (!spec.content.topics || spec.content.topics.length === 0) {
    return { valid: false, error: 'Missing content.topics (must have at least one topic)' };
  }

  // Validate output
  if (!spec.output?.directory) {
    return { valid: false, error: 'Missing output.directory' };
  }
  if (spec.output.includeLandingPage === undefined) {
    return { valid: false, error: 'Missing output.includeLandingPage' };
  }

  // Validate deployment (if provided)
  if (spec.deployment) {
    if (!spec.deployment.storageAccount) {
      return { valid: false, error: 'Missing deployment.storageAccount' };
    }
    if (!spec.deployment.resourceGroup) {
      return { valid: false, error: 'Missing deployment.resourceGroup' };
    }
  }

  return { valid: true };
}
