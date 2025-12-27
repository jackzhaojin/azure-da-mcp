'use client';

import { useLocalStorage } from './useLocalStorage';
import { EvaluationReport, EvaluationStorage } from '@/types/evaluation';
import { STORAGE_KEYS } from '@/lib/constants';

/**
 * Hook to manage evaluation reports in localStorage
 */
export function useEvaluations() {
  const [storage, setStorage] = useLocalStorage<EvaluationStorage>(
    STORAGE_KEYS.evaluations,
    {
      evaluations: [],
      lastUpdated: new Date().toISOString(),
    }
  );

  /**
   * Add a new evaluation report
   */
  const addEvaluation = (report: EvaluationReport) => {
    setStorage((prev) => ({
      evaluations: [report, ...prev.evaluations],
      lastUpdated: new Date().toISOString(),
    }));
  };

  /**
   * Update an existing evaluation report
   */
  const updateEvaluation = (id: string, updates: Partial<EvaluationReport>) => {
    setStorage((prev) => ({
      evaluations: prev.evaluations.map((evaluation) =>
        evaluation.id === id ? { ...evaluation, ...updates } : evaluation
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
   * Get a single evaluation by ID
   */
  const getEvaluation = (id: string): EvaluationReport | undefined => {
    return storage.evaluations.find((evaluation) => evaluation.id === id);
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
   */
  const getSortedEvaluations = (): EvaluationReport[] => {
    return [...storage.evaluations].sort((a, b) => {
      return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
    });
  };

  return {
    evaluations: storage.evaluations,
    sortedEvaluations: getSortedEvaluations(),
    lastUpdated: storage.lastUpdated,
    addEvaluation,
    updateEvaluation,
    deleteEvaluation,
    getEvaluation,
    clearEvaluations,
  };
}
