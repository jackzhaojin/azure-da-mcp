/**
 * Accessibility Agent - Agentic Analysis
 *
 * Uses Claude Agent SDK to interpret deterministic accessibility scan results and provide
 * user-impact prioritization, plain language explanations, and remediation strategies.
 *
 * CRITICAL: Uses @anthropic-ai/claude-agent-sdk (NOT @anthropic-ai/sdk)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { requireAgentAuth, agenticAbort } from '@/lib/agent-auth';
import { createLogger, Timer } from '@/lib/logger';
import {
  type AccessibilityMetrics,
  type AgenticAnalysisResult,
  type AccessibilityAnalysisResult,
  type AccessibilityFinding,
} from './types';
import accessibilityNoSourcePrompt from '@/lib/prompts/accessibility-no-source.json';
import accessibilityHtmlSourcePrompt from '@/lib/prompts/accessibility-html-source.json';
import accessibilityPdfSourcePrompt from '@/lib/prompts/accessibility-pdf-source.json';
import { getMCPServersConfig } from '@/lib/mcp-config';

const logger = createLogger('agentic');

/**
 * Format accessibility metrics as text for Claude analysis
 *
 * @param url - The URL being analyzed
 * @param metrics - Accessibility metrics for the migrated page
 * @param sourceType - Type of source comparison ('html', 'pdf', or 'none')
 * @param sourceMetrics - Optional source page metrics (for HTML comparison)
 * @param pdfInfo - Optional PDF information (for PDF comparison)
 */
function formatAccessibilityForPrompt(
  url: string,
  metrics: AccessibilityMetrics,
  sourceType: 'html' | 'pdf' | 'none' = 'none',
  sourceMetrics?: AccessibilityMetrics,
  pdfInfo?: { path: string; pages: number; }
): { systemPrompt: string; userPrompt: string; } {
  // Select prompt template based on source type
  const promptTemplate = sourceType === 'html' ? accessibilityHtmlSourcePrompt :
                        sourceType === 'pdf' ? accessibilityPdfSourcePrompt :
                        accessibilityNoSourcePrompt;
  const summary = `
URL: ${metrics.url}
Scan Date: ${metrics.timestamp}
Overall Score: ${metrics.score}/100 (deterministic)
WCAG Level: ${metrics.wcagLevel}

Total Violations: ${metrics.violationCounts.total}
- Critical: ${metrics.violationCounts.critical}
- Serious: ${metrics.violationCounts.serious}
- Moderate: ${metrics.violationCounts.moderate}
- Minor: ${metrics.violationCounts.minor}

Passed Rules: ${metrics.passes}
Incomplete Rules: ${metrics.incomplete}
Inapplicable Rules: ${metrics.inapplicable}
`.trim();

  const violationsByImpact = `
Critical (${metrics.violationCounts.critical}):
${metrics.violations.filter(v => v.nodes.some(n => n.impact === 'critical')).map(v => `  - ${v.id}: ${v.description}`).join('\n') || '  (none)'}

Serious (${metrics.violationCounts.serious}):
${metrics.violations.filter(v => v.nodes.some(n => n.impact === 'serious')).map(v => `  - ${v.id}: ${v.description}`).join('\n') || '  (none)'}

Moderate (${metrics.violationCounts.moderate}):
${metrics.violations.filter(v => v.nodes.some(n => n.impact === 'moderate')).map(v => `  - ${v.id}: ${v.description}`).join('\n') || '  (none)'}

Minor (${metrics.violationCounts.minor}):
${metrics.violations.filter(v => v.nodes.some(n => n.impact === 'minor')).map(v => `  - ${v.id}: ${v.description}`).join('\n') || '  (none)'}
`.trim();

  const detailedViolations = metrics.violations.map(violation => {
    return `
Rule: ${violation.id}
Impact: ${violation.impact}
Description: ${violation.description}
Help: ${violation.help}
Help URL: ${violation.helpUrl}
WCAG Tags: ${violation.tags.join(', ')}
Affected Elements: ${violation.nodes.length}

Elements:
${violation.nodes.slice(0, 3).map((node, idx) => {
  return `  ${idx + 1}. ${node.html.substring(0, 100)}${node.html.length > 100 ? '...' : ''}
     Failure: ${node.failureSummary}`;
}).join('\n')}${violation.nodes.length > 3 ? `\n  ... and ${violation.nodes.length - 3} more` : ''}
`;
  }).join('\n---\n');

  let userPrompt = promptTemplate.user_template;

  // Format based on source type
  if (sourceType === 'html' && sourceMetrics) {
    // HTML source comparison - need both source and migrated data
    const sourceSummary = `
URL: ${sourceMetrics.url}
Scan Date: ${sourceMetrics.timestamp}
Overall Score: ${sourceMetrics.score}/100
WCAG Level: ${sourceMetrics.wcagLevel}

Total Violations: ${sourceMetrics.violationCounts.total}
- Critical: ${sourceMetrics.violationCounts.critical}
- Serious: ${sourceMetrics.violationCounts.serious}
- Moderate: ${sourceMetrics.violationCounts.moderate}
- Minor: ${sourceMetrics.violationCounts.minor}`;

    const sourceViolationsByImpact = `
Critical (${sourceMetrics.violationCounts.critical}):
${sourceMetrics.violations.filter(v => v.nodes.some(n => n.impact === 'critical')).map(v => `  - ${v.id}: ${v.description}`).join('\\n') || '  (none)'}

Serious (${sourceMetrics.violationCounts.serious}):
${sourceMetrics.violations.filter(v => v.nodes.some(n => n.impact === 'serious')).map(v => `  - ${v.id}: ${v.description}`).join('\\n') || '  (none)'}

Moderate (${sourceMetrics.violationCounts.moderate}):
${sourceMetrics.violations.filter(v => v.nodes.some(n => n.impact === 'moderate')).map(v => `  - ${v.id}: ${v.description}`).join('\\n') || '  (none)'}

Minor (${sourceMetrics.violationCounts.minor}):
${sourceMetrics.violations.filter(v => v.nodes.some(n => n.impact === 'minor')).map(v => `  - ${v.id}: ${v.description}`).join('\\n') || '  (none)'}`;

    // Simplified regression summary
    const regressionSummary = `New Regressions: ${metrics.violationCounts.total - sourceMetrics.violationCounts.total} violations (focus on these)\nFixed Issues: Check for violations in source that are resolved in migrated`;

    userPrompt = userPrompt
      .replace('{{source_url}}', sourceMetrics.url)
      .replace('{{migrated_url}}', url)
      .replace('{{source_summary}}', sourceSummary)
      .replace('{{source_violations_by_impact}}', sourceViolationsByImpact)
      .replace('{{migrated_summary}}', summary)
      .replace('{{migrated_violations_by_impact}}', violationsByImpact)
      .replace('{{regression_summary}}', regressionSummary);
  } else if (sourceType === 'pdf' && pdfInfo) {
    // PDF source context
    const pdfInfoText = `PDF Path: ${pdfInfo.path}\nPages: ${pdfInfo.pages}`;

    userPrompt = userPrompt
      .replace('{{pdf_path}}', pdfInfo.path)
      .replace('{{url}}', url)
      .replace('{{pdf_info}}', pdfInfoText)
      .replace('{{summary}}', summary)
      .replace('{{violations_by_impact}}', violationsByImpact)
      .replace('{{detailed_violations}}', detailedViolations || '(No violations found)');
  } else {
    // No source (fallback)
    userPrompt = userPrompt
      .replace('{{url}}', url)
      .replace('{{summary}}', summary)
      .replace('{{violations_by_impact}}', violationsByImpact)
      .replace('{{detailed_violations}}', detailedViolations || '(No violations found)');
  }

  return {
    systemPrompt: promptTemplate.system,
    userPrompt,
  };
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
    if (!Array.isArray(parsed.quickWins)) {
      throw new Error('Response missing quickWins array');
    }
    if (!Array.isArray(parsed.majorIssues)) {
      throw new Error('Response missing majorIssues array');
    }

    const result: AgenticAnalysisResult = {
      findings: parsed.findings.map((f: unknown) => {
        const finding = f as Record<string, unknown>;
        return {
          severity: (finding.severity as AccessibilityFinding['severity']) || 'moderate',
          issue: (finding.issue as string) || '',
          recommendation: (finding.recommendation as string) || '',
          impact: (finding.impact as string) || '',
          priority: (finding.priority as AccessibilityFinding['priority']) || 'medium',
          affectedElements: (finding.affectedElements as number) || 0,
          ruleId: (finding.ruleId as string) || undefined,
        };
      }),
      score: Math.max(0, Math.min(100, parsed.score)),
      summary: parsed.summary,
      strengths: (parsed.strengths as string[]) || [],
      quickWins: parsed.quickWins as string[],
      majorIssues: parsed.majorIssues as string[],
    };

    logger.info('Claude response parsed successfully', {
      findingsCount: result.findings.length,
      score: result.score,
      quickWins: result.quickWins.length,
      majorIssues: result.majorIssues.length,
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
 * 70% agentic (Claude's user-impact assessment) + 30% deterministic (automated scan)
 */
function calculateFinalScore(
  deterministicScore: number,
  agenticScore: number
): number {
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
 * Perform agentic accessibility analysis using Claude Agent SDK
 *
 * @param url - The URL being analyzed
 * @param deterministicMetrics - Deterministic accessibility metrics for migrated page
 * @param sourceType - Type of source comparison ('html', 'pdf', or 'none')
 * @param sourceMetrics - Optional source page metrics (for HTML comparison)
 * @param pdfInfo - Optional PDF information (for PDF comparison)
 */
export async function analyzeAccessibilityWithClaude(
  url: string,
  deterministicMetrics: AccessibilityMetrics,
  sourceType: 'html' | 'pdf' | 'none' = 'none',
  sourceMetrics?: AccessibilityMetrics,
  pdfInfo?: { path: string; pages: number; }
): Promise<AccessibilityAnalysisResult> {
  const timer = new Timer();
  logger.info('Starting agentic accessibility analysis', { url });

  requireAgentAuth();

  // Format prompt with accessibility data
  const prompts = formatAccessibilityForPrompt(url, deterministicMetrics, sourceType, sourceMetrics, pdfInfo);
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

  try {
    // Get environment-aware MCP server configuration
    const mcpServers = getMCPServersConfig();

    // Stream messages from Claude with tool access (deadline-bounded — a hung
    // turn would otherwise hold a browser permit forever, see agent-auth.ts)
    const deadline = agenticAbort('accessibility');
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
    const finalScore = calculateFinalScore(deterministicMetrics.score, agenticResult.score);
    const grade = calculateGrade(finalScore);

    logger.operationComplete('Agentic accessibility analysis', timer.elapsed(), {
      url,
      finalScore,
      grade,
      findingsCount: agenticResult.findings.length,
      quickWins: agenticResult.quickWins.length,
      majorIssues: agenticResult.majorIssues.length,
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
    logger.error('Agentic analysis failed', error instanceof Error ? error : new Error(String(error)), {
      url,
      duration: timer.elapsed(),
    });
    throw error;
  }
}
