/**
 * Structure Agent Types
 * Types for HTML structure analysis and metadata extraction
 */

export interface MetaTags {
  title: string | null;
  description: string | null;
  keywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogType: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  canonical: string | null;
  robots: string | null;
  viewport: string | null;
  charset: string | null;
}

export interface HeadingNode {
  level: number;
  text: string;
  id: string | null;
}

export interface HeadingHierarchy {
  headings: HeadingNode[];
  hasH1: boolean;
  h1Count: number;
  hasProperNesting: boolean;
  issues: string[];
}

export interface DocumentStructure {
  hasHeader: boolean;
  hasNav: boolean;
  hasMain: boolean;
  hasFooter: boolean;
  hasAside: boolean;
  sectionCount: number;
  articleCount: number;
  formCount: number;
}

export interface LinkAnalysis {
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
  brokenAnchors: number;
  linksWithoutText: number;
}

export interface ContentBlocks {
  header: string | null;
  nav: string | null;
  main: string | null;
  footer: string | null;
  aside: string | null;
}

export interface StructureMetrics {
  metaTags: MetaTags;
  headingHierarchy: HeadingHierarchy;
  documentStructure: DocumentStructure;
  linkAnalysis: LinkAnalysis;
  contentBlocks: ContentBlocks;
  rawHtmlLength: number;
  textContentLength: number;
}

/**
 * Comparison result for structure differences
 */
export interface StructureComparison {
  metaTagsDiff: {
    missing: string[];
    extra: string[];
    changed: string[];
  };
  headingDiff: {
    missingHeadings: string[];
    extraHeadings: string[];
    hierarchyChanged: boolean;
  };
  structureDiff: {
    missingElements: string[];
    extraElements: string[];
  };
  score: number; // 0-100
}

/**
 * Finding from agentic analysis
 */
export interface StructureFinding {
  dimension: 'structure';
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  issue: string;
  recommendation: string;
  impact: string;
}

/**
 * Agentic analysis result from Claude
 */
export interface AgenticAnalysisResult {
  findings: StructureFinding[];
  score: number; // 0-100
  summary: string;
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
 * Combined deterministic + agentic result
 */
export interface StructureAnalysisResult {
  url: string;
  deterministic: StructureMetrics;
  agentic: AgenticAnalysisResult;
  finalScore: number; // 0-100
  grade: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical';
  timestamp: string;
  metadata?: {
    toolUsage?: ToolUsageMetadata;
  };
}

/**
 * Source type for structure comparison (Phase 36)
 */
export type StructureSourceType = 'html' | 'pdf' | 'none';

/**
 * PDF-extracted structure (subset of full HTML structure)
 * Phase 36: PDF doesn't have semantic HTML, only headings and content
 */
export interface PDFStructure {
  /** Headings extracted from PDF */
  headings: string[];
  /** Estimated heading levels (heuristic) */
  headingLevels: Array<{ text: string; level: number }>;
  /** Paragraph count */
  paragraphCount: number;
  /** Word count */
  wordCount: number;
  /** PDF metadata */
  metadata?: {
    title?: string;
    author?: string;
  };
}
