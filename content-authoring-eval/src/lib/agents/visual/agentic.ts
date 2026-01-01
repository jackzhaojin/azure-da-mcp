/**
 * Visual Correctness Agent - Agentic Analysis
 *
 * Uses Claude Agent SDK with vision capabilities to analyze
 * webpage screenshots for layout quality, design issues, and visual correctness.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { TextBlockParam, ImageBlockParam, DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs';
import fs from 'fs';
import { createLogger, Timer } from '@/lib/logger';
import type { VisualMetrics, AgenticAnalysisResult, VisualFinding } from './types';
import visualNoSourcePrompt from '@/lib/prompts/visual-no-source.json';
import visualHtmlSourcePrompt from '@/lib/prompts/visual-html-source.json';
import visualPdfSourcePrompt from '@/lib/prompts/visual-pdf-source.json';
import { getMCPServersConfig } from '@/lib/mcp-config';

const logger = createLogger('agentic');

/**
 * PHASE 22: Image size limits for Claude Vision API
 *
 * Claude recommends images ≤1568px on longest edge, max 5MB
 * Larger images increase token usage (~1,600 tokens per image)
 */
const VISION_API_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const VISION_API_RECOMMENDED_MAX_DIMENSION = 1568; // pixels

/**
 * Format visual metrics for Claude analysis
 */
export function formatVisualForPrompt(metrics: VisualMetrics): { system: string; user: string } {
  const { url, screenshot, comparison, score, viewport, source } = metrics;

  // Determine which prompt to use based on source type
  const sourceType = source?.type || 'none';
  const promptTemplate = sourceType === 'html' ? visualHtmlSourcePrompt :
                        sourceType === 'pdf' ? visualPdfSourcePrompt :
                        visualNoSourcePrompt;

  logger.debug('Selected visual prompt template', {
    sourceType,
    promptName: promptTemplate.name,
  });

  // Build deterministic summary
  let deterministicSummary = `**Deterministic Score**: ${score}/100\n\n`;

  if (comparison) {
    deterministicSummary += `**Pixel-Level Comparison**:\n`;
    deterministicSummary += `- Mismatched Pixels: ${comparison.mismatchedPixels.toLocaleString()} / ${comparison.totalPixels.toLocaleString()}\n`;
    deterministicSummary += `- Difference: ${comparison.diffPercentage}%\n`;
    deterministicSummary += `- Images Match: ${comparison.matches ? 'Yes' : 'No'} (threshold: ${comparison.threshold})\n`;
    if (comparison.diffImagePath) {
      deterministicSummary += `- Diff Image: ${comparison.diffImagePath}\n`;
    }
  } else {
    deterministicSummary += `**No Baseline Comparison**: Analyzing screenshot visual quality only.\n`;
  }

  // Format user prompt based on source type
  let userPrompt = promptTemplate.user_template;

  if (sourceType === 'html' && source?.url) {
    // HTML source comparison
    userPrompt = userPrompt
      .replace('{{source_url}}', source.url)
      .replace('{{migrated_url}}', url)
      .replace('{{viewport_width}}', viewport.width.toString())
      .replace('{{viewport_height}}', viewport.height.toString())
      .replace('{{timestamp}}', Date.now().toString())
      .replace('{{deterministic_summary}}', deterministicSummary);
  } else if (sourceType === 'pdf' && source?.pdfPath) {
    // PDF source comparison
    userPrompt = userPrompt
      .replace('{{pdf_path}}', source.pdfPath)
      .replace('{{migrated_url}}', url)
      .replace('{{viewport_width}}', viewport.width.toString())
      .replace('{{viewport_height}}', viewport.height.toString())
      .replace('{{deterministic_summary}}', deterministicSummary);
  } else {
    // No source comparison (legacy mode)
    userPrompt = userPrompt
      .replace('{{url}}', url)
      .replace('{{viewport_width}}', viewport.width.toString())
      .replace('{{viewport_height}}', viewport.height.toString())
      .replace('{{screenshot_size}}', screenshot.size.toString())
      .replace('{{captured_at}}', screenshot.capturedAt)
      .replace('{{deterministic_summary}}', deterministicSummary);
  }

  return {
    system: promptTemplate.system,
    user: userPrompt,
  };
}

/**
 * Parse and validate Claude's JSON response
 */
export function parseClaudeResponse(response: string): AgenticAnalysisResult {
  logger.debug('Parsing Claude response', { responseLength: response.length });

  try {
    // Claude sometimes wraps JSON in markdown code blocks
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : response;

    const parsed = JSON.parse(jsonText.trim());

    // Validate required fields
    if (!Array.isArray(parsed.findings)) {
      throw new Error('findings must be an array');
    }
    if (typeof parsed.score !== 'number') {
      throw new Error('score must be a number');
    }
    if (typeof parsed.summary !== 'string') {
      throw new Error('summary must be a string');
    }
    if (!Array.isArray(parsed.criticalIssues)) {
      throw new Error('criticalIssues must be an array');
    }
    if (!Array.isArray(parsed.minorImprovements)) {
      throw new Error('minorImprovements must be an array');
    }

    // Validate findings structure
    for (const finding of parsed.findings) {
      if (!finding.type || !finding.severity || !finding.issue || !finding.recommendation) {
        throw new Error('Each finding must have type, severity, issue, and recommendation');
      }
    }

    return {
      findings: parsed.findings as VisualFinding[],
      score: parsed.score,
      summary: parsed.summary,
      criticalIssues: parsed.criticalIssues,
      minorImprovements: parsed.minorImprovements,
    };
  } catch (error) {
    logger.error('Failed to parse Claude response', error as Error, {
      responseLength: response.length,
      responsePreview: response.substring(0, 200),
    });
    throw new Error(`Invalid Claude response format: ${(error as Error).message}`);
  }
}

/**
 * Calculate final weighted score (70% Vision API insights + 30% pixel diff)
 *
 * PHASE 22: Vision API provides semantic visual analysis (layout shifts, color changes,
 * missing elements) while pixel diff provides quantitative metrics.
 */
export function calculateFinalScore(
  agenticScore: number,
  deterministicScore: number
): number {
  const weighted = Math.round(agenticScore * 0.7 + deterministicScore * 0.3);
  logger.debug('Final score calculated', {
    agenticScore,
    deterministicScore,
    weighted,
    formula: '70% Vision API insights + 30% pixel diff',
  });
  return weighted;
}

/**
 * Calculate grade from score
 */
export function calculateGrade(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'needs-improvement';
  return 'critical';
}

/**
 * Main agentic visual analysis function using Claude Agent SDK with vision
 */
export async function analyzeVisualWithClaude(
  metrics: VisualMetrics
): Promise<AgenticAnalysisResult> {
  const timer = new Timer();
  logger.info('Starting agentic visual analysis', { url: metrics.url });

  try {
    // Verify OAuth token
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      const error = new Error('CLAUDE_CODE_OAUTH_TOKEN not found in environment');
      logger.error('OAuth token missing', error);
      throw error;
    }

    // Format prompt with visual metrics
    const prompts = formatVisualForPrompt(metrics);
    logger.debug('Prompt formatted', {
      url: metrics.url,
      sourceType: metrics.source?.type || 'none',
      systemLength: prompts.system.length,
      userLength: prompts.user.length,
    });

    // PHASE 36: Screenshots already captured by deterministic analysis
    // No need to capture here - just read and analyze with Vision API
    logger.info('PHASE 36: Using screenshots from deterministic analysis', {
      migratedScreenshot: metrics.screenshot.absolutePath,
      migratedSize: metrics.screenshot.size,
      baselineScreenshot: metrics.baselineScreenshot?.absolutePath,
      baselineSize: metrics.baselineScreenshot?.size,
      sourceType: metrics.source?.type,
    });

    // Verify screenshots exist
    if (!fs.existsSync(metrics.screenshot.absolutePath)) {
      throw new Error(`Migrated screenshot not found: ${metrics.screenshot.absolutePath}`);
    }
    if (metrics.baselineScreenshot && !fs.existsSync(metrics.baselineScreenshot.absolutePath)) {
      logger.warn('Baseline screenshot not found, continuing without comparison', {
        expectedPath: metrics.baselineScreenshot.absolutePath,
      });
    }

    // PHASE 22: Read screenshot as base64 for Vision API integration
    const screenshotBuffer = fs.readFileSync(metrics.screenshot.absolutePath);
    const screenshotBase64 = screenshotBuffer.toString('base64');

    // PHASE 22: Validate image size for Vision API
    if (metrics.screenshot.size > VISION_API_MAX_SIZE_BYTES) {
      logger.warn('Screenshot exceeds Vision API recommended size', {
        size: metrics.screenshot.size,
        maxSize: VISION_API_MAX_SIZE_BYTES,
        recommendation: 'Consider resizing screenshot to reduce token usage',
      });
    }

    if (metrics.screenshot.dimensions.width > VISION_API_RECOMMENDED_MAX_DIMENSION ||
        metrics.screenshot.dimensions.height > VISION_API_RECOMMENDED_MAX_DIMENSION) {
      logger.warn('Screenshot dimensions exceed Vision API recommendations', {
        dimensions: metrics.screenshot.dimensions,
        recommendedMax: VISION_API_RECOMMENDED_MAX_DIMENSION,
        recommendation: 'Consider resizing to reduce token usage (~1,600 tokens per image)',
      });
    }

    logger.debug('Screenshot loaded for vision analysis', {
      path: metrics.screenshot.path,
      size: metrics.screenshot.size,
      base64Length: screenshotBase64.length,
      dimensions: metrics.screenshot.dimensions,
      estimatedTokens: Math.round(screenshotBase64.length / 1000) + 1600, // Rough estimate
    });

    // PHASE 22: Determine image media type from file extension (properly typed for Agent SDK)
    const mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' =
      metrics.screenshot.path.endsWith('.png') ? 'image/png' :
      metrics.screenshot.path.endsWith('.gif') ? 'image/gif' :
      metrics.screenshot.path.endsWith('.webp') ? 'image/webp' :
      'image/jpeg';

    // Track tool usage
    let toolCallCount = 0;

    // PHASE 22: Invoke Claude Agent SDK with multimodal vision support
    logger.info('Invoking Claude Agent SDK with Vision API (multimodal)', {
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      visionEnabled: true,
      screenshotSize: metrics.screenshot.size,
      mediaType,
    });

    // PHASE 36: Build multimodal content with Claude native capabilities
    // Support: PDF documents (native), multiple images (baseline + migrated)
    const content: Array<TextBlockParam | ImageBlockParam | DocumentBlockParam> = [
      {
        type: 'text' as const,
        text: `${prompts.system}\n\n${prompts.user}`,
      },
    ];

    // Add baseline comparison based on source type
    if (metrics.source?.type === 'html' && metrics.baselineScreenshot && metrics.baselineScreenshot.size > 0) {
      // HTML source: Add baseline screenshot
      const baselineBuffer = fs.readFileSync(metrics.baselineScreenshot.absolutePath);
      const baselineBase64 = baselineBuffer.toString('base64');

      logger.info('Adding baseline HTML screenshot for comparison', {
        size: metrics.baselineScreenshot.size,
        url: metrics.source.url,
      });

      content.push({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType,
          data: baselineBase64,
        },
      });
    } else if (metrics.source?.type === 'pdf' && metrics.source.pdfPath) {
      // PDF source: Add PDF document (Claude native PDF support)
      logger.info('Adding PDF document for comparison', {
        pdfPath: metrics.source.pdfPath,
      });

      // Check if PDF is a URL or local file
      if (metrics.source.pdfPath.startsWith('http')) {
        // URL-based PDF - Claude can fetch it
        content.push({
          type: 'document' as const,
          source: {
            type: 'url' as const,
            url: metrics.source.pdfPath,
          },
        });
      } else {
        // Local PDF file - read and encode as base64
        try {
          const pdfBuffer = fs.readFileSync(metrics.source.pdfPath);
          const pdfBase64 = pdfBuffer.toString('base64');

          content.push({
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: pdfBase64,
            },
          });
        } catch (error) {
          logger.warn('Failed to read PDF file, skipping PDF comparison', {
            pdfPath: metrics.source.pdfPath,
            error: (error as Error).message,
          });
        }
      }
    }

    // Add migrated page screenshot (always included)
    content.push({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mediaType,
        data: screenshotBase64,
      },
    });

    logger.info('Multimodal content prepared', {
      totalItems: content.length,
      hasBaseline: metrics.source?.type === 'html' && metrics.baselineScreenshot && metrics.baselineScreenshot.size > 0,
      hasPDF: metrics.source?.type === 'pdf',
    });

    // PHASE 36: Create multimodal message generator
    const generateMultimodalMessage = async function* () {
      yield {
        type: 'user' as const,
        session_id: '',
        parent_tool_use_id: null,
        message: {
          role: 'user' as const,
          content,
        },
      };
    };

    // Collect streaming messages
    const messages: string[] = [];

    // PHASE 25: Use Agent SDK query() with programmatic MCP configuration
    for await (const message of query({
      prompt: generateMultimodalMessage(),
      options: {
        model: (process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929') as 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20250929',
        maxTurns: 20, // Increased for multiple tool invocations
        // PHASE 25: Remove settingSources - use programmatic MCP config instead
        // settingSources: ['user', 'project'],
        // PHASE 25: Configure MCP servers programmatically (environment-aware paths)
        // Use getMCPServersConfig() to get correct paths for Docker vs local development
        mcpServers: getMCPServersConfig(),
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
      },
    })) {
      // Collect assistant responses and count tool usage
      if (message.type === 'assistant' && 'message' in message && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            messages.push(block.text);
          }
          if (block.type === 'tool_use') {
            toolCallCount++;
          }
        }
      }
    }

    // Create tool stats for metadata
    const toolStats = {
      totalInvocations: toolCallCount,
      toolCounts: {},
    };

    const verification = {
      passed: toolCallCount > 0,
      summary: `Total invocations: ${toolCallCount}`,
      warnings: toolCallCount === 0 ? ['❌ CRITICAL: No tools invoked'] : [],
    };

    logger.info('Agent SDK stream completed', {
      messagesCollected: messages.length,
      toolCalls: toolCallCount,
      toolsUsed: verification.passed
    });

    if (!verification.passed) {
      logger.warn('⚠️ Agent completed without using tools', {
        totalInvocations: toolCallCount,
        expectedTools: 'Playwright (browser_navigate, browser_take_screenshot) OR Read (screenshot file)',
        fallbackMode: 'Continuing with deterministic-metrics-only analysis',
      });
    }

    // Combine all messages into single response text
    const responseText = messages.join('\n');

    if (!responseText) {
      logger.error('No response received from Claude Agent SDK');
      throw new Error('No response received from Claude Agent SDK');
    }

    // Parse response
    const result = parseClaudeResponse(responseText);
    logger.info('Claude response parsed successfully', {
      score: result.score,
      findingsCount: result.findings.length,
      criticalIssuesCount: result.criticalIssues.length,
    });

    logger.operationComplete('Agentic visual analysis', timer.elapsed(), {
      url: metrics.url,
      score: result.score,
      findingsCount: result.findings.length,
      toolInvocations: toolStats.totalInvocations,
      toolsUsed: Object.keys(toolStats.toolCounts).join(', '),
    });

    // Add tool usage metadata to result
    return {
      ...result,
      metadata: {
        toolUsage: {
          totalInvocations: toolStats.totalInvocations,
          toolCounts: toolStats.toolCounts,
          verified: verification.passed,
          warnings: verification.warnings,
        },
      },
    };
  } catch (error) {
    logger.error('Agentic visual analysis failed', error as Error, {
      url: metrics.url,
      duration: timer.elapsed(),
    });
    throw error;
  }
}
