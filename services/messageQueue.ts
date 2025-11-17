/**
 * Message queue to prevent race conditions in concurrent message operations
 * Ensures messages are processed sequentially even if multiple operations are triggered
 */

export type QueuedOperation<T> = () => Promise<T>;

export class MessageQueue {
  private queue: Array<{
    operation: QueuedOperation<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private isProcessing = false;
  private currentOperationId: string | null = null;

  /**
   * Adds an operation to the queue and returns a promise that resolves when it completes
   */
  async enqueue<T>(operation: QueuedOperation<T>, operationId?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      
      if (operationId) {
        console.log(`[MessageQueue] Enqueued operation: ${operationId}, queue length: ${this.queue.length}`);
      }
      
      // Start processing if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        const result = await item.operation();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.isProcessing = false;
    this.currentOperationId = null;
  }

  /**
   * Returns the current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Returns true if the queue is currently processing
   */
  isActive(): boolean {
    return this.isProcessing;
  }

  /**
   * Clears all pending operations (use with caution)
   */
  clear(): void {
    // Reject all pending operations
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.reject(new Error('Queue cleared'));
      }
    }
  }
}

/**
 * Creates a debounced function that only executes after the specified delay
 * Useful for input handlers to reduce unnecessary API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, waitMs);
  };
}

/**
 * Creates a throttled function that executes at most once per specified interval
 * Useful for scroll handlers or frequent events
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    if (timeSinceLastRun >= limitMs) {
      func(...args);
      lastRun = now;
    } else {
      // Schedule for later if not already scheduled
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          func(...args);
          lastRun = Date.now();
          timeoutId = null;
        }, limitMs - timeSinceLastRun);
      }
    }
  };
}

/**
 * Lock mechanism to prevent concurrent execution of critical sections
 */
export class AsyncLock {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Acquires the lock, waiting if necessary
   */
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait for lock to be released
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases the lock
   */
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Executes an operation with the lock held
   */
  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  /**
   * Returns true if the lock is currently held
   */
  isLocked(): boolean {
    return this.locked;
  }
}

/**
 * Rate limiter to prevent too many operations in a time window
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxOperations: number,
    private readonly windowMs: number
  ) {}

  /**
   * Checks if an operation is allowed under the rate limit
   */
  isAllowed(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove old timestamps
    this.timestamps = this.timestamps.filter((ts) => ts > windowStart);

    // Check if under limit
    return this.timestamps.length < this.maxOperations;
  }

  /**
   * Records an operation (call this after isAllowed() returns true)
   */
  record(): void {
    this.timestamps.push(Date.now());
  }

  /**
   * Attempts to perform an operation, throwing if rate limit exceeded
   */
  attempt(): void {
    if (!this.isAllowed()) {
      throw new Error(
        `Limite de taux dépassée. Maximum ${this.maxOperations} opérations par ${this.windowMs / 1000} secondes.`
      );
    }
    this.record();
  }

  /**
   * Gets the time until the next operation is allowed (in ms)
   */
  getTimeUntilNextAllowed(): number {
    if (this.timestamps.length < this.maxOperations) {
      return 0;
    }

    const oldestTimestamp = this.timestamps[0];
    const windowEnd = oldestTimestamp + this.windowMs;
    return Math.max(0, windowEnd - Date.now());
  }

  /**
   * Resets the rate limiter
   */
  reset(): void {
    this.timestamps = [];
  }
}





