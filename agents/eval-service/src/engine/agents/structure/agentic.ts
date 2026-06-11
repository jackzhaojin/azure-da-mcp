/**
 * Structure Agent - Agentic Analysis
 *
 * Uses Claude Agent SDK to interpret deterministic structure metrics and provide
 * semantic analysis, SEO assessment, and actionable recommendations.
 *
 * CRITICAL: Uses @anthropic-ai/claude-agent-sdk (NOT @anthropic-ai/sdk)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { requireAgentAuth, agenticAbort } from '@/lib/agent-auth';
import { createLogger, Timer } from '@/lib/logger';
import {
  type StructureMetrics,
  type AgenticAnalysisResult,
  type StructureAnalysisResult,
} from './types';
import structurePrompt from '@/lib/prompts/structure-no-source.json';
import { getMCPServersConfig } from '@/lib/mcp-config';

const logger = createLogger('agentic');

/**
 * Format structure metrics as text for Claude analysis
 */
function formatStructureForPrompt(url: string, metrics: StructureMetrics): string {
  const metaTags = `
Title: ${metrics.metaTags.title || '(missing)'}
Description: ${metrics.metaTags.description || '(missing)'}
Keywords: ${metrics.metaTags.keywords || '(missing)'}
Charset: ${metrics.metaTags.charset || '(missing)'}
Viewport: ${metrics.metaTags.viewport || '(missing)'}
Robots: ${metrics.metaTags.robots || '(missing)'}
Canonical: ${metrics.metaTags.canonical || '(missing)'}

Open Graph:
- og:title: ${metrics.metaTags.ogTitle || '(missing)'}
- og:description: ${metrics.metaTags.ogDescription || '(missing)'}
- og:image: ${metrics.metaTags.ogImage || '(missing)'}
- og:type: ${metrics.metaTags.ogType || '(missing)'}

Twitter Card:
- twitter:card: ${metrics.metaTags.twitterCard || '(missing)'}
- twitter:title: ${metrics.metaTags.twitterTitle || '(missing)'}
- twitter:description: ${metrics.metaTags.twitterDescription || '(missing)'}
- twitter:image: ${metrics.metaTags.twitterImage || '(missing)'}
`.trim();

  const headingHierarchy = `
Total Headings: ${metrics.headingHierarchy.headings.length}
Has H1: ${metrics.headingHierarchy.hasH1}
H1 Count: ${metrics.headingHierarchy.h1Count}
Proper Nesting: ${metrics.headingHierarchy.hasProperNesting}
Issues: ${metrics.headingHierarchy.issues.length > 0 ? metrics.headingHierarchy.issues.join('; ') : 'None'}

Heading Structure:
${metrics.headingHierarchy.headings.map(h => `  ${'  '.repeat(h.level - 1)}H${h.level}: ${h.text.substring(0, 60)}${h.text.length > 60 ? '...' : ''}`).join('\n')}
`.trim();

  const documentStructure = `
Semantic Elements:
- <header>: ${metrics.documentStructure.hasHeader ? 'Yes' : 'No'}
- <nav>: ${metrics.documentStructure.hasNav ? 'Yes' : 'No'}
- <main>: ${metrics.documentStructure.hasMain ? 'Yes' : 'No'}
- <footer>: ${metrics.documentStructure.hasFooter ? 'Yes' : 'No'}
- <aside>: ${metrics.documentStructure.hasAside ? 'Yes' : 'No'}

Content Sections:
- <section>: ${metrics.documentStructure.sectionCount}
- <article>: ${metrics.documentStructure.articleCount}
- <form>: ${metrics.documentStructure.formCount}
`.trim();

  const linkAnalysis = `
Total Links: ${metrics.linkAnalysis.totalLinks}
Internal Links: ${metrics.linkAnalysis.internalLinks}
External Links: ${metrics.linkAnalysis.externalLinks}
Broken Anchors (no href): ${metrics.linkAnalysis.brokenAnchors}
Links Without Text: ${metrics.linkAnalysis.linksWithoutText}
`.trim();

  return structurePrompt.user_template
    .replace('{{url}}', url)
    .replace('{{meta_tags}}', metaTags)
    .replace('{{heading_hierarchy}}', headingHierarchy)
    .replace('{{document_structure}}', documentStructure)
    .replace('{{link_analysis}}', linkAnalysis);
}

/**
 * Parse Claude response and validate JSON structure
 */
function parseClaudeResponse(responseText: string): AgenticAnalysisResult {
  logger.debug('Parsing Claude response', { responseLength: responseText.length });

  try {
    // Claude sometimes wraps JSON in markdown code blocks
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;

    const parsed = JSON.parse(jsonText.trim());

    // Validate structure
    if (!Array.isArray(parsed.findings)) {
      throw new Error('Response missing findings array');
    }
    if (typeof parsed.score !== 'number') {
      throw new Error('Response missing score number');
    }
    if (typeof parsed.summary !== 'string') {
      throw new Error('Response missing summary string');
    }

    const result = {
      findings: parsed.findings.map((f: unknown) => {
        const finding = f as Record<string, unknown>;
        return {
          dimension: 'structure' as const,
          severity: (finding.severity as string) || 'moderate',
          issue: (finding.issue as string) || '',
          recommendation: (finding.recommendation as string) || '',
          impact: (finding.impact as string) || '',
        };
      }),
      score: Math.max(0, Math.min(100, parsed.score)),
      summary: parsed.summary,
    strengths: (parsed.strengths as string[]) || [],
    };

    logger.info('Claude response parsed successfully', {
      findingsCount: result.findings.length,
      score: result.score,
    });

    return result;
  } catch (error) {
    logger.error('Failed to parse Claude response', error instanceof Error ? error : new Error(String(error)), {
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200),
    });
    throw new Error(`Invalid Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate final score by combining deterministic and agentic scores
 * 70% agentic (Claude's interpretation) + 30% deterministic (objective metrics)
 */
function calculateFinalScore(
  deterministicMetrics: StructureMetrics,
  agenticScore: number
): number {
  // Simple deterministic score based on presence/absence of key elements
  let deterministicScore = 100;

  // Meta tags (30 points max)
  if (!deterministicMetrics.metaTags.title) deterministicScore -= 10;
  if (!deterministicMetrics.metaTags.description) deterministicScore -= 8;
  if (!deterministicMetrics.metaTags.viewport) deterministicScore -= 5;
  if (!deterministicMetrics.metaTags.ogTitle) deterministicScore -= 7;

  // Heading hierarchy (30 points max)
  if (!deterministicMetrics.headingHierarchy.hasH1) deterministicScore -= 15;
  if (deterministicMetrics.headingHierarchy.h1Count > 1) deterministicScore -= 10;
  if (!deterministicMetrics.headingHierarchy.hasProperNesting) deterministicScore -= 5;

  // Semantic HTML (20 points max)
  if (!deterministicMetrics.documentStructure.hasMain) deterministicScore -= 8;
  if (!deterministicMetrics.documentStructure.hasHeader) deterministicScore -= 4;
  if (!deterministicMetrics.documentStructure.hasFooter) deterministicScore -= 4;
  if (!deterministicMetrics.documentStructure.hasNav) deterministicScore -= 4;

  // Link structure (20 points max)
  if (deterministicMetrics.linkAnalysis.brokenAnchors > 0) {
    deterministicScore -= Math.min(10, deterministicMetrics.linkAnalysis.brokenAnchors * 5);
  }
  if (deterministicMetrics.linkAnalysis.linksWithoutText > 0) {
    deterministicScore -= Math.min(10, deterministicMetrics.linkAnalysis.linksWithoutText * 3);
  }

  deterministicScore = Math.max(0, deterministicScore);

  // Weighted combination: 70% agentic + 30% deterministic
  const finalScore = Math.round(agenticScore * 0.7 + deterministicScore * 0.3);
  return Math.max(0, Math.min(100, finalScore));
}

/**
 * Determine grade from final score
 */
function calculateGrade(score: number): 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'needs-improvement';
  return 'critical';
}

/**
 * Perform agentic structure analysis using Claude Agent SDK
 */
export async function analyzeStructureWithClaude(
  url: string,
  deterministicMetrics: StructureMetrics
): Promise<StructureAnalysisResult> {
  const timer = new Timer();
  logger.info('Starting agentic structure analysis', { url });

  requireAgentAuth();

  // PHASE 25.1: DEBUG - Log environment details
  logger.info('🐳 PHASE 25.1 DEBUG: Environment details', {
    nodeVersion: process.version,
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      HOME: process.env.HOME,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
    },
  });

  // Format prompt with structure data
  const userPrompt = formatStructureForPrompt(url, deterministicMetrics);
  const systemPromptText = structurePrompt.system;

  logger.debug('Formatted prompts', {
    userPromptLength: userPrompt.length,
    systemPromptLength: systemPromptText.length
  });

  // Collect streaming messages and track tool usage
  const messages: string[] = [];
  let toolCallCount = 0;

  logger.info('Invoking Claude Agent SDK');

  try {
    // Get environment-aware MCP server configuration
    const mcpServers = getMCPServersConfig();

    // Stream messages from Claude with tool access (deadline-bounded — a hung
    // turn would otherwise hold a browser permit forever, see agent-auth.ts)
    const deadline = agenticAbort('structure');
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

    if (!responseText) {
      logger.error('No response received from Claude Agent SDK');
      throw new Error('No response received from Claude Agent SDK');
    }

    // Parse and validate response
    const agenticResult = parseClaudeResponse(responseText);

    // Calculate final score
    const finalScore = calculateFinalScore(deterministicMetrics, agenticResult.score);
    const grade = calculateGrade(finalScore);

    logger.operationComplete('Agentic structure analysis', timer.elapsed(), {
      url,
      finalScore,
      grade,
      findingsCount: agenticResult.findings.length,
      toolInvocations: toolStats.totalInvocations,
      toolsUsed: Object.keys(toolStats.toolCounts).join(', '),
    });

    return {
      url,
      deterministic: deterministicMetrics,
      agentic: agenticResult,
      finalScore,
      grade,
      timestamp: new Date().toISOString(),
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
    // PHASE 25.1: DEBUG - Enhanced error logging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorDetails = error as any;
    logger.error('❌ PHASE 25.1 DEBUG: Agentic analysis failed', error instanceof Error ? error : new Error(String(error)), {
      url,
      duration: timer.elapsed(),
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      processExitCode: errorDetails?.code,
      processSignal: errorDetails?.signal,
      processStdout: errorDetails?.stdout,
      processStderr: errorDetails?.stderr,
    });

    // PHASE 25.1: DEBUG - Log full error object for investigation
    console.error('🔥 PHASE 25.1 DEBUG: Full error object:', JSON.stringify(error, null, 2));

    throw error;
  }
}
