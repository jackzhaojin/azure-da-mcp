/**
 * Visual Correctness Agent - Type Definitions
 *
 * Defines types for visual analysis using Playwright screenshots
 * and pixelmatch image comparison.
 */

/**
 * Screenshot capture result
 */
export interface ScreenshotResult {
  /** Path to saved screenshot file (relative to public/) */
  path: string;
  /** Full absolute path to screenshot file */
  absolutePath: string;
  /** Screenshot file size in bytes */
  size: number;
  /** Screenshot dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Timestamp when screenshot was captured */
  capturedAt: string;
}

/**
 * Image comparison result using pixelmatch
 */
export interface ImageComparisonResult {
  /** Number of mismatched pixels */
  mismatchedPixels: number;
  /** Total number of pixels in images */
  totalPixels: number;
  /** Percentage of mismatched pixels (0-100) */
  diffPercentage: number;
  /** Path to diff image (if generated) */
  diffImagePath?: string;
  /** Whether images match within threshold */
  matches: boolean;
  /** Threshold used for comparison (0-1) */
  threshold: number;
}

/**
 * Visual metrics from deterministic analysis
 */
export interface VisualMetrics {
  /** URL analyzed */
  url: string;
  /** Screenshot result */
  screenshot: ScreenshotResult;
  /** Image comparison result (if baseline provided) */
  comparison?: ImageComparisonResult;
  /** Visual quality score (0-100) */
  score: number;
  /** Viewport used for screenshot */
  viewport: {
    width: number;
    height: number;
  };
  /** Analysis mode */
  mode: 'deterministic';
  /** Execution metadata */
  metadata: {
    executedAt: string;
    durationMs: number;
    toolsUsed: string[];
  };
}

/**
 * Visual finding from agentic analysis
 */
export interface VisualFinding {
  /** Finding type */
  type: 'layout-broken' | 'missing-image' | 'rendering-issue' | 'design-inconsistency' | 'responsive-issue';
  /** Severity level */
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  /** Plain language issue description */
  issue: string;
  /** Specific recommendation */
  recommendation: string;
  /** Location on page (optional) */
  location?: string;
}

/**
 * Agentic visual analysis result (Phase 11)
 */
export interface AgenticAnalysisResult {
  /** Visual findings */
  findings: VisualFinding[];
  /** Agentic score (0-100) */
  score: number;
  /** Summary of visual quality */
  summary: string;
  /** Critical visual issues */
  criticalIssues: string[];
  /** Minor visual improvements */
  minorImprovements: string[];
}

/**
 * Combined visual analysis result (deterministic + agentic)
 */
export interface VisualAnalysisResult {
  /** Analyzed URL */
  url: string;
  /** Baseline URL (if provided) */
  baselineUrl?: string;
  /** Deterministic metrics */
  deterministic: VisualMetrics;
  /** Agentic analysis (Phase 11) */
  agentic?: AgenticAnalysisResult;
  /** Final weighted score */
  finalScore: number;
  /** Grade (excellent, good, acceptable, needs-improvement, critical) */
  grade: string;
  /** Timestamp */
  timestamp: string;
  /** Analysis mode (deterministic or full) */
  mode: 'deterministic' | 'full';
  /** Combined metadata */
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
    };
  };
}
