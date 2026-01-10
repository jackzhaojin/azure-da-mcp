/**
 * Parse Design System
 * Extracts design tokens and block definitions from Format 1 (tokens/) or Format 2 (consolidated .md)
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  ParseDesignSystemInput,
  ParseDesignSystemResult,
  DesignSystem,
  BlockDefinition,
} from '../types/designSystem.js';

export async function parseDesignSystem(
  input: ParseDesignSystemInput
): Promise<ParseDesignSystemResult> {
  try {
    if (input.format === 'consolidated') {
      return await parseConsolidatedFormat(input.path);
    } else {
      return await parseTokensFormat(input.path);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

/**
 * Format 2: Single consolidated markdown file
 */
async function parseConsolidatedFormat(
  mdPath: string
): Promise<ParseDesignSystemResult> {
  try {
    const content = await fs.readFile(mdPath, 'utf-8');

    const designSystem: DesignSystem = {
      tokens: {
        colors: {},
        typography: {},
        spacing: {},
      },
      blocks: {},
      foundations: '',
    };

    // Extract tokens from markdown sections
    extractTokensFromMarkdown(content, designSystem);

    // Extract block definitions
    extractBlocksFromMarkdown(content, designSystem);

    // Extract foundations (if present)
    const foundationsMatch = content.match(/## Foundations\s+([\s\S]*?)(?=##|$)/i);
    if (foundationsMatch) {
      designSystem.foundations = foundationsMatch[1].trim();
    }

    return {
      success: true,
      designSystem,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse consolidated format',
    };
  }
}

/**
 * Format 1: Token-based directory structure
 */
async function parseTokensFormat(dirPath: string): Promise<ParseDesignSystemResult> {
  try {
    const designSystem: DesignSystem = {
      tokens: {
        colors: {},
        typography: {},
        spacing: {},
      },
      blocks: {},
      foundations: '',
    };

    // Read tokens/tokens.css
    const tokensPath = path.join(dirPath, 'tokens/tokens.css');
    try {
      const cssContent = await fs.readFile(tokensPath, 'utf-8');
      parseCssVariables(cssContent, designSystem.tokens);
    } catch (error) {
      console.warn(`Warning: Could not read ${tokensPath}`);
    }

    // Read foundations/FOUNDATIONS.md
    const foundationsPath = path.join(dirPath, 'foundations/FOUNDATIONS.md');
    try {
      designSystem.foundations = await fs.readFile(foundationsPath, 'utf-8');
    } catch (error) {
      console.warn(`Warning: Could not read ${foundationsPath}`);
    }

    // Read blocks/*.md
    const blocksDir = path.join(dirPath, 'blocks');
    try {
      const blockFiles = await fs.readdir(blocksDir);
      for (const file of blockFiles) {
        if (file.endsWith('.md')) {
          const blockPath = path.join(blocksDir, file);
          const blockContent = await fs.readFile(blockPath, 'utf-8');
          const blockName = path.basename(file, '.md');
          designSystem.blocks[blockName] = parseBlockMarkdown(blockContent, blockName);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read blocks from ${blocksDir}`);
    }

    return {
      success: true,
      designSystem,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse tokens format',
    };
  }
}

/**
 * Extract design tokens from consolidated markdown
 */
function extractTokensFromMarkdown(content: string, designSystem: DesignSystem): void {
  // Extract color tokens
  const colorMatch = content.match(/## Color Tokens\s+([\s\S]*?)(?=##|$)/i);
  if (colorMatch) {
    const colorSection = colorMatch[1];
    const colorLines = colorSection.split('\n');
    for (const line of colorLines) {
      // Match patterns like: - Primary: #ED2224 or --color-primary: #ED2224
      const match = line.match(/[-*]\s*(?:--)?([a-z0-9-]+):\s*([#a-zA-Z0-9(),.\s]+)/i);
      if (match) {
        const [, name, value] = match;
        designSystem.tokens.colors[name.toLowerCase()] = value.trim();
      }
    }
  }

  // Extract typography tokens
  const typoMatch = content.match(/## Typography Tokens\s+([\s\S]*?)(?=##|$)/i);
  if (typoMatch) {
    const typoSection = typoMatch[1];
    const typoLines = typoSection.split('\n');
    for (const line of typoLines) {
      const match = line.match(/[-*]\s*(?:--)?([a-z0-9-]+):\s*(.+)/i);
      if (match) {
        const [, name, value] = match;
        designSystem.tokens.typography[name.toLowerCase()] = value.trim();
      }
    }
  }

  // Extract spacing tokens
  const spacingMatch = content.match(/## Spacing Tokens\s+([\s\S]*?)(?=##|$)/i);
  if (spacingMatch) {
    const spacingSection = spacingMatch[1];
    const spacingLines = spacingSection.split('\n');
    for (const line of spacingLines) {
      const match = line.match(/[-*]\s*(?:--)?([a-z0-9-]+):\s*(.+)/i);
      if (match) {
        const [, name, value] = match;
        designSystem.tokens.spacing[name.toLowerCase()] = value.trim();
      }
    }
  }
}

/**
 * Extract block definitions from consolidated markdown
 */
function extractBlocksFromMarkdown(content: string, designSystem: DesignSystem): void {
  // Find all sections that look like block definitions
  // Pattern: ### BlockName or ## BlockName
  const blockSections = content.split(/(?=###\s+[A-Z])/);

  for (const section of blockSections) {
    const headerMatch = section.match(/###\s+([A-Z][a-zA-Z]+)/);
    if (!headerMatch) continue;

    const blockName = headerMatch[1].toLowerCase();
    const blockDef = parseBlockMarkdown(section, blockName);
    designSystem.blocks[blockName] = blockDef;
  }
}

/**
 * Parse individual block markdown content
 */
function parseBlockMarkdown(content: string, blockName: string): BlockDefinition {
  const blockDef: BlockDefinition = {
    type: blockName,
    variants: [],
    properties: {},
  };

  // Extract description (first paragraph after header)
  const descMatch = content.match(/###\s+[A-Z][a-zA-Z]+\s+(.+?)(?=\n\n|$)/s);
  if (descMatch) {
    blockDef.description = descMatch[1].trim();
  }

  // Extract variants
  const variantsMatch = content.match(/Variants?:\s*(.+)/i);
  if (variantsMatch) {
    const variantsList = variantsMatch[1];
    blockDef.variants = variantsList
      .split(',')
      .map((v) => v.trim().replace(/[`'"]/g, ''))
      .filter((v) => v.length > 0);
  }

  // Extract properties from bulleted lists
  const lines = content.split('\n');
  for (const line of lines) {
    const propMatch = line.match(/[-*]\s*([a-zA-Z]+):\s*(.+)/);
    if (propMatch) {
      const [, key, value] = propMatch;
      blockDef.properties![key.toLowerCase()] = value.trim();
    }
  }

  return blockDef;
}

/**
 * Parse CSS variables from tokens.css
 */
function parseCssVariables(
  cssContent: string,
  tokens: Record<string, Record<string, string>>
): void {
  // Extract :root block
  const rootMatch = cssContent.match(/:root\s*{([^}]+)}/);
  if (!rootMatch) return;

  const variables = rootMatch[1];
  const lines = variables.split('\n');

  for (const line of lines) {
    // Match pattern: --category-name: value;
    const match = line.match(/--([a-z]+)-([a-z0-9-]+):\s*([^;]+);?/i);
    if (match) {
      const [, category, name, value] = match;
      const cat = category.toLowerCase();

      if (!tokens[cat]) {
        tokens[cat] = {};
      }

      tokens[cat][name.toLowerCase()] = value.trim();
    }
  }
}
