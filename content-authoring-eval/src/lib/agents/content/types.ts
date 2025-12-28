/**
 * Content Fidelity Agent - Type Definitions
 *
 * Defines types for content extraction, comparison, and fidelity analysis.
 */

/**
 * PDF content extraction result
 */
export interface PDFContent {
  /** Extracted text content from PDF */
  text: string;
  /** Number of pages in PDF */
  numPages: number;
  /** PDF metadata (title, author, etc.) */
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modDate?: string;
  };
  /** Heading structure extracted from text */
  headings: string[];
  /** Paragraph count */
  paragraphCount: number;
  /** Word count */
  wordCount: number;
  /** Character count */
  charCount: number;
}

/**
 * Webpage content extraction result
 */
export interface WebpageContent {
  /** Extracted visible text content */
  text: string;
  /** Heading structure (H1-H6) */
  headings: string[];
  /** Paragraph count */
  paragraphCount: number;
  /** Word count */
  wordCount: number;
  /** Character count */
  charCount: number;
}

/**
 * Text difference detection
 */
export interface TextDiff {
  /** Content missing from migrated page (expected but not found) */
  missing: string[];
  /** Extra content in migrated page (not in expected) */
  extra: string[];
  /** Common content (present in both) */
  common: string[];
  /** Text similarity score (0-100) */
  similarityScore: number;
}

/**
 * Content metrics from deterministic analysis
 */
export interface ContentMetrics {
  /** URL of PDF source */
  pdfUrl: string;
  /** URL of migrated webpage */
  migratedUrl: string;
  /** Timestamp of analysis */
  timestamp: string;
  /** PDF content extraction */
  pdfContent: PDFContent;
  /** Webpage content extraction */
  webpageContent: WebpageContent;
  /** Text difference analysis */
  diff: TextDiff;
  /** Raw similarity score (0-100) */
  score: number;
  /** Execution metadata */
  metadata: {
    executedAt: string;
    durationMs: number;
    toolsUsed: string[];
  };
}

/**
 * Content fidelity finding from analysis
 */
export interface ContentFinding {
  /** Finding type */
  type: 'missing-content' | 'extra-content' | 'semantic-drift' | 'tone-shift' | 'intent-misalignment';
  /** Severity level */
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  /** Description of the issue */
  issue: string;
  /** Recommendation to fix */
  recommendation: string;
  /** Affected content snippet (optional) */
  snippet?: string;
}

/**
 * Agentic analysis result
 */
export interface AgenticAnalysisResult {
  /** Content fidelity findings */
  findings: ContentFinding[];
  /** Agentic score (0-100) based on semantic analysis */
  score: number;
  /** Summary of content fidelity assessment */
  summary: string;
  /** Critical content gaps identified */
  criticalGaps: string[];
  /** Minor improvements suggested */
  minorImprovements: string[];
}

/**
 * Combined content fidelity analysis result
 */
export interface ContentAnalysisResult {
  /** URL of PDF source */
  pdfUrl: string;
  /** URL of migrated webpage */
  migratedUrl: string;
  /** Deterministic analysis results */
  deterministic: ContentMetrics;
  /** Agentic analysis results (if available) */
  agentic?: AgenticAnalysisResult;
  /** Final weighted score (70% agentic + 30% deterministic) */
  finalScore: number;
  /** Grade based on final score */
  grade: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical';
  /** Timestamp of analysis */
  timestamp: string;
  /** Analysis mode */
  mode: 'full' | 'deterministic';
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
