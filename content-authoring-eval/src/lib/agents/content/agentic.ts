/**
 * Content Fidelity Agent - Agentic Analysis (Claude Agent SDK)
 *
 * Uses Claude Agent SDK to perform semantic content analysis,
 * assessing intent alignment, tone preservation, and meaning accuracy.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger, Timer } from '@/lib/logger';
import type { ContentMetrics, AgenticAnalysisResult, ContentAnalysisResult, ContentFinding } from './types';
import contentPrompt from '@/lib/prompts/content.json';
import { createToolLoggingPlugin, verifyToolUsage, formatToolUsageStats } from '@/lib/tool-logging';

const logger = createLogger('agentic');

/**
 * Format content metrics for Claude prompt
 */
function formatContentForPrompt(metrics: ContentMetrics): string {
  const { pdfContent, webpageContent, diff } = metrics;

  // Format PDF metadata
  const pdfMetadata = pdfContent.metadata
    ? `Title: ${pdfContent.metadata.title || 'N/A'}
Author: ${pdfContent.metadata.author || 'N/A'}
Subject: ${pdfContent.metadata.subject || 'N/A'}
Created: ${pdfContent.metadata.creationDate || 'N/A'}`
    : 'No metadata available';

  // Format PDF headings
  const pdfHeadings = pdfContent.headings.length > 0
    ? pdfContent.headings.slice(0, 20).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : 'No headings extracted';

  // Format webpage headings
  const webpageHeadings = webpageContent.headings.length > 0
    ? webpageContent.headings.slice(0, 20).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : 'No headings found';

  // Truncate text samples
  const pdfTextSample = pdfContent.text.substring(0, 2000);
  const webpageTextSample = webpageContent.text.substring(0, 2000);

  // Format missing content examples
  const missingExamples = diff.missing.length > 0
    ? diff.missing.slice(0, 5).map((s, i) => `${i + 1}. "${s}"`).join('\n')
    : 'No missing content detected';

  // Format extra content examples
  const extraExamples = diff.extra.length > 0
    ? diff.extra.slice(0, 5).map((s, i) => `${i + 1}. "${s}"`).join('\n')
    : 'No extra content detected';

  // Build full prompt using template
  let userPrompt = contentPrompt.user_template;

  // Replace template variables
  userPrompt = userPrompt
    .replace('{{pdf_metadata}}', pdfMetadata)
    .replace('{{pdf_headings}}', pdfHeadings)
    .replace('{{pdf_text_sample}}', pdfTextSample)
    .replace('{{pdf_pages}}', pdfContent.numPages.toString())
    .replace('{{pdf_words}}', pdfContent.wordCount.toString())
    .replace('{{pdf_headings_count}}', pdfContent.headings.length.toString())
    .replace('{{webpage_headings}}', webpageHeadings)
    .replace('{{webpage_text_sample}}', webpageTextSample)
    .replace('{{webpage_words}}', webpageContent.wordCount.toString())
    .replace('{{webpage_headings_count}}', webpageContent.headings.length.toString())
    .replace('{{similarity_score}}', diff.similarityScore.toString())
    .replace('{{missing_count}}', diff.missing.length.toString())
    .replace('{{extra_count}}', diff.extra.length.toString())
    .replace('{{missing_examples}}', missingExamples)
    .replace('{{extra_examples}}', extraExamples);

  return userPrompt;
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
 */
export async function analyzeContentWithClaude(
  pdfUrl: string,
  migratedUrl: string,
  deterministicMetrics: ContentMetrics
): Promise<ContentAnalysisResult> {
  const timer = new Timer();
  logger.info('Starting agentic content analysis', { pdfUrl, migratedUrl });

  try {
    // Validate OAuth token
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude authentication. Please set CLAUDE_CODE_OAUTH_TOKEN in .env.local');
    }

    // Format metrics for Claude
    const userPrompt = formatContentForPrompt(deterministicMetrics);

    logger.debug('Formatted prompt for Claude', { length: userPrompt.length });

    // Build full prompt (system + user)
    const fullPrompt = `${contentPrompt.system}

${userPrompt}`;

    // Create tool logging plugin to track tool usage
    const toolLogger = createToolLoggingPlugin();

    logger.info('Invoking Claude Agent SDK for content analysis + tool logging');

    // Collect streaming messages
    const messages: string[] = [];

    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
        maxTurns: 20, // Increased for multiple tool invocations
        settingSources: ['user', 'project'],
        allowedTools: ['Read', 'Write', 'Bash', 'WebFetch'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        plugins: [toolLogger], // PHASE 20: Add tool logging plugin
      }
    })) {
      // Collect assistant text responses
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            messages.push(block.text);
            logger.debug('Claude response chunk received', { length: block.text.length });
          }
        }
      }
    }

    logger.info('Agent SDK completed', { messageCount: messages.length });

    // PHASE 20-21: Verify and enforce tool usage
    const toolStats = toolLogger.getStats();
    const verification = verifyToolUsage(toolStats);

    logger.info('Tool usage verification', {
      passed: verification.passed,
      summary: verification.summary,
      warnings: verification.warnings,
    });

    // Log detailed tool usage stats
    logger.debug('Detailed tool usage:\n' + formatToolUsageStats(toolStats));

    // PHASE 21: Enforce tool usage - log critical warnings if no tools used
    if (!verification.passed) {
      logger.warn('⚠️  PHASE 21 WARNING: Agent completed without using tools - may be "fake agentic"', {
        totalInvocations: toolStats.totalInvocations,
        expectedTools: 'Read/Write (file I/O) OR Bash (diff/wdiff)',
        fallbackMode: 'Continuing with sample-text-only analysis',
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
      pdfUrl,
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
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
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
    logger.error('Agentic content analysis failed', error as Error, { pdfUrl, migratedUrl, duration: timer.elapsed() });
    throw error;
  }
}
