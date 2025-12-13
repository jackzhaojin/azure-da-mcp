/**
 * Blog PDF Generator - Agent SDK Version
 * Uses Claude Agent SDK with autonomous tool selection
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs/promises';
import { loadPrompt } from './utils/promptLoader.js';

export interface BlogPdfSpec {
  id: string;
  title: string;
  content: string;
  teaser?: string;
  template?: 'basic' | 'featured';
  heroImage?: string;
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

/**
 * Generate a blog PDF using Claude Agent SDK
 * Claude autonomously decides which tools to use and in what order
 */
export async function generateBlogPdfWithAgent(
  spec: BlogPdfSpec,
  outputDir: string
): Promise<PdfGenerationResult> {
  const messages: string[] = [];

  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    const assetsDir = path.join(outputDir, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });

    // Save spec to a temporary file for Claude to read
    const specPath = path.join(outputDir, `${spec.id}-spec.json`);
    await fs.writeFile(specPath, JSON.stringify(spec, null, 2));

    messages.push('Starting Agent SDK PDF generation...');
    messages.push(`Spec saved to: ${specPath}`);

    // Load prompt template
    const prompt = await loadPrompt('agent-sdk-pdf-generation', {
      SPEC_PATH: specPath,
      OUTPUT_DIR: outputDir,
      PROJECT_ROOT: process.cwd(),
      SPEC_ID: spec.id,
    });

    const abortController = new AbortController();
    let lastAssistantMessage = '';
    let agentMessages: SDKMessage[] = [];

    const queryIterator = query({
      prompt,
      options: {
        cwd: process.cwd(), // Work from project root
        abortController,
        maxTurns: 50, // Allow enough turns for complex workflows
        model: 'claude-sonnet-4-5-20250929',
        allowedTools: [
          'Bash',      // Run commands, execute our tools
          'Read',      // Read spec file, templates
          'Write',     // Write intermediate files if needed
          'Glob',      // Find templates
          'TodoWrite', // Track progress (optional)
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
          lastAssistantMessage = textContent;
          messages.push(`Agent: ${textContent.substring(0, 200)}...`);
        }

        // Check for tool use
        const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
        if (toolUses.length > 0) {
          toolUses.forEach((tool: any) => {
            messages.push(`Tool: ${tool.name}`);
          });
        }
      } else if (message.type === 'result') {
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.subtype === 'success') {
          messages.push('✓ Agent completed successfully');
        } else {
          messages.push(`✗ Agent error: ${resultMsg.subtype}`);
        }
      }
    }

    // Check if PDF was generated
    const pdfPath = path.join(outputDir, `${spec.id}.pdf`);
    const pdfExists = await fs.access(pdfPath).then(() => true).catch(() => false);

    if (pdfExists) {
      // Get PDF stats
      const stats = await fs.stat(pdfPath);
      messages.push(`✓ PDF generated: ${pdfPath}`);
      messages.push(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

      return {
        success: true,
        pdfPath,
        messages,
      };
    } else {
      return {
        success: false,
        error: 'Agent completed but PDF was not found',
        messages,
      };
    }
  } catch (error) {
    messages.push(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      messages,
    };
  }
}
