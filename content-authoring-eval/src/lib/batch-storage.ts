/**
 * PHASE 27: In-Memory Batch Storage
 *
 * Temporary storage for batch evaluation results.
 * In production, this would be replaced with a database.
 */

import { BatchEvaluationInput, BatchEvaluationOutput } from '@/types/evaluation';

/**
 * In-memory storage for batch data and results
 */
class BatchStorage {
  private batches: Map<string, BatchEvaluationInput> = new Map();
  private results: Map<string, BatchEvaluationOutput> = new Map();

  /**
   * Store a batch for processing
   */
  storeBatch(batchId: string, batch: BatchEvaluationInput): void {
    this.batches.set(batchId, batch);
  }

  /**
   * Get a stored batch
   */
  getBatch(batchId: string): BatchEvaluationInput | undefined {
    return this.batches.get(batchId);
  }

  /**
   * Store batch results
   */
  storeResults(batchId: string, results: BatchEvaluationOutput): void {
    this.results.set(batchId, results);
  }

  /**
   * Get batch results
   */
  getResults(batchId: string): BatchEvaluationOutput | undefined {
    return this.results.get(batchId);
  }

  /**
   * Check if batch exists
   */
  hasBatch(batchId: string): boolean {
    return this.batches.has(batchId);
  }

  /**
   * Check if results exist
   */
  hasResults(batchId: string): boolean {
    return this.results.has(batchId);
  }

  /**
   * Delete a batch and its results
   */
  deleteBatch(batchId: string): void {
    this.batches.delete(batchId);
    this.results.delete(batchId);
  }

  /**
   * List all batch IDs
   */
  listBatches(): string[] {
    return Array.from(this.batches.keys());
  }

  /**
   * List all batch IDs with results
   */
  listCompletedBatches(): string[] {
    return Array.from(this.results.keys());
  }

  /**
   * Clear all storage (for testing)
   */
  clear(): void {
    this.batches.clear();
    this.results.clear();
  }
}

/**
 * Singleton instance using globalThis to persist across hot reloads in dev mode
 */
declare global {
  var __batchStorage: BatchStorage | undefined;
}

if (!globalThis.__batchStorage) {
  globalThis.__batchStorage = new BatchStorage();
}

export const batchStorage = globalThis.__batchStorage;
