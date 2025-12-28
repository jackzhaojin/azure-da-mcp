/**
 * Tool Logging Utility - Phase 20
 *
 * Provides plugin-based hooks to detect and log tool invocations in Agent SDK.
 * This is CRITICAL for verifying agents actually use tools (Playwright, Bash, etc.)
 * and not just performing text-only analysis.
 */

import { createLogger } from './logger';

const logger = createLogger('agent');

/**
 * Tool invocation record
 */
export interface ToolInvocation {
  toolName: string;
  input: unknown;
  timestamp: string;
  duration?: number;
  status?: 'success' | 'error';
  error?: string;
}

/**
 * Tool usage statistics
 */
export interface ToolUsageStats {
  totalInvocations: number;
  toolCounts: Record<string, number>;
  invocations: ToolInvocation[];
  startTime: string;
  endTime?: string;
}

/**
 * Create a tool logging plugin for Agent SDK
 *
 * This plugin hooks into the agent's lifecycle to capture:
 * - Every tool invocation (name + input parameters)
 * - Tool execution results (success/error)
 * - Timing information
 *
 * @returns Plugin configuration for Agent SDK query() options
 */
export function createToolLoggingPlugin() {
  const stats: ToolUsageStats = {
    totalInvocations: 0,
    toolCounts: {},
    invocations: [],
    startTime: new Date().toISOString(),
  };

  const pendingInvocations = new Map<string, { startTime: number; invocation: ToolInvocation }>();

  return {
    type: 'local' as const,
    name: 'tool-usage-tracker',
    version: '1.0.0',
    path: __dirname,

    /**
     * Initialize plugin (called once per query)
     */
    initialize: async () => {
      logger.info('Tool logging plugin initialized', {
        startTime: stats.startTime,
      });
    },

    /**
     * Called BEFORE each tool invocation
     * This is the key hook for detecting tool usage
     */
    onToolCall: async (toolName: string, input: unknown) => {
      const invocation: ToolInvocation = {
        toolName,
        input,
        timestamp: new Date().toISOString(),
      };

      // Track invocation start time
      const invocationId = `${toolName}-${Date.now()}`;
      pendingInvocations.set(invocationId, {
        startTime: Date.now(),
        invocation,
      });

      // Update stats
      stats.totalInvocations++;
      stats.toolCounts[toolName] = (stats.toolCounts[toolName] || 0) + 1;
      stats.invocations.push(invocation);

      // Log tool invocation with input preview
      const inputPreview = typeof input === 'object'
        ? JSON.stringify(input).substring(0, 200)
        : String(input).substring(0, 200);

      logger.info(`🔧 Tool invoked: ${toolName}`, {
        toolName,
        inputPreview,
        invocationCount: stats.totalInvocations,
        timestamp: invocation.timestamp,
      });

      // Special logging for key tools
      if (toolName === 'mcp__playwright__browser_navigate') {
        logger.info('🌐 Playwright navigation requested', {
          url: (input as { url?: string })?.url,
        });
      } else if (toolName === 'Bash') {
        logger.info('⚡ Bash command execution requested', {
          command: (input as { command?: string })?.command?.substring(0, 100),
        });
      } else if (toolName === 'Read' || toolName === 'Write') {
        logger.info('📄 File I/O requested', {
          operation: toolName,
          path: (input as { file_path?: string })?.file_path,
        });
      }
    },

    /**
     * Called for each message in the stream
     * Can detect tool results here
     */
    onMessage: async (message: { type: string; [key: string]: unknown }) => {
      if (message.type === 'tool_result') {
        const toolName = (message as { tool_name?: string }).tool_name;
        logger.debug('Tool result received', {
          toolName,
          type: message.type,
        });

        // Update pending invocations with result status
        const entries = Array.from(pendingInvocations.entries());
        for (const [invocationId, pending] of entries) {
          if (pending.invocation.toolName === toolName) {
            const duration = Date.now() - pending.startTime;
            pending.invocation.duration = duration;
            pending.invocation.status = 'success';
            pendingInvocations.delete(invocationId);

            logger.info(`✅ Tool completed: ${toolName}`, {
              duration: `${duration}ms`,
            });
            break;
          }
        }
      } else if (message.type === 'error') {
        logger.error('Tool execution error', new Error(String(message)), {
          messageType: message.type,
        });

        // Mark pending invocations as failed
        const entries = Array.from(pendingInvocations.entries());
        for (const [invocationId, pending] of entries) {
          pending.invocation.status = 'error';
          pending.invocation.error = String(message);
          pendingInvocations.delete(invocationId);
        }
      }
    },

    /**
     * Get current tool usage statistics
     */
    getStats: (): ToolUsageStats => {
      return {
        ...stats,
        endTime: new Date().toISOString(),
      };
    },
  };
}

/**
 * Analyze tool usage stats for verification
 *
 * @param stats Tool usage statistics
 * @returns Verification result with warnings
 */
export function verifyToolUsage(stats: ToolUsageStats): {
  passed: boolean;
  warnings: string[];
  summary: string;
} {
  const warnings: string[] = [];

  // Check if ANY tools were invoked
  if (stats.totalInvocations === 0) {
    warnings.push('❌ CRITICAL: No tools invoked - agent may be doing text-only analysis');
  }

  // Check for expected tools based on agent type
  const hasPlaywright = Object.keys(stats.toolCounts).some(tool => tool.startsWith('mcp__playwright'));
  const hasBash = stats.toolCounts['Bash'] > 0;
  const hasFileIO = stats.toolCounts['Read'] > 0 || stats.toolCounts['Write'] > 0;

  if (!hasPlaywright && !hasBash && !hasFileIO) {
    warnings.push('⚠️  WARNING: No browser automation, bash execution, or file I/O detected');
  }

  // Generate summary
  const toolList = Object.entries(stats.toolCounts)
    .map(([tool, count]) => `${tool}: ${count}`)
    .join(', ');

  const summary = `Total invocations: ${stats.totalInvocations} | Tools used: ${toolList || 'none'}`;

  return {
    passed: stats.totalInvocations > 0,
    warnings,
    summary,
  };
}

/**
 * Format tool usage stats for logging
 */
export function formatToolUsageStats(stats: ToolUsageStats): string {
  const lines: string[] = [];

  lines.push('=== Tool Usage Statistics ===');
  lines.push(`Total Invocations: ${stats.totalInvocations}`);
  lines.push(`Duration: ${stats.startTime} → ${stats.endTime || 'in progress'}`);
  lines.push('');
  lines.push('Tool Breakdown:');

  for (const [tool, count] of Object.entries(stats.toolCounts)) {
    lines.push(`  - ${tool}: ${count}`);
  }

  lines.push('');
  lines.push('Invocation Details:');

  for (const inv of stats.invocations) {
    const status = inv.status === 'success' ? '✅' : inv.status === 'error' ? '❌' : '⏳';
    const duration = inv.duration ? ` (${inv.duration}ms)` : '';
    lines.push(`  ${status} ${inv.toolName}${duration} @ ${inv.timestamp}`);
  }

  return lines.join('\n');
}
