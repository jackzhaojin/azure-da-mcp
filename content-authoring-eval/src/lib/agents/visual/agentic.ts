/**
 * Visual Correctness Agent - Agentic Analysis
 *
 * Uses Claude Agent SDK with vision capabilities to analyze
 * webpage screenshots for layout quality, design issues, and visual correctness.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import { createLogger, Timer } from '@/lib/logger';
import type { VisualMetrics, AgenticAnalysisResult, VisualFinding } from './types';
import visualPrompt from '@/lib/prompts/visual.json';
import { createToolLoggingPlugin, verifyToolUsage, formatToolUsageStats } from '@/lib/tool-logging';

const logger = createLogger('agentic');

/**
 * Format visual metrics for Claude analysis
 */
export function formatVisualForPrompt(metrics: VisualMetrics): string {
  const { url, screenshot, comparison, score, viewport } = metrics;

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

  const prompt = visualPrompt.user_template
    .replace('{{url}}', url)
    .replace('{{viewport_width}}', viewport.width.toString())
    .replace('{{viewport_height}}', viewport.height.toString())
    .replace('{{screenshot_size}}', screenshot.size.toString())
    .replace('{{captured_at}}', screenshot.capturedAt)
    .replace('{{deterministic_summary}}', deterministicSummary);

  return prompt;
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
 * Calculate final weighted score (70% agentic + 30% deterministic)
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
    formula: '70% agentic + 30% deterministic',
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
    const userPrompt = formatVisualForPrompt(metrics);
    logger.debug('Prompt formatted', {
      url: metrics.url,
      promptLength: userPrompt.length,
    });

    // Read screenshot as base64 for vision analysis
    const screenshotBuffer = fs.readFileSync(metrics.screenshot.absolutePath);
    const screenshotBase64 = screenshotBuffer.toString('base64');
    logger.debug('Screenshot loaded for vision analysis', {
      path: metrics.screenshot.path,
      size: metrics.screenshot.size,
      base64Length: screenshotBase64.length,
    });

    // Create tool logging plugin to track tool usage
    const toolLogger = createToolLoggingPlugin();

    // Invoke Claude Agent SDK with streaming
    // Note: Agent SDK doesn't support multimodal yet, so we describe the screenshot in text
    logger.info('Invoking Claude Agent SDK with streaming + tool logging', {
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
    });

    // Build complete prompt with system and user messages
    const fullPrompt = `${visualPrompt.system}\n\n${userPrompt}\n\n**NOTE**: Screenshot is available at path: ${metrics.screenshot.path}\nDimensions: ${metrics.screenshot.dimensions.width}x${metrics.screenshot.dimensions.height}\nFile size: ${metrics.screenshot.size} bytes`;

    // Collect streaming messages
    const messages: string[] = [];

    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: (process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929') as 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20250929',
        maxTurns: 20, // Increased for multiple tool invocations
        settingSources: ['user', 'project'],
        allowedTools: ['Read', 'Write', 'Bash', 'mcp__playwright__browser_navigate', 'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_take_screenshot'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        plugins: [toolLogger], // PHASE 20: Add tool logging plugin
      },
    })) {
      // Collect assistant text responses
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            messages.push(block.text);
            logger.debug('Received text block from Claude', { length: block.text.length });
          }
        }
      }
    }

    logger.info('Claude Agent SDK stream completed', {
      messagesCollected: messages.length,
    });

    // PHASE 20: Verify and log tool usage
    const toolStats = toolLogger.getStats();
    const verification = verifyToolUsage(toolStats);

    logger.info('Tool usage verification', {
      passed: verification.passed,
      summary: verification.summary,
      warnings: verification.warnings,
    });

    // Log detailed tool usage stats
    logger.debug('Detailed tool usage:\n' + formatToolUsageStats(toolStats));

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
