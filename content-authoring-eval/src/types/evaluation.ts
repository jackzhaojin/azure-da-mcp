/**
 * Type definitions for the Content Authoring Evaluation system
 */

/**
 * Severity levels for findings
 */
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor' | 'info';

/**
 * Evaluation dimensions
 */
export type Dimension = 'structure' | 'accessibility' | 'content' | 'visual';

/**
 * Individual finding from an agent
 */
export interface Finding {
  dimension: Dimension;
  severity: Severity;
  issue: string;
  recommendation: string;
  details?: Record<string, unknown>;
}

/**
 * Result from a single agent (deterministic + agentic combined)
 */
export interface AgentResult {
  dimension: Dimension;
  score: number; // 0-100
  findings: Finding[];
  metadata: {
    deterministic: {
      executedAt: string;
      durationMs: number;
      toolsUsed: string[];
    };
    agentic?: {
      executedAt: string;
      durationMs: number;
      model: string;
      tokensUsed?: number;
    };
  };
}

/**
 * Request to evaluate a migrated page
 */
export interface EvaluationRequest {
  pdfPath?: string; // Optional PDF reference (URL or file path)
  migratedUrl: string; // Required: URL of migrated page
  expectedUrl?: string; // Optional: Original page URL for comparison
  options?: {
    skipVisual?: boolean;
    skipAccessibility?: boolean;
    skipContent?: boolean;
    skipStructure?: boolean;
  };
}

/**
 * Complete evaluation report
 */
export interface EvaluationReport {
  id: string; // Unique ID (timestamp-based or UUID)
  request: EvaluationRequest;
  summary: {
    overallScore: number; // 0-100 weighted average
    grade: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical';
    passedDimensions: number; // Count of dimensions with score >= 75
    totalDimensions: number;
  };
  results: {
    structure?: AgentResult;
    accessibility?: AgentResult;
    content?: AgentResult;
    visual?: AgentResult;
  };
  findings: Finding[]; // All findings aggregated
  metadata: {
    createdAt: string; // ISO timestamp
    completedAt: string; // ISO timestamp
    durationMs: number;
    version: string; // System version
  };
}

/**
 * Stored evaluations in localStorage
 */
export interface EvaluationStorage {
  evaluations: EvaluationReport[];
  lastUpdated: string;
}

/**
 * Status of an ongoing evaluation (for SSE streaming)
 */
export interface EvaluationStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    structure: 'pending' | 'running' | 'completed' | 'failed';
    accessibility: 'pending' | 'running' | 'completed' | 'failed';
    content: 'pending' | 'running' | 'completed' | 'failed';
    visual: 'pending' | 'running' | 'completed' | 'failed';
  };
  currentReport?: Partial<EvaluationReport>;
  error?: string;
}
