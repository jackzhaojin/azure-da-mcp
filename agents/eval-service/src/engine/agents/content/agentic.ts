/**
 * Content Fidelity Agent - Agentic Analysis (Claude Agent SDK)
 *
 * Uses Claude Agent SDK to perform semantic content analysis,
 * assessing intent alignment, tone preservation, and meaning accuracy.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger, Timer } from '@/lib/logger';
import type { ContentMetrics, AgenticAnalysisResult, ContentAnalysisResult, ContentFinding } from './types';
import contentPdfSourcePrompt from '@/lib/prompts/content-pdf-source.json';
import contentHtmlSourcePrompt from '@/lib/prompts/content-html-source.json';
import { getMCPServersConfig } from '@/lib/mcp-config';

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
    // Extract JSON from markdown code blocks if present
    let jsonText = responseText.trim();
    if (jsonText.includes('```json')) {
      const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonText = match[1];
      }
    } else if (jsonText.includes('```')) {
      const match = jsonText.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonText = match[1];
      }
    }

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
    // Validate OAuth token
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude authentication. Please set CLAUDE_CODE_OAUTH_TOKEN in .env.local');
    }

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

    // Stream messages from Claude with tool access
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
