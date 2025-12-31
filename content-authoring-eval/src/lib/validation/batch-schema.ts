/**
 * PHASE 26: Zod Validation Schemas for Batch Evaluation
 *
 * Validates JSON input/output for batch evaluation mode.
 */

import { z } from 'zod';

/**
 * Single page schema for batch evaluation
 */
export const batchPageSchema = z.object({
  id: z.string().min(1, 'Page ID is required').regex(/^[a-zA-Z0-9_-]+$/, 'Page ID must contain only alphanumeric characters, hyphens, and underscores'),
  title: z.string().min(1, 'Page title is required').max(200, 'Page title must be 200 characters or less'),
  sourceUrl: z.string().url('Source URL must be a valid URL'),
  sourceType: z.enum(['pdf', 'html'], { errorMap: () => ({ message: 'Source type must be either "pdf" or "html"' }) }),
  webUrl: z.string().url('Web URL must be a valid URL'),
});

/**
 * Batch evaluation input schema
 * Max 50 pages per batch for performance
 */
export const batchEvaluationInputSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required').regex(/^[a-zA-Z0-9_-]+$/, 'Batch ID must contain only alphanumeric characters, hyphens, and underscores'),
  pages: z.array(batchPageSchema)
    .min(1, 'At least one page is required')
    .max(50, 'Maximum 50 pages per batch'),
}).refine(
  (data) => {
    // Check for duplicate page IDs
    const ids = data.pages.map(p => p.id);
    const uniqueIds = new Set(ids);
    return ids.length === uniqueIds.size;
  },
  {
    message: 'Duplicate page IDs found. Each page must have a unique ID.',
  }
);

/**
 * Grade type validation
 */
export const gradeSchema = z.enum(['Excellent', 'Good', 'Acceptable', 'Needs Improvement', 'Critical']);

/**
 * Severity type validation
 */
export const severitySchema = z.enum(['critical', 'serious', 'moderate', 'minor', 'info']);

/**
 * Dimension type validation
 */
export const dimensionSchema = z.enum(['structure', 'accessibility', 'content', 'visual']);

/**
 * Finding schema
 */
export const findingSchema = z.object({
  dimension: dimensionSchema,
  severity: severitySchema,
  issue: z.string(),
  recommendation: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Dimension result schema
 */
export const dimensionResultSchema = z.object({
  score: z.number().min(0, 'Score must be at least 0').max(100, 'Score must be at most 100'),
  grade: gradeSchema,
  findings: z.array(findingSchema),
});

/**
 * Batch page result schema
 */
export const batchPageResultSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  overallScore: z.number().min(0, 'Overall score must be at least 0').max(100, 'Overall score must be at most 100'),
  overallGrade: gradeSchema,
  dimensions: z.object({
    structure: dimensionResultSchema,
    accessibility: dimensionResultSchema,
    content: dimensionResultSchema,
    visual: dimensionResultSchema,
  }),
  evaluatedAt: z.string().datetime(),
});

/**
 * Batch evaluation output schema
 */
export const batchEvaluationOutputSchema = z.object({
  batchId: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  totalPages: z.number().int({ message: 'Total pages must be an integer' }).positive({ message: 'Total pages must be positive' }),
  results: z.array(batchPageResultSchema),
});

/**
 * Type inference helpers
 */
export type BatchPageInput = z.infer<typeof batchPageSchema>;
export type BatchEvaluationInputType = z.infer<typeof batchEvaluationInputSchema>;
export type DimensionResultType = z.infer<typeof dimensionResultSchema>;
export type BatchPageResultType = z.infer<typeof batchPageResultSchema>;
export type BatchEvaluationOutputType = z.infer<typeof batchEvaluationOutputSchema>;

/**
 * Validation helper function
 * Returns parsed data or throws ZodError with detailed error messages
 */
export function validateBatchInput(data: unknown): BatchEvaluationInputType {
  return batchEvaluationInputSchema.parse(data);
}

/**
 * Safe validation helper function
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateBatchInput(data: unknown) {
  return batchEvaluationInputSchema.safeParse(data);
}

/**
 * Validate batch output
 */
export function validateBatchOutput(data: unknown): BatchEvaluationOutputType {
  return batchEvaluationOutputSchema.parse(data);
}

/**
 * Safe validate batch output
 */
export function safeValidateBatchOutput(data: unknown) {
  return batchEvaluationOutputSchema.safeParse(data);
}
