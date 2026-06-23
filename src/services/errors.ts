/**
 * Error handling service — ported from Claude Code's error infrastructure.
 * Provides:
 * - Error categorization (retryable vs non-retryable)
 * - API error classification
 * - Structured error reporting
 * - Error severity levels
 */

export enum ErrorSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal',
}

export enum ErrorCategory {
  API = 'api',
  TOOL = 'tool',
  PERMISSION = 'permission',
  SYSTEM = 'system',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export interface StructuredError {
  message: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  code?: string;
  retryable: boolean;
  cause?: Error;
  timestamp: number;
}

// In-memory error log (ring buffer of last 100 errors)
const MAX_ERRORS = 100;
const errorLog: StructuredError[] = [];

/**
 * Classify an error into a structured format.
 */
export function classifyError(err: unknown): StructuredError {
  const error = err instanceof Error ? err : new Error(String(err));
  const msg = error.message;

  let category = ErrorCategory.UNKNOWN;
  let severity = ErrorSeverity.ERROR;
  let retryable = false;

  // API errors
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Rate limit')) {
    category = ErrorCategory.API;
    severity = ErrorSeverity.WARNING;
    retryable = true;
  } else if (msg.includes('5') && (msg.includes('50') || msg.includes('service'))) {
    category = ErrorCategory.API;
    retryable = true;
  } else if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('Unauthorized')) {
    category = ErrorCategory.API;
    severity = ErrorSeverity.ERROR;
    retryable = false;
  } else if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('timed out')) {
    category = ErrorCategory.TIMEOUT;
    severity = ErrorSeverity.WARNING;
    retryable = true;
  } else if (msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONNRESET')) {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.WARNING;
    retryable = true;
  } else if (msg.includes('permission') || msg.includes('Permission') || msg.includes('denied')) {
    category = ErrorCategory.PERMISSION;
    severity = ErrorSeverity.ERROR;
    retryable = false;
  } else if (
    msg.includes('AbortError') || msg.includes('aborted') ||
    msg.includes('The operation was aborted') ||
    error.name === 'AbortError'
  ) {
    category = ErrorCategory.SYSTEM;
    severity = ErrorSeverity.INFO;
    retryable = false;
  }

  return {
    message: msg,
    severity,
    category,
    retryable,
    cause: error,
    timestamp: Date.now(),
  };
}

/**
 * Log a structured error to the in-memory ring buffer.
 */
export function logError(err: unknown): StructuredError {
  const structured = classifyError(err);
  errorLog.push(structured);
  if (errorLog.length > MAX_ERRORS) {
    errorLog.shift();
  }
  return structured;
}

/**
 * Get recent errors from the log.
 */
export function getRecentErrors(count: number = 10): StructuredError[] {
  return errorLog.slice(-count);
}

/**
 * Get all errors since a given error (reference-based watermark).
 */
export function getErrorsSince(watermark: StructuredError | undefined): StructuredError[] {
  if (!watermark) return [...errorLog];
  const idx = errorLog.lastIndexOf(watermark);
  return idx >= 0 ? errorLog.slice(idx + 1) : [...errorLog];
}

/**
 * Clear the error log.
 */
export function clearErrorLog(): void {
  errorLog.length = 0;
}

/**
 * Format error for user display.
 */
export function formatError(error: StructuredError): string {
  const icon = error.severity === ErrorSeverity.WARNING ? '⚠️'
    : error.severity === ErrorSeverity.ERROR ? '❌'
    : error.severity === ErrorSeverity.FATAL ? '💥'
    : error.severity === ErrorSeverity.INFO ? 'ℹ️'
    : '🔍';

  let msg = `${icon} [${error.category}] ${error.message}`;
  if (error.retryable) {
    msg += ' (retryable)';
  }
  return msg;
}
