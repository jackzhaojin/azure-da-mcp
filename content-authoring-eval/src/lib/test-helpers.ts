/**
 * Test Helper Functions
 *
 * Exposes functions to window object for Playwright testing
 * Only available in development mode
 */

import { BatchEvaluationInput } from '@/types/evaluation';

declare global {
  interface Window {
    __TEST__: {
      importBatch: (batch: BatchEvaluationInput) => Promise<void>;
      startEvaluation: (batchId: string) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getState: () => any;
      waitForCompletion: (timeout?: number) => Promise<void>;
    };
  }
}

/**
 * Initialize test helpers (call this in development mode only)
 */
export function initTestHelpers() {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') {
    return;
  }

  window.__TEST__ = {
    /**
     * Programmatically import a batch via API
     */
    async importBatch(batch: BatchEvaluationInput) {
      console.log('[TEST] Importing batch:', batch.batchId);

      const response = await fetch('/api/evaluate/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Import failed: ${error.error || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('[TEST] Batch imported successfully:', result);

      // Trigger a page reload to load the batch in UI
      window.location.reload();
    },

    /**
     * Start batch evaluation by clicking the Start Evaluation button
     */
    startEvaluation(batchId: string) {
      const buttons = Array.from(document.querySelectorAll('button'));
      const startButton = buttons.find(btn => btn.textContent?.includes('Start Evaluation'));

      if (!startButton) {
        throw new Error('Start Evaluation button not found - is batch loaded?');
      }

      console.log('[TEST] Starting evaluation for batch:', batchId);
      (startButton as HTMLButtonElement).click();
    },

    /**
     * Wait for batch evaluation to complete
     */
    async waitForCompletion(timeout = 300000) {
      console.log('[TEST] Waiting for completion (timeout:', timeout, 'ms)');
      const startTime = Date.now();

      return new Promise<void>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const state = window.__TEST__.getState();

          // Check if completed
          if (state.hasComplete && !state.isRunning) {
            console.log('[TEST] Evaluation completed!', state);
            clearInterval(checkInterval);
            resolve();
            return;
          }

          // Check if error occurred
          if (state.hasError && state.errorText && !state.errorText.includes('Import')) {
            console.error('[TEST] Error detected:', state.errorText);
            clearInterval(checkInterval);
            reject(new Error(`Evaluation failed: ${state.errorText}`));
            return;
          }

          // Check timeout
          if (Date.now() - startTime > timeout) {
            console.error('[TEST] Timeout waiting for completion');
            clearInterval(checkInterval);
            reject(new Error('Timeout waiting for completion'));
            return;
          }

          // Log progress
          if (state.progressText) {
            console.log('[TEST] Progress:', state.progressText);
          }
        }, 2000); // Check every 2 seconds
      });
    },

    /**
     * Get current page state for testing
     */
    getState() {
      const hasError = !!document.querySelector('.bg-red-50');
      const hasConnectionLost = Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent?.includes('Connection lost')
      );
      const exportButton = Array.from(document.querySelectorAll('button')).find(btn =>
        btn.textContent?.includes('Export Results')
      ) as HTMLButtonElement | undefined;

      const runningBadge = Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent?.includes('Running...')
      );

      const completeBadge = Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent?.includes('Complete') && !el.textContent?.includes('0 pages')
      );

      // Count completed pages in table
      const doneStatusElements = Array.from(document.querySelectorAll('*')).filter(el =>
        el.textContent?.trim() === 'Done'
      );

      return {
        hasError,
        errorText: hasError ? document.querySelector('.bg-red-50')?.textContent : null,
        hasComplete: completeBadge,
        hasConnectionLost,
        exportEnabled: exportButton ? !exportButton.disabled : false,
        isRunning: runningBadge,
        completedPages: doneStatusElements.length,
        timestamp: new Date().toISOString(),
      };
    },
  };

  console.log('[TEST] Test helpers initialized. Access via window.__TEST__');
}
