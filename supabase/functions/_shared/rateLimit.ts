/**
 * Rate limiting middleware for Supabase Edge Functions
 * Prevents abuse and protects against excessive API usage
 */

import { HttpError } from "./errors.ts";
import { createLogger } from "./logger.ts";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limits
// In production, consider using Redis or Supabase for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (userId: string, endpoint: string) => string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 50, // 50 requests
  windowMs: 60000, // per minute
};

/**
 * Generates a unique key for rate limiting
 */
function generateKey(userId: string, endpoint: string, config: RateLimitConfig): string {
  if (config.keyGenerator) {
    return config.keyGenerator(userId, endpoint);
  }
  return `${userId}:${endpoint}`;
}

/**
 * Cleans up expired entries from the rate limit store
 */
function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanup, 60000);

/**
 * Checks if a request should be rate limited
 * Throws HttpError if rate limit is exceeded
 */
export function checkRateLimit(
  userId: string,
  endpoint: string,
  config: Partial<RateLimitConfig> = {}
): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const key = generateKey(userId, endpoint, finalConfig);
  const now = Date.now();
  
  const logger = createLogger({ scope: 'rateLimit', userId });

  // Get or create entry
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    // Create new entry or reset expired one
    entry = {
      count: 0,
      resetAt: now + finalConfig.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  // Check limit
  if (entry.count >= finalConfig.maxRequests) {
    const retryAfterMs = entry.resetAt - now;
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    
    logger.warn('Rate limit exceeded', {
      userId,
      endpoint,
      count: entry.count,
      limit: finalConfig.maxRequests,
      retryAfterSec,
    });

    throw new HttpError(
      `Limite de taux dépassée. Réessayez dans ${retryAfterSec} secondes.`,
      429,
      {
        detail: `Maximum ${finalConfig.maxRequests} requêtes par ${finalConfig.windowMs / 1000} secondes.`,
        retryAfter: retryAfterSec,
      }
    );
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  logger.debug('Rate limit check passed', {
    userId,
    endpoint,
    count: entry.count,
    limit: finalConfig.maxRequests,
    remaining: finalConfig.maxRequests - entry.count,
  });
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // AI proxy - more restrictive for expensive AI calls
  AI_PROXY: {
    maxRequests: 20,
    windowMs: 60000, // 20 requests per minute
  },
  
  // AI actions - moderate
  AI_ACTIONS: {
    maxRequests: 30,
    windowMs: 60000, // 30 requests per minute
  },
  
  // Financial operations - generous
  FINANCIAL_SYNC: {
    maxRequests: 100,
    windowMs: 60000, // 100 requests per minute
  },
  
  // Authenticated requests - general limit
  AUTHENTICATED: {
    maxRequests: 200,
    windowMs: 60000, // 200 requests per minute
  },
};

/**
 * Gets rate limit info for a user (for display purposes)
 */
export function getRateLimitInfo(
  userId: string,
  endpoint: string,
  config: Partial<RateLimitConfig> = {}
): {
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const key = generateKey(userId, endpoint, finalConfig);
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    return {
      count: 0,
      limit: finalConfig.maxRequests,
      remaining: finalConfig.maxRequests,
      resetAt: now + finalConfig.windowMs,
      retryAfterMs: 0,
    };
  }

  return {
    count: entry.count,
    limit: finalConfig.maxRequests,
    remaining: Math.max(0, finalConfig.maxRequests - entry.count),
    resetAt: entry.resetAt,
    retryAfterMs: Math.max(0, entry.resetAt - now),
  };
}

/**
 * Resets rate limit for a specific user and endpoint (admin function)
 */
export function resetRateLimit(userId: string, endpoint: string, config: Partial<RateLimitConfig> = {}): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const key = generateKey(userId, endpoint, finalConfig);
  rateLimitStore.delete(key);
}

/**
 * Gets current store size (for monitoring)
 */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}


