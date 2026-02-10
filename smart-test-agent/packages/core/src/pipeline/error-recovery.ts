/**
 * Error Recovery Mechanism
 * Handles error capture, state rollback, and retry logic
 * @see Requirements 7.7, 13.2
 */

import type { TestRunState } from '@smart-test-agent/shared';

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'network'
  | 'timeout'
  | 'playwright'
  | 'ai_agent'
  | 'validation'
  | 'internal';

/**
 * Recovery action to take
 */
export type RecoveryAction = 'retry' | 'rollback' | 'skip' | 'abort';

/**
 * Error context for recovery decisions
 */
export interface ErrorContext {
  runId: string;
  step: string;
  state: TestRunState;
  error: Error;
  attemptCount: number;
  timestamp: Date;
}

/**
 * Recovery decision
 */
export interface RecoveryDecision {
  action: RecoveryAction;
  targetState?: TestRunState;
  delay?: number;
  reason: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Error Recovery Manager
 * Provides error classification, recovery decisions, and retry logic
 */
export class ErrorRecoveryManager {
  private retryConfig: RetryConfig;
  private errorHistory: Map<string, ErrorContext[]> = new Map();

  constructor(config: Partial<RetryConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Classify error into category
   */
  classifyError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }

    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('econnrefused')
    ) {
      return 'network';
    }

    if (
      message.includes('playwright') ||
      message.includes('element') ||
      message.includes('selector')
    ) {
      return 'playwright';
    }

    if (
      message.includes('claude') ||
      message.includes('codex') ||
      message.includes('ai')
    ) {
      return 'ai_agent';
    }

    if (
      message.includes('validation') ||
      message.includes('schema') ||
      message.includes('invalid')
    ) {
      return 'validation';
    }

    return 'internal';
  }

  /**
   * Determine recovery action based on error context
   */
  determineRecovery(context: ErrorContext): RecoveryDecision {
    const category = this.classifyError(context.error);
    const { attemptCount } = context;

    // Record error in history
    this.recordError(context);

    // Check if max attempts reached
    if (attemptCount >= this.retryConfig.maxAttempts) {
      return {
        action: 'abort',
        reason: `Max retry attempts (${this.retryConfig.maxAttempts}) reached for ${category} error`,
      };
    }

    // Determine action based on category
    switch (category) {
      case 'network':
        return {
          action: 'retry',
          delay: this.calculateDelay(attemptCount),
          reason: 'Network error - will retry with exponential backoff',
        };

      case 'timeout':
        return {
          action: 'retry',
          delay: this.calculateDelay(attemptCount),
          reason: 'Timeout error - will retry with increased timeout',
        };

      case 'playwright':
        // Playwright errors might be recoverable with retry
        if (attemptCount < 2) {
          return {
            action: 'retry',
            delay: this.calculateDelay(attemptCount),
            reason: 'Playwright error - will retry (element might not be ready)',
          };
        }
        return {
          action: 'abort',
          reason: 'Playwright error persists after retries - likely selector issue',
        };

      case 'ai_agent':
        return {
          action: 'retry',
          delay: this.calculateDelay(attemptCount) * 2, // Longer delay for AI
          reason: 'AI agent error - will retry with longer delay',
        };

      case 'validation':
        // Validation errors are not recoverable by retry
        return {
          action: 'abort',
          reason: 'Validation error - data is invalid, cannot retry',
        };

      case 'internal':
      default:
        if (attemptCount < 2) {
          return {
            action: 'retry',
            delay: this.calculateDelay(attemptCount),
            reason: 'Internal error - will retry once',
          };
        }
        return {
          action: 'abort',
          reason: 'Internal error persists - aborting',
        };
    }
  }

  /**
   * Calculate delay with exponential backoff
   */
  calculateDelay(attemptCount: number): number {
    const delay =
      this.retryConfig.baseDelay *
      Math.pow(this.retryConfig.backoffMultiplier, attemptCount);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Record error in history
   */
  private recordError(context: ErrorContext): void {
    const key = `${context.runId}:${context.step}`;
    const history = this.errorHistory.get(key) || [];
    history.push(context);
    this.errorHistory.set(key, history);
  }

  /**
   * Get error history for a run/step
   */
  getErrorHistory(runId: string, step?: string): ErrorContext[] {
    if (step) {
      return this.errorHistory.get(`${runId}:${step}`) || [];
    }

    // Return all errors for the run
    const errors: ErrorContext[] = [];
    for (const [key, history] of this.errorHistory) {
      if (key.startsWith(`${runId}:`)) {
        errors.push(...history);
      }
    }
    return errors;
  }

  /**
   * Clear error history for a run
   */
  clearHistory(runId: string): void {
    for (const key of this.errorHistory.keys()) {
      if (key.startsWith(`${runId}:`)) {
        this.errorHistory.delete(key);
      }
    }
  }

  /**
   * Determine rollback state based on current state
   */
  getRollbackState(currentState: TestRunState): TestRunState | null {
    const rollbackMap: Partial<Record<TestRunState, TestRunState>> = {
      parsing: 'created',
      generating: 'parsing',
      executing: 'awaiting_approval',
      codex_reviewing: 'executing',
    };

    return rollbackMap[currentState] || null;
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(error: Error): boolean {
    const category = this.classifyError(error);
    return category !== 'validation';
  }

  /**
   * Create error report for logging
   */
  createErrorReport(context: ErrorContext): Record<string, unknown> {
    const category = this.classifyError(context.error);
    const decision = this.determineRecovery(context);

    return {
      runId: context.runId,
      step: context.step,
      state: context.state,
      category,
      message: context.error.message,
      stack: context.error.stack,
      attemptCount: context.attemptCount,
      timestamp: context.timestamp.toISOString(),
      decision: {
        action: decision.action,
        reason: decision.reason,
        delay: decision.delay,
      },
    };
  }
}

/**
 * Retry wrapper function
 * Executes a function with automatic retry on failure
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, onRetry } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        onRetry?.(lastError, attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export default ErrorRecoveryManager;
