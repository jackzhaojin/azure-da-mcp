/**
 * Visual Correctness Agent - Public API
 *
 * Exports visual analysis functions for use in API routes and orchestrator.
 */

export { analyzeVisual, captureScreenshot, compareImages, calculateVisualScore } from './deterministic';
export { analyzeVisualWithClaude, calculateFinalScore, calculateGrade } from './agentic';
export type {
  ScreenshotResult,
  ImageComparisonResult,
  VisualMetrics,
  VisualFinding,
  AgenticAnalysisResult,
  VisualAnalysisResult,
} from './types';
