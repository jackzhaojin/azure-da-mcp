/**
 * Accessibility Agent - Public API
 */

export * from './types';
export {
  analyzeAccessibility,
  scanAccessibility,
  calculateMetrics,
  compareAccessibility,
  comparePDFToHTMLAccessibility
} from './deterministic';
export { analyzeAccessibilityWithClaude } from './agentic';
export { extractPDFAccessibility, fetchAndExtractPDFAccessibility } from './pdf-accessibility';
