/**
 * Structured Logging Utility
 *
 * Provides consistent logging format with timestamps, context, and metadata
 * for monitoring and debugging in development and production.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = 'api' | 'agent' | 'deterministic' | 'agentic' | 'content' | 'accessibility' | 'accessibility-pdf' | 'visual' | 'structure-pdf' | 'client' | 'system';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: LogContext;
  message: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const emoji = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
  };

  const color = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[34m',  // Blue
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
  };
  const reset = '\x1b[0m';

  let output = `${emoji[entry.level]} ${color[entry.level]}[${entry.timestamp}] [${entry.context.toUpperCase()}] ${entry.message}${reset}`;

  if (entry.duration !== undefined) {
    output += ` ${color[entry.level]}(${entry.duration}ms)${reset}`;
  }

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    output += `\n  📊 Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
  }

  if (entry.error) {
    output += `\n  🐛 Error: ${entry.error.name} - ${entry.error.message}`;
    if (entry.error.stack) {
      output += `\n  📚 Stack: ${entry.error.stack}`;
    }
  }

  return output;
}

/**
 * Core logging function
 */
function log(level: LogLevel, context: LogContext, message: string, metadata?: Record<string, unknown>, error?: Error, duration?: number) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    metadata,
    duration,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const formatted = formatLogEntry(entry);

  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/**
 * Logger class for specific contexts
 */
export class Logger {
  constructor(private context: LogContext) {}

  debug(message: string, metadata?: Record<string, unknown>) {
    log('debug', this.context, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>) {
    log('info', this.context, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    log('warn', this.context, message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>) {
    log('error', this.context, message, metadata, error);
  }

  /**
   * Log request start
   */
  requestStart(method: string, path: string, metadata?: Record<string, unknown>) {
    this.info(`${method} ${path} - Request received`, metadata);
  }

  /**
   * Log request completion with duration
   */
  requestComplete(method: string, path: string, statusCode: number, durationMs: number, metadata?: Record<string, unknown>) {
    const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
    const message = `${method} ${path} - ${statusCode}`;
    log(level, this.context, message, { ...metadata, statusCode }, undefined, durationMs);
  }

  /**
   * Log operation start
   */
  operationStart(operation: string, metadata?: Record<string, unknown>) {
    this.info(`Starting: ${operation}`, metadata);
  }

  /**
   * Log operation completion
   */
  operationComplete(operation: string, durationMs: number, metadata?: Record<string, unknown>) {
    log('info', this.context, `Completed: ${operation}`, metadata, undefined, durationMs);
  }

  /**
   * Log agent analysis
   */
  agentAnalysis(agentName: string, phase: 'start' | 'complete' | 'error', metadata?: Record<string, unknown>, error?: Error) {
    if (phase === 'error') {
      this.error(`${agentName} analysis failed`, error, metadata);
    } else {
      const message = phase === 'start'
        ? `${agentName} analysis starting...`
        : `${agentName} analysis complete`;
      this.info(message, metadata);
    }
  }
}

/**
 * Create logger for specific context
 */
export function createLogger(context: LogContext): Logger {
  return new Logger(context);
}

/**
 * Timer utility for measuring operation duration
 */
export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time in milliseconds
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Reset timer
   */
  reset(): void {
    this.startTime = Date.now();
  }
}
