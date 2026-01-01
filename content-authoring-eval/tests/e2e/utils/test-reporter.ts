/**
 * Utility for formatting test results consistently
 */

interface AgenticResult {
  findings?: Array<{ severity?: string; priority?: string }>;
  strengths?: string[];
  quickWins?: string[];
  majorIssues?: string[];
  criticalGaps?: string[];
  minorImprovements?: string[];
}

interface EvalResult {
  finalScore?: number;
  grade?: string;
  duration?: number;
  agentic?: AgenticResult;
}

/**
 * Format test result with score, findings breakdown, and duration
 */
export function formatTestResult(
  agentName: string,
  testCase: string,
  result: EvalResult
): string {
  const parts: string[] = [];

  // Agent and test case
  parts.push(`✅ ${agentName} (${testCase}):`);

  // Score and grade
  if (result.finalScore !== undefined) {
    parts.push(`Score ${result.finalScore}/${100}`);
    if (result.grade) {
      parts.push(`(${result.grade})`);
    }
  }

  // Findings breakdown
  if (result.agentic) {
    const findings = result.agentic.findings || [];
    const strengths = result.agentic.strengths || [];
    const quickWins = result.agentic.quickWins || [];
    const majorIssues = result.agentic.majorIssues || [];
    const criticalGaps = result.agentic.criticalGaps || [];
    const minorImprovements = result.agentic.minorImprovements || [];

    // Count by severity/priority
    const critical = findings.filter(f => f.severity === 'critical' || f.priority === 'critical').length;
    const serious = findings.filter(f => f.severity === 'serious' || f.priority === 'high').length;
    const moderate = findings.filter(f => f.severity === 'moderate' || f.priority === 'medium').length;
    const minor = findings.filter(f => f.severity === 'minor' || f.priority === 'low').length;

    // Strengths (positive findings)
    if (strengths.length > 0) {
      parts.push(`✨ ${strengths.length} strengths`);
    }

    // Issues (negative findings)
    const issuesParts: string[] = [];
    if (critical > 0) issuesParts.push(`${critical} critical`);
    if (serious > 0) issuesParts.push(`${serious} serious`);
    if (moderate > 0) issuesParts.push(`${moderate} moderate`);
    if (minor > 0) issuesParts.push(`${minor} minor`);

    if (issuesParts.length > 0) {
      parts.push(`⚠️  ${issuesParts.join(', ')}`);
    } else if (findings.length > 0) {
      parts.push(`⚠️  ${findings.length} issues`);
    }

    // Additional context
    if (quickWins.length > 0) parts.push(`🎯 ${quickWins.length} quick wins`);
    if (majorIssues.length > 0) parts.push(`🔴 ${majorIssues.length} major issues`);
    if (criticalGaps.length > 0) parts.push(`🚨 ${criticalGaps.length} critical gaps`);
    if (minorImprovements.length > 0) parts.push(`💡 ${minorImprovements.length} minor improvements`);
  }

  // Duration
  if (result.duration !== undefined) {
    const seconds = (result.duration / 1000).toFixed(1);
    parts.push(`⏱️  ${seconds}s`);
  }

  return parts.join(' | ');
}
