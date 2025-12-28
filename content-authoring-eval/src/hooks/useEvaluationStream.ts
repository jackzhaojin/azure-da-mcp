/**
 * useEvaluationStream Hook
 *
 * React hook for consuming Server-Sent Events (SSE) from /api/evaluate/stream
 * Provides real-time updates as each agent completes.
 */

import { useState, useCallback, useRef } from 'react';
import { EvaluationRequest, EvaluationReport, AgentResult } from '@/types/evaluation';

/**
 * SSE event types
 */
type SSEEventType = 'agent-start' | 'agent-complete' | 'evaluation-complete' | 'error';

/**
 * SSE event payload
 */
interface SSEEvent {
  type: SSEEventType;
  dimension?: 'structure' | 'accessibility' | 'content' | 'visual';
  progress?: number; // 0-100
  result?: AgentResult;
  report?: EvaluationReport;
  error?: string;
}

/**
 * Agent progress state
 */
interface AgentProgress {
  structure: 'pending' | 'running' | 'completed' | 'failed';
  accessibility: 'pending' | 'running' | 'completed' | 'failed';
  content: 'pending' | 'running' | 'completed' | 'failed';
  visual: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * Hook state
 */
interface EvaluationStreamState {
  isStreaming: boolean;
  progress: number; // 0-100
  agentProgress: AgentProgress;
  currentReport: Partial<EvaluationReport> | null;
  finalReport: EvaluationReport | null;
  error: string | null;
}

/**
 * Hook return value
 */
interface UseEvaluationStreamResult extends EvaluationStreamState {
  startEvaluation: (request: EvaluationRequest) => Promise<void>;
  stopEvaluation: () => void;
  reset: () => void;
}

/**
 * Initial state
 */
const initialState: EvaluationStreamState = {
  isStreaming: false,
  progress: 0,
  agentProgress: {
    structure: 'pending',
    accessibility: 'pending',
    content: 'pending',
    visual: 'pending',
  },
  currentReport: null,
  finalReport: null,
  error: null,
};

/**
 * useEvaluationStream Hook
 *
 * Usage:
 * ```tsx
 * const { startEvaluation, progress, agentProgress, finalReport, error } = useEvaluationStream();
 *
 * const handleSubmit = async () => {
 *   await startEvaluation({ migratedUrl: 'https://example.com' });
 * };
 * ```
 */
export function useEvaluationStream(): UseEvaluationStreamResult {
  const [state, setState] = useState<EvaluationStreamState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Handle individual SSE events
   */
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    setState((prev) => {
      const newState = { ...prev };

      switch (event.type) {
        case 'agent-start':
          if (event.dimension) {
            newState.agentProgress = {
              ...prev.agentProgress,
              [event.dimension]: 'running',
            };
          }
          break;

        case 'agent-complete':
          if (event.dimension && event.result) {
            newState.agentProgress = {
              ...prev.agentProgress,
              [event.dimension]: 'completed',
            };
            newState.progress = event.progress || prev.progress;

            // Update current report with agent result
            newState.currentReport = {
              ...prev.currentReport,
              results: {
                ...prev.currentReport?.results,
                [event.dimension]: event.result,
              },
            };
          }
          break;

        case 'evaluation-complete':
          if (event.report) {
            newState.isStreaming = false;
            newState.progress = 100;
            newState.finalReport = event.report;
            newState.currentReport = event.report;
          }
          break;

        case 'error':
          if (event.dimension) {
            newState.agentProgress = {
              ...prev.agentProgress,
              [event.dimension]: 'failed',
            };
          }
          newState.error = event.error || 'Unknown error';
          newState.isStreaming = false;
          break;
      }

      return newState;
    });
  }, []);

  /**
   * Start evaluation with SSE streaming
   */
  const startEvaluation = useCallback(async (request: EvaluationRequest) => {
    // Reset state
    setState({
      ...initialState,
      isStreaming: true,
    });

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    try {
      // NOTE: Next.js API routes don't support SSE with EventSource pattern
      // We need to use fetch with streaming instead
      const response = await fetch('/api/evaluate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Evaluation failed');
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (separated by double newlines)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete event in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData: SSEEvent = JSON.parse(line.slice(6));
              handleSSEEvent(eventData);
            } catch (err) {
              console.error('Failed to parse SSE event:', err);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled - don't treat as error
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  }, [handleSSEEvent]);

  /**
   * Stop evaluation (abort stream)
   */
  const stopEvaluation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }));
  }, []);

  /**
   * Reset state to initial
   */
  const reset = useCallback(() => {
    stopEvaluation();
    setState(initialState);
  }, [stopEvaluation]);

  return {
    ...state,
    startEvaluation,
    stopEvaluation,
    reset,
  };
}
