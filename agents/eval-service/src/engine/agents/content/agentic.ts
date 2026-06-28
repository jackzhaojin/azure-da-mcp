/**
 * Content Fidelity Agent - Agentic Analysis (Claude Agent SDK)
 *
 * Uses Claude Agent SDK to perform semantic content analysis,
 * assessing intent alignment, tone preservation, and meaning accuracy.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { requireAgentAuth, agenticAbort } from '@/lib/agent-auth';
import { createLogger, Timer } from '@/lib/logger';
import { extractJsonText } from '@/lib/extract-json';
import type { ContentMetrics, AgenticAnalysisResult, ContentAnalysisResult, ContentFinding } from './types';
import contentPdfSourcePrompt from '@/lib/prompts/content-pdf-source.json';
import contentHtmlSourcePrompt from '@/lib/prompts/content-html-source.json';
import contentNoSourcePrompt from '@/lib/prompts/content-no-source.json';
import { getMCPServersConfig } from '@/lib/mcp-config';
import type { ContentQualityMetrics } from './deterministic';

const logger = createLogger('agentic');

/**
 * Format content metrics for Claude prompt
 *
 * @param metrics - Content metrics for both source and migrated content
 * @param sourceType - Type of source ('pdf' or 'html')
 */
function formatContentForPrompt(
  metrics: ContentMetrics,
  sourceType: 'pdf' | 'html' = 'pdf'
): { systemPrompt: string; userPrompt: string } {
  const { pdfContent, webpageContent, diff } = metrics;

  // Select prompt template based on source type
  const promptTemplate = sourceType === 'html' ? contentHtmlSourcePrompt : contentPdfSourcePrompt;

  // Format source headings
  const sourceHeadings = pdfContent.headings.length > 0
    ? pdfContent.headings.slice(0, 20).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : 'No headings extracted';

  // Format migrated/webpage headings
  const migratedHeadings = webpageContent.headings.length > 0
    ? webpageContent.headings.slice(0, 20).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : 'No headings found';

  // Truncate text samples
  const sourceTextSample = pdfContent.text.substring(0, 2000);
  const migratedTextSample = webpageContent.text.substring(0, 2000);

  // Format missing content examples
  const missingExamples = diff.missing.length > 0
    ? diff.missing.slice(0, 5).map((s, i) => `${i + 1}. "${s}"`).join('\n')
    : 'No missing content detected';

  // Format extra content examples
  const extraExamples = diff.extra.length > 0
    ? diff.extra.slice(0, 5).map((s, i) => `${i + 1}. "${s}"`).join('\n')
    : 'No extra content detected';

  // Build full prompt using template
  let userPrompt = promptTemplate.user_template;

  if (sourceType === 'html') {
    // HTML→HTML template variables
    userPrompt = userPrompt
      .replace('{{source_url}}', metrics.pdfUrl) // pdfUrl field holds source URL for both types
      .replace('{{migrated_url}}', metrics.migratedUrl)
      .replace('{{source_headings}}', sourceHeadings)
      .replace('{{source_text_sample}}', sourceTextSample)
      .replace('{{source_words}}', pdfContent.wordCount.toString())
      .replace('{{source_headings_count}}', pdfContent.headings.length.toString())
      .replace('{{migrated_headings}}', migratedHeadings)
      .replace('{{migrated_text_sample}}', migratedTextSample)
      .replace('{{migrated_words}}', webpageContent.wordCount.toString())
      .replace('{{migrated_headings_count}}', webpageContent.headings.length.toString())
      .replace('{{similarity_score}}', diff.similarityScore.toString())
      .replace('{{missing_count}}', diff.missing.length.toString())
      .replace('{{extra_count}}', diff.extra.length.toString())
      .replace('{{missing_examples}}', missingExamples)
      .replace('{{extra_examples}}', extraExamples);
  } else {
    // PDF→HTML template variables (original)
    const pdfMetadata = pdfContent.metadata
      ? `Title: ${pdfContent.metadata.title || 'N/A'}
Author: ${pdfContent.metadata.author || 'N/A'}
Subject: ${pdfContent.metadata.subject || 'N/A'}
Created: ${pdfContent.metadata.creationDate || 'N/A'}`
      : 'No metadata available';

    userPrompt = userPrompt
      .replace('{{pdf_metadata}}', pdfMetadata)
      .replace('{{pdf_headings}}', sourceHeadings)
      .replace('{{pdf_text_sample}}', sourceTextSample)
      .replace('{{pdf_pages}}', pdfContent.numPages.toString())
      .replace('{{pdf_words}}', pdfContent.wordCount.toString())
      .replace('{{pdf_headings_count}}', pdfContent.headings.length.toString())
      .replace('{{webpage_headings}}', migratedHeadings)
      .replace('{{webpage_text_sample}}', migratedTextSample)
      .replace('{{webpage_words}}', webpageContent.wordCount.toString())
      .replace('{{webpage_headings_count}}', webpageContent.headings.length.toString())
      .replace('{{similarity_score}}', diff.similarityScore.toString())
      .replace('{{missing_count}}', diff.missing.length.toString())
      .replace('{{extra_count}}', diff.extra.length.toString())
      .replace('{{missing_examples}}', missingExamples)
      .replace('{{extra_examples}}', extraExamples);
  }

  return {
    systemPrompt: promptTemplate.system,
    userPrompt,
  };
}

/**
 * Parse Claude's response and validate structure
 */
function parseClaudeResponse(responseText: string): AgenticAnalysisResult {
  logger.debug('Parsing Claude response', { length: responseText.length });

  try {
    // Tolerate fenced, pure, or prose-wrapped JSON (see extract-json.ts).
    const jsonText = extractJsonText(responseText);

    const parsed = JSON.parse(jsonText) as {
      findings: Array<{
        type: string;
        severity: string;
        issue: string;
        recommendation: string;
        snippet?: string;
      }>;
      score: number;
      summary: string;
      strengths?: string[];
      criticalGaps: string[];
      minorImprovements: string[];
    };

    // Validate required fields
    if (!Array.isArray(parsed.findings)) {
      throw new Error('Response missing findings array');
    }
    if (typeof parsed.score !== 'number') {
      throw new Error('Response missing score');
    }
    if (typeof parsed.summary !== 'string') {
      throw new Error('Response missing summary');
    }

    // Map to AgenticAnalysisResult
    const findings: ContentFinding[] = parsed.findings.map((finding) => ({
      type: finding.type as ContentFinding['type'],
      severity: finding.severity as ContentFinding['severity'],
      issue: finding.issue,
      recommendation: finding.recommendation,
      snippet: finding.snippet,
    }));

    return {
      findings,
      score: Math.max(0, Math.min(100, parsed.score)), // Clamp to 0-100
      summary: parsed.summary,
      strengths: (parsed.strengths as string[] | undefined) || [],
      criticalGaps: parsed.criticalGaps || [],
      minorImprovements: parsed.minorImprovements || [],
    };
  } catch (error) {
    logger.error('Failed to parse Claude response', error as Error, { responseText: responseText.substring(0, 500) });
    throw new Error(`Invalid response format: ${(error as Error).message}`);
  }
}

/**
 * Calculate final weighted score
 */
function calculateFinalScore(agenticScore: number, deterministicScore: number): number {
  // 70% agentic (semantic analysis) + 30% deterministic (text similarity)
  const weighted = Math.round(agenticScore * 0.7 + deterministicScore * 0.3);
  return Math.max(0, Math.min(100, weighted)); // Clamp to 0-100
}

/**
 * Calculate grade from score
 */
function calculateGrade(score: number): ContentAnalysisResult['grade'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'needs-improvement';
  return 'critical';
}

/**
 * Analyze content fidelity with Claude Agent SDK
 *
 * @param sourceUrl - URL or path of the source content (PDF URL or HTML URL)
 * @param migratedUrl - URL of the migrated webpage
 * @param deterministicMetrics - Deterministic content metrics
 * @param sourceType - Type of source ('pdf' or 'html')
 */
export async function analyzeContentWithClaude(
  sourceUrl: string,
  migratedUrl: string,
  deterministicMetrics: ContentMetrics,
  sourceType: 'pdf' | 'html' = 'pdf'
): Promise<ContentAnalysisResult> {
  const timer = new Timer();
  logger.info('Starting agentic content analysis', { sourceUrl, migratedUrl, sourceType });

  try {
    requireAgentAuth();

    // Format metrics for Claude
    const prompts = formatContentForPrompt(deterministicMetrics, sourceType);
    const userPrompt = prompts.userPrompt;
    const systemPromptText = prompts.systemPrompt;

    logger.debug('Formatted prompts', {
      userPromptLength: userPrompt.length,
      systemPromptLength: systemPromptText.length
    });

    // Collect streaming messages and track tool usage
    const messages: string[] = [];
    let toolCallCount = 0;

    logger.info('Invoking Claude Agent SDK');

    // Get environment-aware MCP server configuration
    const mcpServers = getMCPServersConfig();

    // Stream messages from Claude with tool access (deadline-bounded — a hung
    // turn would otherwise hold a browser permit forever, see agent-auth.ts)
    const deadline = agenticAbort('content');
    try {
      for await (const message of query({
        prompt: userPrompt,
        options: {
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
          maxTurns: 20,
          systemPrompt: systemPromptText,
          mcpServers,
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          cwd: process.cwd(),
          abortController: deadline.controller,
        }
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
    } finally {
      deadline.done();
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
      });
    }

    // Combine all messages into single response text
    const responseText = messages.join('\n');

    logger.debug('Combined Claude response', { totalLength: responseText.length });

    // Parse and validate response
    const agenticResult = parseClaudeResponse(responseText);

    logger.info('Response parsed successfully', {
      findingsCount: agenticResult.findings.length,
      agenticScore: agenticResult.score,
    });

    // Calculate final weighted score
    const finalScore = calculateFinalScore(agenticResult.score, deterministicMetrics.score);
    const grade = calculateGrade(finalScore);

    logger.info('Final score calculated', {
      agenticScore: agenticResult.score,
      deterministicScore: deterministicMetrics.score,
      finalScore,
      grade,
    });

    const result: ContentAnalysisResult = {
      pdfUrl: sourceUrl, // Keep field name for backward compatibility
      migratedUrl,
      deterministic: deterministicMetrics,
      agentic: agenticResult,
      finalScore,
      grade,
      timestamp: new Date().toISOString(),
      mode: 'full',
      metadata: {
        deterministic: deterministicMetrics.metadata,
        agentic: {
          executedAt: new Date().toISOString(),
          durationMs: timer.elapsed(),
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        },
        toolUsage: {
          totalInvocations: toolStats.totalInvocations,
          toolCounts: toolStats.toolCounts,
          verified: verification.passed,
          warnings: verification.warnings,
        },
      },
    };

    logger.operationComplete('Agentic content analysis', timer.elapsed(), {
      finalScore,
      grade,
      findingsCount: agenticResult.findings.length,
      toolInvocations: toolStats.totalInvocations,
      toolsUsed: Object.keys(toolStats.toolCounts).join(', '),
    });

    return result;
  } catch (error) {
    logger.error('Agentic content analysis failed', error as Error, { sourceUrl, migratedUrl, duration: timer.elapsed() });
    throw error;
  }
}

/** Result of an intrinsic content-quality pass (quality mode — no source fidelity). */
export interface ContentQualityResult {
  finalScore: number;
  agentic: AgenticAnalysisResult;
  timestamp: string;
}

/**
 * Score the intrinsic editorial quality of a page ON ITS OWN MERITS (quality mode).
 * No source comparison — judges substance, coherence, completeness, expertise, and
 * structure of the provided article text. Tool-free (judges the supplied content),
 * so it holds no browser permit. Blends the editor's score with the deterministic
 * substance proxy as a floor. Falls back (throws → caller uses the coarse score)
 * when no Claude auth is configured.
 */
export async function analyzeContentQualityWithClaude(
  migratedUrl: string,
  quality: ContentQualityMetrics
): Promise<ContentQualityResult> {
  const timer = new Timer();
  logger.info('Starting agentic content-quality analysis (intrinsic, no source)', { migratedUrl });

  requireAgentAuth();

  const c = quality.webpageContent;
  const headings = c.headings.length > 0
    ? c.headings.slice(0, 25).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : 'No headings found';

  const userPrompt = contentNoSourcePrompt.user_template
    .replace('{{url}}', migratedUrl)
    .replace('{{headings}}', headings)
    .replace('{{text_sample}}', c.text.substring(0, 6000))
    .replace('{{words}}', c.wordCount.toString())
    .replace('{{headings_count}}', c.headings.length.toString())
    .replace('{{paragraphs}}', c.paragraphCount.toString());

  const messages: string[] = [];
  const deadline = agenticAbort('content');
  try {
    for await (const message of query({
      prompt: userPrompt,
      options: {
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        maxTurns: 1, // tool-free: judge the provided article text directly
        systemPrompt: contentNoSourcePrompt.system,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        abortController: deadline.controller,
      },
    })) {
      if (message.type === 'assistant' && 'message' in message && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) messages.push(block.text);
        }
      }
    }
  } finally {
    deadline.done();
  }

  const agenticResult = parseClaudeResponse(messages.join('\n'));
  // Editor's judgment dominates; the deterministic substance proxy is a small floor.
  const finalScore = Math.max(0, Math.min(100, Math.round(agenticResult.score * 0.8 + quality.score * 0.2)));

  logger.operationComplete('Agentic content-quality analysis', timer.elapsed(), {
    migratedUrl,
    agenticScore: agenticResult.score,
    coarseScore: quality.score,
    finalScore,
  });

  return { finalScore, agentic: agenticResult, timestamp: new Date().toISOString() };
}
