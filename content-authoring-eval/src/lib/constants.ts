/**
 * Constants for the Content Authoring Evaluation system
 */

/**
 * Scoring weights for each dimension (must sum to 1.0)
 */
export const DIMENSION_WEIGHTS = {
  structure: 0.25,      // 25% - SEO and document structure
  accessibility: 0.25,  // 25% - WCAG compliance
  content: 0.25,        // 25% - Content fidelity
  visual: 0.25,         // 25% - Visual correctness
} as const;

/**
 * Score thresholds for grading
 */
export const GRADE_THRESHOLDS = {
  excellent: 90,           // 90-100: Exceeds original quality
  good: 75,                // 75-89: Matches original, minor issues
  acceptable: 60,          // 60-74: Functional, some issues
  'needs-improvement': 40, // 40-59: Significant issues, rework needed
  critical: 0,             // 0-39: Major failures, not production-ready
} as const;

/**
 * Severity scoring impact (penalty points)
 */
export const SEVERITY_IMPACT = {
  critical: 20,  // -20 points per critical finding
  serious: 10,   // -10 points per serious finding
  moderate: 5,   // -5 points per moderate finding
  minor: 2,      // -2 points per minor finding
  info: 0,       // No penalty for info findings
} as const;

/**
 * localStorage keys
 */
export const STORAGE_KEYS = {
  evaluations: 'content-authoring-eval:evaluations',
  settings: 'content-authoring-eval:settings',
} as const;

/**
 * System version
 */
export const SYSTEM_VERSION = '1.0.0' as const;

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  evaluate: '/api/evaluate',
  evaluateStream: '/api/evaluate/stream',
  evaluateBatch: '/api/evaluate/batch',
  structure: '/api/evaluate/structure',
  accessibility: '/api/evaluate/accessibility',
  content: '/api/evaluate/content',
  visual: '/api/evaluate/visual',
} as const;

/**
 * Agent timeouts (milliseconds)
 */
export const AGENT_TIMEOUTS = {
  structure: 30000,      // 30 seconds
  accessibility: 60000,  // 60 seconds (browser automation)
  content: 60000,        // 60 seconds (PDF parsing + Claude API)
  visual: 90000,         // 90 seconds (screenshots + Claude vision)
} as const;

/**
 * Default evaluation options
 */
export const DEFAULT_EVALUATION_OPTIONS = {
  skipVisual: false,
  skipAccessibility: false,
  skipContent: false,
  skipStructure: false,
} as const;

/**
 * Helper function to calculate grade from score
 */
export function getGrade(score: number): 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical' {
  if (score >= GRADE_THRESHOLDS.excellent) return 'excellent';
  if (score >= GRADE_THRESHOLDS.good) return 'good';
  if (score >= GRADE_THRESHOLDS.acceptable) return 'acceptable';
  if (score >= GRADE_THRESHOLDS['needs-improvement']) return 'needs-improvement';
  return 'critical';
}

/**
 * Helper function to calculate weighted overall score
 */
export function calculateOverallScore(scores: {
  structure?: number;
  accessibility?: number;
  content?: number;
  visual?: number;
}): number {
  let totalWeight = 0;
  let weightedSum = 0;

  if (scores.structure !== undefined) {
    weightedSum += scores.structure * DIMENSION_WEIGHTS.structure;
    totalWeight += DIMENSION_WEIGHTS.structure;
  }
  if (scores.accessibility !== undefined) {
    weightedSum += scores.accessibility * DIMENSION_WEIGHTS.accessibility;
    totalWeight += DIMENSION_WEIGHTS.accessibility;
  }
  if (scores.content !== undefined) {
    weightedSum += scores.content * DIMENSION_WEIGHTS.content;
    totalWeight += DIMENSION_WEIGHTS.content;
  }
  if (scores.visual !== undefined) {
    weightedSum += scores.visual * DIMENSION_WEIGHTS.visual;
    totalWeight += DIMENSION_WEIGHTS.visual;
  }

  // Avoid division by zero
  if (totalWeight === 0) return 0;

  return Math.round(weightedSum / totalWeight);
}
