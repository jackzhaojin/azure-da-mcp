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
    /**
     * How the score was produced:
     * - 'agentic'                — full pass: 0.7 × Claude + 0.3 × deterministic
     * - 'deterministic-only'     — no Claude auth configured (expected degradation)
     * - 'deterministic-fallback' — agentic pass attempted but FAILED (see modeReason)
     * Absent on reports persisted before this field existed.
     */
    mode?: 'agentic' | 'deterministic-only' | 'deterministic-fallback';
    /** Why the agentic pass didn't contribute (fallback/only modes). */
    modeReason?: string;
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
    /**
     * Visual dimension only — the captured screenshot. The engine sets
     * `path`/`absolutePath` (local file); the eval agent uploads it to the
     * artifact store and rewrites this to `{ path, url }` with a durable,
     * publicly-fetchable URL before the report is persisted.
     */
    screenshot?: { path: string; absolutePath?: string; url?: string };
  };
}

/**
 * Request to evaluate a migrated page
 */
export interface EvaluationRequest {
  pdfPath?: string; // Optional PDF reference (URL or file path)
  migratedUrl: string; // Required: URL of migrated page
  expectedUrl?: string; // Optional: Original page URL for comparison
  /**
   * Subset of dimensions to run (eval.run.v1). Default/empty = all four. Omitted
   * dimensions are excluded from the score (weights renormalize, totalDimensions
   * drops) and surfaced as report-level info findings — never scored 0.
   */
  dimensions?: Array<'structure' | 'accessibility' | 'content' | 'visual'>;
  options?: {
    skipVisual?: boolean;
    skipAccessibility?: boolean;
    skipContent?: boolean;
    skipStructure?: boolean;
  };
}

/**
 * Complete evaluation report (single-page)
 */
export interface EvaluationReport {
  id: string; // Unique ID (timestamp-based or UUID)
  type: 'single'; // Discriminator for unified storage
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
 * PHASE 32: Batch Evaluation Report (for localStorage persistence)
 */
export interface BatchEvaluationReport {
  id: string; // batchId or generated UUID
  type: 'batch'; // Discriminator for unified storage
  batchId: string;
  title?: string; // User-provided or auto-generated
  summary: {
    totalPages: number;
    successfulPages: number;
    failedPages: number;
    averageScore: number;
    grade: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical';
    scoreDistribution: {
      excellent: number;
      good: number;
      acceptable: number;
      needsImprovement: number;
      critical: number;
    };
  };
  results: BatchPageResult[]; // Full page results
  metadata: {
    createdAt: string;
    completedAt: string;
    durationMs: number;
    version: string;
  };
}

/**
 * PHASE 32: Unified evaluation type for storage
 * Uses discriminated union for type-safe handling
 */
export type AnyEvaluationReport = EvaluationReport | BatchEvaluationReport;

/**
 * Stored evaluations in localStorage
 */
export interface EvaluationStorage {
  evaluations: AnyEvaluationReport[];
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

/**
 * PHASE 26: Bulk Mode JSON Schema
 * Input/output types for batch evaluations
 */

/**
 * Single page in a batch evaluation
 */
export interface BatchPage {
  id: string; // Unique identifier (e.g., "page-001")
  title: string; // Human-readable page title
  sourceUrl: string; // URL to source (PDF or HTML)
  sourceType: 'pdf' | 'html'; // Type of source for comparison
  webUrl: string; // URL of migrated webpage
}

/**
 * Input JSON schema for batch evaluation import
 */
export interface BatchEvaluationInput {
  batchId: string; // Unique batch identifier (e.g., "migration-2025-01-15")
  pages: BatchPage[]; // Array of pages to evaluate (max 50)
}

/**
 * Single page result in batch output
 */
export interface BatchPageResult {
  pageId: string; // Matches BatchPage.id
  title: string; // Page title for reference
  overallScore: number; // 0-100
  overallGrade: 'Excellent' | 'Good' | 'Acceptable' | 'Needs Improvement' | 'Critical';
  dimensions: {
    structure: DimensionResult;
    accessibility: DimensionResult;
    content: DimensionResult;
    visual: DimensionResult;
  };
  evaluatedAt: string; // ISO timestamp
}

/**
 * Dimension result within a batch page result
 */
export interface DimensionResult {
  score: number; // 0-100
  grade: 'Excellent' | 'Good' | 'Acceptable' | 'Needs Improvement' | 'Critical';
  findings: Finding[]; // All findings for this dimension
}

/**
 * Output JSON schema for batch evaluation export
 */
export interface BatchEvaluationOutput {
  batchId: string; // Matches input batchId
  startedAt: string; // ISO timestamp
  completedAt: string; // ISO timestamp
  totalPages: number; // Count of pages evaluated
  results: BatchPageResult[]; // One result per page
}

/**
 * Status for a single page in a batch (for SSE streaming)
 */
export type BatchPageStatus = 'queued' | 'running' | 'done' | 'error';

/**
 * Status for a single dimension within a page (for SSE streaming)
 */
export type BatchDimensionStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * SSE event types for batch evaluation streaming
 */
export type BatchEventType =
  | 'page:queued'
  | 'page:started'
  | 'dimension:started'
  | 'dimension:completed'
  | 'page:completed'
  | 'page:error'
  | 'batch:completed';

/**
 * SSE event payload for batch evaluation updates
 */
export interface BatchEvaluationEvent {
  type: BatchEventType;
  batchId: string;
  pageId: string;
  dimension?: Dimension; // Only for dimension:* events
  status?: BatchDimensionStatus; // Status after event
  score?: number; // Score for dimension:completed
  findings?: Finding[]; // Findings for dimension:completed
  error?: string; // Error message for *:error events
  timestamp: string; // ISO timestamp
}

/**
 * In-memory batch evaluation state (server-side)
 */
export interface BatchEvaluationState {
  batchId: string;
  input: BatchEvaluationInput;
  startedAt: string;
  pageStates: Map<string, PageEvaluationState>; // pageId -> state
}

/**
 * Per-page evaluation state (server-side)
 */
export interface PageEvaluationState {
  pageId: string;
  title: string;
  status: BatchPageStatus;
  dimensions: {
    structure: BatchDimensionStatus;
    accessibility: BatchDimensionStatus;
    content: BatchDimensionStatus;
    visual: BatchDimensionStatus;
  };
  scores: {
    structure?: number;
    accessibility?: number;
    content?: number;
    visual?: number;
  };
  findings: {
    structure: Finding[];
    accessibility: Finding[];
    content: Finding[];
    visual: Finding[];
  };
  error?: string;
}
