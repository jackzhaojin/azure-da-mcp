'use client';

import { useLocalStorage } from './useLocalStorage';
import { EvaluationReport, EvaluationStorage, BatchEvaluationReport, AnyEvaluationReport } from '@/types/evaluation';
import { STORAGE_KEYS } from '@/lib/constants';

/**
 * PHASE 32: Maximum evaluations to store (enforced limit)
 */
const MAX_EVALUATIONS = 50;

/**
 * Hook to manage evaluation reports in localStorage
 * Supports both single-page and batch evaluations
 */
export function useEvaluations() {
  const [storage, setStorage] = useLocalStorage<EvaluationStorage>(
    STORAGE_KEYS.evaluations,
    {
      evaluations: [],
      lastUpdated: new Date().toISOString(),
    },
    // PHASE 32: Migration function to add 'type' discriminator to existing evaluations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (oldData: any): EvaluationStorage => {
      if (!oldData?.evaluations) {
        return {
          evaluations: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const migratedEvaluations: AnyEvaluationReport[] = oldData.evaluations.map((e: any): AnyEvaluationReport => {
        // If it already has a type, trust it
        if (e.type === 'batch' || e.type === 'single') {
          return e as AnyEvaluationReport;
        }

        // Default to 'single' for legacy evaluations
        return {
          ...e,
          type: 'single',
        } as EvaluationReport;
      });

      return {
        evaluations: migratedEvaluations,
        lastUpdated: oldData.lastUpdated || new Date().toISOString(),
      };
    }
  );

  /**
   * Add a new single-page evaluation report
   */
  const addEvaluation = (report: EvaluationReport) => {
    setStorage((prev) => {
      const newEvaluations = [
        { ...report, type: 'single' as const },
        ...prev.evaluations,
      ];

      // Enforce max limit (keep newest 50)
      const limitedEvaluations = newEvaluations.slice(0, MAX_EVALUATIONS);

      return {
        evaluations: limitedEvaluations,
        lastUpdated: new Date().toISOString(),
      };
    });
  };

  /**
   * PHASE 32: Add a batch evaluation report
   */
  const addBatchEvaluation = (batchReport: BatchEvaluationReport) => {
    setStorage((prev) => {
      const newEvaluations = [
        { ...batchReport, type: 'batch' as const },
        ...prev.evaluations,
      ];

      // Enforce max limit (keep newest 50)
      const limitedEvaluations = newEvaluations.slice(0, MAX_EVALUATIONS);

      return {
        evaluations: limitedEvaluations,
        lastUpdated: new Date().toISOString(),
      };
    });
  };

  /**
   * Update an existing evaluation report
   * PHASE 32: Supports both single and batch evaluations
   */
  const updateEvaluation = (id: string, updates: Partial<AnyEvaluationReport>) => {
    setStorage((prev) => ({
      evaluations: prev.evaluations.map((evaluation): AnyEvaluationReport =>
        evaluation.id === id ? { ...evaluation, ...updates } as AnyEvaluationReport : evaluation
      ),
      lastUpdated: new Date().toISOString(),
    }));
  };

  /**
   * Delete an evaluation report
   */
  const deleteEvaluation = (id: string) => {
    setStorage((prev) => ({
      evaluations: prev.evaluations.filter((evaluation) => evaluation.id !== id),
      lastUpdated: new Date().toISOString(),
    }));
  };

  /**
   * Get a single evaluation by ID (works for both single and batch)
   */
  const getEvaluation = (id: string): AnyEvaluationReport | undefined => {
    return storage.evaluations.find((evaluation) => evaluation.id === id);
  };

  /**
   * PHASE 32: Get single-page evaluations only
   */
  const getSingleEvaluations = (): EvaluationReport[] => {
    return storage.evaluations.filter((e): e is EvaluationReport => e.type === 'single');
  };

  /**
   * PHASE 32: Get batch evaluations only
   */
  const getBatchEvaluations = (): BatchEvaluationReport[] => {
    return storage.evaluations.filter((e): e is BatchEvaluationReport => e.type === 'batch');
  };

  /**
   * PHASE 32: Get storage usage stats
   */
  const getStorageStats = () => {
    const jsonString = JSON.stringify(storage);
    const sizeInBytes = new Blob([jsonString]).size;
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

    return {
      totalEvaluations: storage.evaluations.length,
      singleCount: getSingleEvaluations().length,
      batchCount: getBatchEvaluations().length,
      sizeInMB: parseFloat(sizeInMB),
      maxEvaluations: MAX_EVALUATIONS,
      percentFull: Math.round((storage.evaluations.length / MAX_EVALUATIONS) * 100),
    };
  };

  /**
   * Clear all evaluations
   */
  const clearEvaluations = () => {
    setStorage({
      evaluations: [],
      lastUpdated: new Date().toISOString(),
    });
  };

  /**
   * Get evaluations sorted by date (newest first)
   * PHASE 32: Returns all evaluation types (single + batch)
   */
  const getSortedEvaluations = (): AnyEvaluationReport[] => {
    return [...storage.evaluations].sort((a, b) => {
      return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
    });
  };

  return {
    evaluations: storage.evaluations,
    sortedEvaluations: getSortedEvaluations(),
    lastUpdated: storage.lastUpdated,
    addEvaluation,
    addBatchEvaluation,
    updateEvaluation,
    deleteEvaluation,
    getEvaluation,
    getSingleEvaluations,
    getBatchEvaluations,
    getStorageStats,
    clearEvaluations,
  };
}
