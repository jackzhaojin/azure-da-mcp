/**
 * Type definitions for Accessibility Agent
 */

/**
 * Impact levels from axe-core
 */
export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

/**
 * Individual violation from axe-core
 */
export interface AxeViolation {
  id: string; // Rule ID (e.g., 'color-contrast', 'image-alt')
  impact: AxeImpact;
  description: string; // Short description of the rule
  help: string; // User-friendly help text
  helpUrl: string; // URL to detailed documentation
  nodes: AxeViolationNode[]; // Affected elements
  tags: string[]; // Rule tags (e.g., 'wcag2aa', 'wcag21aa')
}

/**
 * Individual affected element from axe-core violation
 */
export interface AxeViolationNode {
  html: string; // HTML snippet of the element
  target: unknown; // CSS selector(s) - can be string[], complex selector, or cross-tree selector
  failureSummary: string; // Why this element failed
  impact: AxeImpact;
}

/**
 * Complete axe-core scan results
 */
export interface AxeResults {
  url: string;
  timestamp: string;
  violations: AxeViolation[];
  passes: Array<{
    id: string;
    description: string;
    nodes: Array<{ html: string; target: unknown }>;
  }>;
  incomplete: AxeViolation[]; // Rules that couldn't complete
  inapplicable: Array<{
    id: string;
    description: string;
  }>;
}

/**
 * Deterministic accessibility metrics
 */
export interface AccessibilityMetrics {
  url: string;
  timestamp: string;
  violations: AxeViolation[];
  violationCounts: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  passes: number;
  incomplete: number;
  inapplicable: number;
  score: number; // 0-100 deterministic score
  wcagLevel: 'A' | 'AA' | 'AAA' | 'none';
}

/**
 * Agentic accessibility finding
 */
export interface AccessibilityFinding {
  severity: 'critical' | 'serious' | 'moderate' | 'minor' | 'info';
  issue: string;
  recommendation: string;
  impact: string; // User impact explanation
  priority: 'high' | 'medium' | 'low'; // AI-prioritized
  affectedElements?: number; // Count of affected elements
  ruleId?: string; // Original axe-core rule ID
}

/**
 * Agentic analysis result
 */
export interface AgenticAnalysisResult {
  findings: AccessibilityFinding[];
  score: number; // 0-100 agentic score
  summary: string;
  quickWins: string[]; // Easy fixes
  majorIssues: string[]; // Complex fixes
}

/**
 * Tool usage metadata (Phase 20)
 */
export interface ToolUsageMetadata {
  totalInvocations: number;
  toolCounts: Record<string, number>;
  verified: boolean;
  warnings: string[];
}

/**
 * Complete accessibility analysis result (deterministic + agentic)
 */
export interface AccessibilityAnalysisResult {
  url: string;
  deterministic: AccessibilityMetrics;
  agentic: AgenticAnalysisResult;
  finalScore: number; // Weighted: 70% agentic + 30% deterministic
  grade: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical';
  timestamp: string;
  metadata?: {
    toolUsage?: ToolUsageMetadata;
  };
}

/**
 * PHASE 37: Source type for accessibility comparison
 */
export type AccessibilitySourceType = 'html' | 'pdf' | 'none';

/**
 * PHASE 37: Source information for accessibility comparison
 */
export interface AccessibilitySourceInfo {
  type: AccessibilitySourceType;
  url?: string;      // For HTML source
  pdfPath?: string;  // For PDF source
}

/**
 * PHASE 37: PDF accessibility metadata (limited)
 */
export interface PDFAccessibilityInfo {
  /** Whether PDF has tagged structure */
  isTagged: boolean;
  /** PDF/UA compliance (if detectable) */
  pdfUACompliant: boolean;
  /** Language specified */
  language?: string;
  /** Has table of contents / bookmarks */
  hasOutline: boolean;
  /** Alt text on images (count) */
  imageAltTextCount: number;
  /** Note: PDF accessibility is inherently limited vs HTML */
  note: string;
}

/**
 * PHASE 37: Comparison result between source and migrated accessibility
 */
export interface AccessibilityComparison {
  /** Source type */
  sourceType: AccessibilitySourceType;
  /** Source violations (if HTML) */
  sourceViolations?: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  /** Migrated violations */
  migratedViolations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  /** Issues resolved in migration */
  resolved: string[];
  /** Issues introduced in migration */
  introduced: string[];
  /** Issues persisting from source */
  persisting: string[];
  /** Overall accessibility change */
  change: 'improved' | 'degraded' | 'unchanged' | 'incomparable';
  /** Score delta (migrated - source, positive = improved) */
  scoreDelta: number;
  /** PDF-specific: accessibility inherently improved by HTML */
  pdfToHtmlGain?: boolean;
}
