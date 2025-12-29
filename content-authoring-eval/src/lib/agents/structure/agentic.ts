/**
 * Structure Agent - Agentic Analysis
 *
 * Uses Claude Agent SDK to interpret deterministic structure metrics and provide
 * semantic analysis, SEO assessment, and actionable recommendations.
 *
 * CRITICAL: Uses @anthropic-ai/claude-agent-sdk (NOT @anthropic-ai/sdk)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger, Timer } from '@/lib/logger';
import {
  type StructureMetrics,
  type AgenticAnalysisResult,
  type StructureAnalysisResult,
} from './types';
import structurePrompt from '@/lib/prompts/structure.json';
import { createToolLoggingPlugin, verifyToolUsage, formatToolUsageStats } from '@/lib/tool-logging';

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

  // PHASE 25.1: DEBUG - Validate OAuth token is configured
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    logger.error('Claude OAuth token missing');
    throw new Error('Missing Claude authentication. Please set CLAUDE_CODE_OAUTH_TOKEN in .env.local');
  }

  // PHASE 25.1: DEBUG - Log OAuth token presence (first 10 chars only)
  const tokenPreview = process.env.CLAUDE_CODE_OAUTH_TOKEN.substring(0, 10);
  logger.info('🔑 PHASE 25.1 DEBUG: OAuth token present', { tokenPreview });

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
  logger.debug('Prompt formatted', { promptLength: userPrompt.length });

  // Build complete prompt with system and user messages
  const fullPrompt = `${structurePrompt.system}

${userPrompt}`;

  // Create tool logging plugin to track tool usage
  const toolLogger = createToolLoggingPlugin();

  // Collect streaming messages
  const messages: string[] = [];

  logger.info('Invoking Claude Agent SDK with streaming + tool logging');

  try {
    // PHASE 25.1: DEBUG - Check if MCP server binaries exist
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const playwrightBinary = '/usr/local/bin/mcp-server-playwright';
    const filesystemBinary = '/usr/local/bin/mcp-server-filesystem';

    logger.info('🔍 PHASE 25.1 DEBUG: Checking MCP server binaries', {
      playwright: {
        path: playwrightBinary,
        exists: fs.existsSync(playwrightBinary),
      },
      filesystem: {
        path: filesystemBinary,
        exists: fs.existsSync(filesystemBinary),
      },
    });

    // PHASE 25.1: DEBUG - Log Agent SDK configuration
    const agentConfig = {
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 20,
      mcpServers: {
        "playwright": {
          command: "/usr/local/bin/mcp-server-playwright",
          args: []
        },
        "filesystem": {
          command: "/usr/local/bin/mcp-server-filesystem",
          args: [process.cwd()]
        }
      },
      allowedTools: ['Read', 'Bash', 'mcp__playwright__browser_navigate', 'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_take_screenshot'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd: process.cwd(),
    };

    logger.info('⚙️  PHASE 25.1 DEBUG: Agent SDK configuration', agentConfig);

    // PHASE 25: Use Agent SDK query() with programmatic MCP configuration
    logger.info('🚀 PHASE 25.1 DEBUG: Starting Agent SDK query() stream...');

    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 20, // Increased for multiple tool invocations
        // PHASE 25.2: Pass OAuth token to spawned claude-code CLI process
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
        },
        // PHASE 25: Remove settingSources - use programmatic MCP config instead
        // settingSources: ['user', 'project'],
        // PHASE 25: Configure MCP servers programmatically (bundled in container)
        // Use direct paths to globally installed MCP servers to avoid npx HOME directory issues
        mcpServers: {
          "playwright": {
            command: "/usr/local/bin/mcp-server-playwright",
            args: []
          },
          "filesystem": {
            command: "/usr/local/bin/mcp-server-filesystem",
            args: [process.cwd()]
          }
        },
        allowedTools: ['Read', 'Bash', 'mcp__playwright__browser_navigate', 'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_take_screenshot'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        plugins: [toolLogger], // PHASE 20: Add tool logging plugin
      }
    })) {
      // PHASE 25.1: DEBUG - Log all message types
      logger.info('📨 PHASE 25.1 DEBUG: Received message from Agent SDK', {
        type: message.type,
      });

      // Collect assistant text responses
      if (message.type === 'assistant' && 'message' in message && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            messages.push(block.text);
            logger.debug('Received text block from Claude', { length: block.text.length });
          }
        }
      }

      // PHASE 25.1: DEBUG - Log stream events (may contain errors)
      if (message.type === 'stream_event' && 'event' in message) {
        logger.info('🌊 PHASE 25.1 DEBUG: Stream event received', {
          event: JSON.stringify(message.event),
        });
      }

      // PHASE 25.1: DEBUG - Log result messages
      if (message.type === 'result') {
        logger.info('🏁 PHASE 25.1 DEBUG: Result message received', {
          subtype: message.subtype,
          isError: message.is_error,
          numTurns: message.num_turns,
        });
      }
    }

    logger.info('✅ PHASE 25.1 DEBUG: Claude Agent SDK stream completed', { messagesCollected: messages.length });

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
        expectedTools: 'Playwright (browser_navigate) OR Bash (lighthouse)',
        fallbackMode: 'Continuing with text-only analysis',
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
