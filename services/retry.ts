/**
 * Retry utilities with exponential backoff
 * Automatically retries failed operations with increasing delays
 */

import { isRetryableError } from './errors';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  shouldRetry: isRetryableError,
  onRetry: () => {},
};

/**
 * Delays execution for the specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the delay for the next retry attempt using exponential backoff with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  // Add jitter (random variance of ±25%) to avoid thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Retries an async operation with exponential backoff
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 3, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === opts.maxRetries) {
        throw error;
      }

      // Check if we should retry this error
      if (!opts.shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate delay for next attempt
      const delayMs = calculateBackoffDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      // Notify about retry
      opts.onRetry(error, attempt + 1, delayMs);

      // Wait before next attempt
      await delay(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Creates a retry wrapper for a function
 * 
 * @example
 * ```typescript
 * const fetchWithRetry = createRetryWrapper(fetchData, { maxRetries: 3 });
 * const result = await fetchWithRetry(params);
 * ```
 */
export function createRetryWrapper<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => {
    return withRetry(() => fn(...args), options);
  };
}

/**
 * Timeout wrapper - fails if operation takes too long
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    operation(),
    delay(timeoutMs).then(() => {
      throw timeoutError || new Error(`Opération dépassée (timeout: ${timeoutMs}ms)`);
    }),
  ]);
}

/**
 * Combined retry + timeout wrapper
 * 
 * @example
 * ```typescript
 * const result = await withRetryAndTimeout(
 *   () => fetchData(),
 *   { maxRetries: 3, timeoutMs: 5000 }
 * );
 * ```
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  options: RetryOptions & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs, ...retryOptions } = options;

  if (timeoutMs) {
    return withRetry(
      () => withTimeout(operation, timeoutMs),
      retryOptions
    );
  }

  return withRetry(operation, retryOptions);
}

/**
 * Circuit breaker to prevent overwhelming a failing service
 * Opens after too many failures, preventing further attempts for a cooldown period
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private isOpen = false;

  constructor(
    private readonly threshold: number = 5,
    private readonly cooldownMs: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.isOpen) {
      const timeSinceFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceFailure < this.cooldownMs) {
        throw new Error(
          `Circuit ouvert. Service temporairement indisponible. Réessayez dans ${Math.ceil((this.cooldownMs - timeSinceFailure) / 1000)} secondes.`
        );
      }
      // Cooldown period passed, close circuit and try again
      this.reset();
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.isOpen = false;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.isOpen = true;
      console.warn(
        `Circuit breaker opened after ${this.failures} failures. Cooldown: ${this.cooldownMs}ms`
      );
    }
  }

  private reset(): void {
    this.failures = 0;
    this.isOpen = false;
    this.lastFailureTime = null;
  }

  getStatus(): { isOpen: boolean; failures: number } {
    return {
      isOpen: this.isOpen,
      failures: this.failures,
    };
  }
}


