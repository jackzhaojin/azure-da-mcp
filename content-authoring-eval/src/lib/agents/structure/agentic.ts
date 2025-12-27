/**
 * Structure Agent - Agentic Analysis
 *
 * Uses Claude API to interpret deterministic structure metrics and provide
 * semantic analysis, SEO assessment, and actionable recommendations.
 */

import { createClaudeClient, getClaudeModel } from '@/lib/claude';
import {
  type StructureMetrics,
  type AgenticAnalysisResult,
  type StructureAnalysisResult,
} from './types';
import structurePrompt from '@/lib/prompts/structure.json';

/**
 * Format structure metrics as text for Claude analysis
 */
function formatStructureForPrompt(metrics: StructureMetrics): string {
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
    .replace('{{meta_tags}}', metaTags)
    .replace('{{heading_hierarchy}}', headingHierarchy)
    .replace('{{document_structure}}', documentStructure)
    .replace('{{link_analysis}}', linkAnalysis);
}

/**
 * Parse Claude response and validate JSON structure
 */
function parseClaudeResponse(responseText: string): AgenticAnalysisResult {
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

    return {
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
  } catch (error) {
    console.error('Failed to parse Claude response:', error);
    console.error('Raw response:', responseText);
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
 * Perform agentic structure analysis using Claude API
 */
export async function analyzeStructureWithClaude(
  url: string,
  deterministicMetrics: StructureMetrics
): Promise<StructureAnalysisResult> {
  const client = createClaudeClient();
  const model = getClaudeModel();

  // Format prompt with structure data
  const userPrompt = formatStructureForPrompt(deterministicMetrics);

  // Call Claude API
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: structurePrompt.system,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract text content from response
  const responseText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('\n');

  // Parse and validate response
  const agenticResult = parseClaudeResponse(responseText);

  // Calculate final score
  const finalScore = calculateFinalScore(deterministicMetrics, agenticResult.score);
  const grade = calculateGrade(finalScore);

  return {
    url,
    deterministic: deterministicMetrics,
    agentic: agenticResult,
    finalScore,
    grade,
    timestamp: new Date().toISOString(),
  };
}
