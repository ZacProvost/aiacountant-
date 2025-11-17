/**
 * Structured logging and monitoring infrastructure
 * Can be extended with Sentry or other error tracking services
 */

import { formatErrorForLog, type AppError } from './errors';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  component?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: ReturnType<typeof formatErrorForLog>;
}

class Logger {
  private sessionId: string;
  private userId: string | null = null;
  private context: LogContext = {};

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    additionalContext?: LogContext,
    error?: unknown
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...this.context,
        ...additionalContext,
        sessionId: this.sessionId,
        userId: this.userId || undefined,
      },
    };

    if (error) {
      entry.error = formatErrorForLog(error);
    }

    return entry;
  }

  private log(entry: LogEntry): void {
    // Console logging with colors
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m', // Green
      [LogLevel.WARN]: '\x1b[33m', // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';

    const color = colors[entry.level];
    const prefix = `${color}[${entry.level.toUpperCase()}]${reset}`;
    const timestamp = `[${entry.timestamp}]`;

    console.log(`${prefix} ${timestamp} ${entry.message}`);

    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log('  Context:', entry.context);
    }

    if (entry.error) {
      console.log('  Error:', entry.error);
    }

    // TODO: Send to external service (Sentry, LogRocket, etc.)
    this.sendToExternalService(entry);
  }

  private sendToExternalService(entry: LogEntry): void {
    // TODO: Implement Sentry integration
    // Example:
    // if (entry.level === LogLevel.ERROR && entry.error) {
    //   Sentry.captureException(entry.error.originalError || new Error(entry.message), {
    //     level: 'error',
    //     contexts: { custom: entry.context },
    //   });
    // }

    // For now, store in localStorage for debugging (limited to last 100 entries)
    if (typeof window !== 'undefined' && entry.level !== LogLevel.DEBUG) {
      try {
        const logs = this.getStoredLogs();
        logs.push(entry);
        
        // Keep only last 100 logs
        const trimmed = logs.slice(-100);
        localStorage.setItem('app_logs', JSON.stringify(trimmed));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }

  private getStoredLogs(): LogEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('app_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  debug(message: string, context?: LogContext): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.log(entry);
  }

  info(message: string, context?: LogContext): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.log(entry);
  }

  warn(message: string, context?: LogContext, error?: unknown): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, context, error);
    this.log(entry);
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, context, error);
    this.log(entry);
  }

  /**
   * Get all stored logs (for debugging or export)
   */
  getLogs(): LogEntry[] {
    return this.getStoredLogs();
  }

  /**
   * Clear all stored logs
   */
  clearLogs(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('app_logs');
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(this.getStoredLogs(), null, 2);
  }
}

// Singleton instance
export const logger = new Logger();

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  start(label: string): void {
    this.marks.set(label, performance.now());
  }

  /**
   * End timing an operation and log the duration
   */
  end(label: string, context?: LogContext): number {
    const startTime = this.marks.get(label);
    if (!startTime) {
      logger.warn(`Performance mark '${label}' not found`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.marks.delete(label);

    logger.info(`Performance: ${label}`, {
      ...context,
      durationMs: Math.round(duration),
    });

    return duration;
  }

  /**
   * Measure and log an async operation
   */
  async measure<T>(
    label: string,
    operation: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    this.start(label);
    try {
      const result = await operation();
      this.end(label, { ...context, status: 'success' });
      return result;
    } catch (error) {
      this.end(label, { ...context, status: 'error' });
      throw error;
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Web Vitals monitoring (Core Web Vitals for performance)
 */
export function initWebVitals(): void {
  if (typeof window === 'undefined') return;

  // Largest Contentful Paint (LCP)
  const lcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      logger.info('Web Vital: LCP', {
        metric: 'LCP',
        value: Math.round(entry.startTime),
        rating: entry.startTime < 2500 ? 'good' : entry.startTime < 4000 ? 'needs-improvement' : 'poor',
      });
    }
  });
  
  try {
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch {
    // Not supported
  }

  // First Input Delay (FID)
  const fidObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const duration = (entry as any).processingStart - entry.startTime;
      logger.info('Web Vital: FID', {
        metric: 'FID',
        value: Math.round(duration),
        rating: duration < 100 ? 'good' : duration < 300 ? 'needs-improvement' : 'poor',
      });
    }
  });

  try {
    fidObserver.observe({ entryTypes: ['first-input'] });
  } catch {
    // Not supported
  }

  // Cumulative Layout Shift (CLS)
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!(entry as any).hadRecentInput) {
        clsValue += (entry as any).value;
      }
    }
  });

  try {
    clsObserver.observe({ entryTypes: ['layout-shift'] });
    
    // Log CLS on page unload
    window.addEventListener('beforeunload', () => {
      logger.info('Web Vital: CLS', {
        metric: 'CLS',
        value: Math.round(clsValue * 1000) / 1000,
        rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
      });
    });
  } catch {
    // Not supported
  }
}

/**
 * Track user actions for analytics
 */
export function trackAction(action: string, properties?: Record<string, unknown>): void {
  logger.info(`Action: ${action}`, {
    action,
    ...properties,
  });

  // TODO: Send to analytics service (Google Analytics, Mixpanel, etc.)
  // Example:
  // if (typeof gtag !== 'undefined') {
  //   gtag('event', action, properties);
  // }
}

/**
 * Initialize logging and monitoring
 */
export function initLogging(userId?: string): void {
  if (userId) {
    logger.setUserId(userId);
  }

  initWebVitals();

  logger.info('Logging initialized', {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
  });
}





