/**
 * PHASE 28: SSE Client Hook for Batch Evaluation Streaming
 *
 * Connects to /api/evaluate/batch-stream and manages real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BatchEvaluationEvent, BatchPageStatus, BatchDimensionStatus, Finding } from '@/types/evaluation';

/**
 * Per-page state for real-time table updates
 */
export interface PageEvaluationState {
  pageId: string;
  title: string;
  status: BatchPageStatus;
  dimensions: {
    structure: BatchDimensionStatus;
    accessibility: BatchDimensionStatus;
    content: BatchDimensionStatus;
    visual: BatchDimensionStatus;
  };
  scores: {
    structure?: number;
    accessibility?: number;
    content?: number;
    visual?: number;
    overall?: number;
  };
  findings: {
    structure: Finding[];
    accessibility: Finding[];
    content: Finding[];
    visual: Finding[];
  };
  error?: string;
}

/**
 * Hook state
 */
interface UseBatchEvaluationStreamState {
  isConnected: boolean;
  isComplete: boolean;
  error: string | null;
  pageStates: Map<string, PageEvaluationState>;
}

/**
 * Hook return type
 */
export interface UseBatchEvaluationStreamReturn extends UseBatchEvaluationStreamState {
  startEvaluation: (batchId: string, pages: { id: string; title: string }[]) => void;
  cancelEvaluation: () => void;
  reset: () => void;
  getFailedPages: () => { id: string; title: string; error?: string }[];
}

/**
 * Calculate overall score from dimension scores
 */
function calculateOverallScore(scores: {
  structure?: number;
  accessibility?: number;
  content?: number;
  visual?: number;
}): number {
  const { structure, accessibility, content, visual } = scores;
  const validScores = [structure, accessibility, content, visual].filter((s) => s !== undefined) as number[];

  if (validScores.length === 0) return 0;

  // Use weighted average (same as evaluator)
  const weights = { structure: 0.25, accessibility: 0.25, content: 0.25, visual: 0.25 };
  let totalScore = 0;
  let totalWeight = 0;

  if (structure !== undefined) {
    totalScore += structure * weights.structure;
    totalWeight += weights.structure;
  }
  if (accessibility !== undefined) {
    totalScore += accessibility * weights.accessibility;
    totalWeight += weights.accessibility;
  }
  if (content !== undefined) {
    totalScore += content * weights.content;
    totalWeight += weights.content;
  }
  if (visual !== undefined) {
    totalScore += visual * weights.visual;
    totalWeight += weights.visual;
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
}

/**
 * Custom hook for batch evaluation streaming
 */
export function useBatchEvaluationStream(): UseBatchEvaluationStreamReturn {
  const [state, setState] = useState<UseBatchEvaluationStreamState>({
    isConnected: false,
    isComplete: false,
    error: null,
    pageStates: new Map(),
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  /**
   * Start batch evaluation with SSE streaming
   */
  const startEvaluation = useCallback(
    (batchId: string, pages: { id: string; title: string }[]) => {
      // Initialize page states
      const initialStates = new Map<string, PageEvaluationState>();
      for (const page of pages) {
        initialStates.set(page.id, {
          pageId: page.id,
          title: page.title,
          status: 'queued',
          dimensions: {
            structure: 'pending',
            accessibility: 'pending',
            content: 'pending',
            visual: 'pending',
          },
          scores: {},
          findings: {
            structure: [],
            accessibility: [],
            content: [],
            visual: [],
          },
        });
      }

      setState({
        isConnected: false,
        isComplete: false,
        error: null,
        pageStates: initialStates,
      });

      // Create EventSource connection
      const url = `/api/evaluate/batch-stream?batchId=${encodeURIComponent(batchId)}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true }));
      };

      eventSource.onmessage = (event) => {
        try {
          const data: BatchEvaluationEvent = JSON.parse(event.data);

          setState((prev) => {
            const newStates = new Map(prev.pageStates);
            const pageState = newStates.get(data.pageId);

            if (!pageState) {
              // Page not found (might be batch:completed event)
              if (data.type === 'batch:completed') {
                return { ...prev, isComplete: true, isConnected: false };
              }
              return prev;
            }

            // Update page state based on event type
            switch (data.type) {
              case 'page:queued':
                pageState.status = 'queued';
                break;

              case 'page:started':
                pageState.status = 'running';
                break;

              case 'dimension:started':
                if (data.dimension) {
                  pageState.dimensions[data.dimension] = 'running';
                }
                break;

              case 'dimension:completed':
                if (data.dimension && data.score !== undefined) {
                  pageState.dimensions[data.dimension] = 'completed';
                  pageState.scores[data.dimension] = data.score;

                  // Store findings if provided
                  if (data.findings) {
                    pageState.findings[data.dimension] = data.findings;
                  }

                  // Calculate overall score if all dimensions complete
                  const allComplete = Object.values(pageState.dimensions).every(
                    (status) => status === 'completed' || status === 'error'
                  );
                  if (allComplete) {
                    pageState.scores.overall = calculateOverallScore(pageState.scores);
                  }
                }
                break;

              case 'page:completed':
                pageState.status = 'done';
                if (data.score !== undefined) {
                  pageState.scores.overall = data.score;
                }
                break;

              case 'page:error':
                pageState.status = 'error';
                pageState.error = data.error;
                break;

              case 'batch:completed':
                return { ...prev, isComplete: true, isConnected: false };
            }

            newStates.set(data.pageId, { ...pageState });
            return { ...prev, pageStates: newStates };
          });
        } catch (error) {
          console.error('Failed to parse SSE event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: 'Connection lost. Please refresh and try again.',
        }));
        eventSource.close();
      };
    },
    []
  );

  /**
   * Cancel ongoing evaluation
   */
  const cancelEvaluation = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      error: 'Evaluation cancelled by user',
    }));
  }, []);

  /**
   * Get list of failed pages
   */
  const getFailedPages = useCallback(() => {
    const failedPages: { id: string; title: string; error?: string }[] = [];

    Array.from(state.pageStates.entries()).forEach(([pageId, pageState]) => {
      if (pageState.status === 'error') {
        failedPages.push({
          id: pageId,
          title: pageState.title,
          error: pageState.error,
        });
      }
    });

    return failedPages;
  }, [state.pageStates]);

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState({
      isConnected: false,
      isComplete: false,
      error: null,
      pageStates: new Map(),
    });
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    startEvaluation,
    cancelEvaluation,
    getFailedPages,
    reset,
  };
}
