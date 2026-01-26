/**
 * Rate Limiter Middleware
 *
 * Enforces daily usage limits for AI API endpoints.
 * Checks user's request count and token usage against configurable thresholds.
 * Returns 429 Too Many Requests when limits are exceeded.
 */

import { Request, Response, NextFunction } from 'express';
import { usageTracker } from '../services/usageTracker';

// ============================================================================
// Configuration
// ============================================================================

const REQUESTS_PER_DAY = parseInt(
  process.env.RATE_LIMIT_REQUESTS_PER_DAY || '100',
  10
);
const TOKENS_PER_DAY = parseInt(
  process.env.RATE_LIMIT_TOKENS_PER_DAY || '100000',
  10
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the start of the current day in UTC
 */
function getStartOfDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Get the start of the next day in UTC (for reset time)
 */
function getEndOfDay(): Date {
  const startOfDay = getStartOfDay();
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Extract user ID from request
 * Falls back to IP address or 'anonymous' if no user identification available
 */
function getUserId(req: Request): string {
  // Check for user ID in various common locations
  // Priority: custom header > auth user > IP > anonymous
  const headerUserId = req.headers['x-user-id'] as string | undefined;
  if (headerUserId) {
    return headerUserId;
  }

  // Check for authenticated user (if auth middleware populates this)
  const authUser = (req as Request & { user?: { id?: string } }).user;
  if (authUser?.id) {
    return authUser.id;
  }

  // Fall back to IP address
  const ip = req.ip || req.socket.remoteAddress;
  if (ip) {
    return `ip:${ip}`;
  }

  return 'anonymous';
}

// ============================================================================
// Rate Limit Check Function (exported for /api/usage route)
// ============================================================================

export interface RateLimitStatus {
  userId: string;
  limits: {
    requestsPerDay: number;
    tokensPerDay: number;
  };
  usage: {
    requests: number;
    tokens: number;
  };
  remaining: {
    requests: number;
    tokens: number;
  };
  resetAt: string;
  isLimited: boolean;
  limitReason: 'requests' | 'tokens' | null;
}

/**
 * Check rate limit status for a user
 */
export function checkRateLimit(userId: string): RateLimitStatus {
  const startOfDay = getStartOfDay();
  const resetAt = getEndOfDay();

  // Get user's usage for today
  const userUsage = usageTracker.getUsageForUser(userId, startOfDay);

  const requestsUsed = userUsage.totalRequests;
  const tokensUsed = userUsage.totalTokens;

  const requestsRemaining = Math.max(0, REQUESTS_PER_DAY - requestsUsed);
  const tokensRemaining = Math.max(0, TOKENS_PER_DAY - tokensUsed);

  const isRequestLimited = requestsUsed >= REQUESTS_PER_DAY;
  const isTokenLimited = tokensUsed >= TOKENS_PER_DAY;

  let limitReason: 'requests' | 'tokens' | null = null;
  if (isRequestLimited) {
    limitReason = 'requests';
  } else if (isTokenLimited) {
    limitReason = 'tokens';
  }

  return {
    userId,
    limits: {
      requestsPerDay: REQUESTS_PER_DAY,
      tokensPerDay: TOKENS_PER_DAY,
    },
    usage: {
      requests: requestsUsed,
      tokens: tokensUsed,
    },
    remaining: {
      requests: requestsRemaining,
      tokens: tokensRemaining,
    },
    resetAt: resetAt.toISOString(),
    isLimited: isRequestLimited || isTokenLimited,
    limitReason,
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Rate limiter middleware for AI endpoints
 *
 * Checks user's daily usage against configured limits.
 * Sets rate limit headers on all responses.
 * Returns 429 if limits are exceeded.
 */
export const rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const userId = getUserId(req);
  const status = checkRateLimit(userId);

  // Set rate limit headers (using the lower of the two remaining limits)
  const remainingLimit = Math.min(status.remaining.requests, status.remaining.tokens);
  res.setHeader('X-RateLimit-Remaining', remainingLimit.toString());
  res.setHeader('X-RateLimit-Reset', status.resetAt);

  // Store userId on request for downstream use (e.g., usage tracking)
  (req as Request & { rateLimitUserId?: string }).rateLimitUserId = userId;

  // Check if rate limited
  if (status.isLimited) {
    const message =
      status.limitReason === 'requests'
        ? `Daily request limit of ${REQUESTS_PER_DAY} exceeded`
        : `Daily token limit of ${TOKENS_PER_DAY} exceeded`;

    res.status(429).json({
      error: 'Too Many Requests',
      message,
      limitReason: status.limitReason,
      usage: status.usage,
      limits: status.limits,
      resetAt: status.resetAt,
    });
    return;
  }

  next();
};

/**
 * Get user ID helper (exported for use in routes)
 */
export { getUserId };

export default rateLimiter;
