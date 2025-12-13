/**
 * Blog Spec Generator - Agent SDK Version
 * Generates BlogPdfSpec JSON files from configuration using Claude
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs/promises';
import { loadPrompt } from './utils/promptLoader.js';

export interface SpecGenerationConfig {
  generation: {
    count: number;
    theme: string;
    description?: string;
    topics: string[];
    variety: 'low' | 'medium' | 'high';
    contentDepth: 'brief' | 'detailed';
    wordCountRange?: {
      min: number;
      max: number;
    };
  };
  templates: {
    distribution: {
      basic: number;
      featured: number;
    };
  };
  media: {
    includeImages: boolean;
    averageImageCount: number; // 1-4 images per blog on average
    includeYouTube: number; // 0-100 percentage chance of including YouTube video
  };
  output: {
    directory: string;
    filenamePattern: string;
  };
  metadata?: {
    author?: string;
    datePattern?: string;
    tagSets?: string[][];
  };
}

export interface SpecGenerationResult {
  success: boolean;
  specsGenerated: number;
  outputDirectory: string;
  files: string[];
  error?: string;
  messages: string[];
}

/**
 * Generate blog specs using Claude Agent SDK
 * Claude autonomously creates N BlogPdfSpec JSON files from config
 */
export async function generateBlogSpecs(
  configPath: string
): Promise<SpecGenerationResult> {
  const messages: string[] = [];

  try {
    // Read and validate config
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: SpecGenerationConfig = JSON.parse(configContent);

    messages.push('Starting Spec Generation with Agent SDK...');
    messages.push(`Config: ${configPath}`);
    messages.push(`Target: ${config.generation.count} blog specs`);
    messages.push(`Theme: ${config.generation.theme}`);

    // Ensure output directory exists
    const outputDir = path.resolve(config.output.directory);
    await fs.mkdir(outputDir, { recursive: true });
    messages.push(`Output directory: ${outputDir}`);

    // Load prompt template
    const prompt = await loadPrompt('spec-generation', {
      CONFIG_PATH: configPath,
      COUNT: config.generation.count.toString(),
      OUTPUT_DIR: outputDir,
      FILENAME_PATTERN: config.output.filenamePattern,
    });

    const abortController = new AbortController();
    let agentMessages: SDKMessage[] = [];
    let specsGenerated = 0;

    const queryIterator = query({
      prompt,
      options: {
        cwd: process.cwd(),
        abortController,
        maxTurns: 100, // Allow enough turns for many specs
        model: 'claude-sonnet-4-5-20250929',
        allowedTools: [
          'Read',   // Read config file
          'Write',  // Write spec JSON files
          'Bash',   // Validation if needed
        ],
      },
    });

    // Process streaming messages
    for await (const message of queryIterator) {
      agentMessages.push(message);

      if (message.type === 'assistant') {
        const textContent = message.message.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => (c.type === 'text' ? c.text : ''))
          .join('');

        if (textContent) {
          const logMsg = `Agent: ${textContent.substring(0, 200)}...`;
          messages.push(logMsg);
          console.log(logMsg); // Real-time output
        }

        // Check for tool use
        const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
        if (toolUses.length > 0) {
          toolUses.forEach((tool: any) => {
            const toolMsg = `Tool: ${tool.name}`;
            messages.push(toolMsg);
            console.log(toolMsg); // Real-time output

            // Track spec file writes
            if (tool.name === 'Write' && tool.input.file_path?.includes('.json')) {
              specsGenerated++;
              const progressMsg = `  → Generated spec ${specsGenerated}/${config.generation.count}`;
              messages.push(progressMsg);
              console.log(progressMsg); // Real-time output
            }
          });
        }
      } else if (message.type === 'result') {
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.subtype === 'success') {
          const successMsg = '✓ Agent completed successfully';
          messages.push(successMsg);
          console.log(successMsg); // Real-time output
        } else {
          const errorMsg = `✗ Agent error: ${resultMsg.subtype}`;
          messages.push(errorMsg);
          console.log(errorMsg); // Real-time output
        }
      }
    }

    // Check generated files
    const files = await fs.readdir(outputDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    messages.push(`\n✓ Spec generation complete`);
    messages.push(`  Generated: ${jsonFiles.length} spec files`);
    messages.push(`  Location: ${outputDir}`);

    if (jsonFiles.length !== config.generation.count) {
      messages.push(`⚠ Warning: Expected ${config.generation.count} files, got ${jsonFiles.length}`);
    }

    return {
      success: jsonFiles.length > 0,
      specsGenerated: jsonFiles.length,
      outputDirectory: outputDir,
      files: jsonFiles.sort(),
      messages,
    };
  } catch (error) {
    messages.push(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      success: false,
      specsGenerated: 0,
      outputDirectory: '',
      files: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      messages,
    };
  }
}

/**
 * Validate a generated spec file
 */
export async function validateSpec(specPath: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const content = await fs.readFile(specPath, 'utf-8');
    const spec = JSON.parse(content);

    // Required fields
    if (!spec.id) errors.push('Missing required field: id');
    if (!spec.title) errors.push('Missing required field: title');
    if (!spec.content) errors.push('Missing required field: content');

    // Template validation
    if (spec.template && !['basic', 'featured'].includes(spec.template)) {
      errors.push(`Invalid template: ${spec.template} (must be 'basic' or 'featured')`);
    }

    // Hero image required for featured template
    if (spec.template === 'featured' && !spec.heroImage) {
      errors.push('Featured template requires heroImage field');
    }

    // Arrays should be arrays
    if (spec.images && !Array.isArray(spec.images)) {
      errors.push('images field must be an array');
    }
    if (spec.youtube && !Array.isArray(spec.youtube)) {
      errors.push('youtube field must be an array');
    }

    // Metadata
    if (spec.metadata) {
      if (spec.metadata.tags && !Array.isArray(spec.metadata.tags)) {
        errors.push('metadata.tags must be an array');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    errors.push(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      valid: false,
      errors,
    };
  }
}

/**
 * Validate all specs in a directory
 */
export async function validateAllSpecs(directory: string): Promise<{
  totalFiles: number;
  validFiles: number;
  errors: Record<string, string[]>;
}> {
  const files = await fs.readdir(directory);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const errors: Record<string, string[]> = {};
  let validFiles = 0;

  for (const file of jsonFiles) {
    const specPath = path.join(directory, file);
    const validation = await validateSpec(specPath);

    if (validation.valid) {
      validFiles++;
    } else {
      errors[file] = validation.errors;
    }
  }

  return {
    totalFiles: jsonFiles.length,
    validFiles,
    errors,
  };
}
