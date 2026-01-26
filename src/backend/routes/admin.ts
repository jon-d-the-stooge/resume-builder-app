/**
 * Admin routes - handles administrative endpoints.
 *
 * These routes are protected and should only be accessible by administrators.
 * Protection is implemented via the ADMIN_SECRET environment variable.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { usageTracker } from '../services/usageTracker';

const router = Router();

/**
 * Admin authentication middleware
 *
 * Validates the X-Admin-Secret header against ADMIN_SECRET environment variable.
 * For production use, integrate with your auth system (JWT, OAuth, etc.).
 */
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const adminSecret = process.env.ADMIN_SECRET;

  // If no ADMIN_SECRET is configured, deny all admin requests
  if (!adminSecret) {
    console.warn('[Admin Routes] ADMIN_SECRET not configured - admin routes disabled');
    res.status(503).json({
      error: 'Service unavailable',
      message: 'Admin authentication not configured'
    });
    return;
  }

  const providedSecret = req.headers['x-admin-secret'];

  if (providedSecret !== adminSecret) {
    console.warn('[Admin Routes] Invalid admin secret provided');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin credentials'
    });
    return;
  }

  next();
};

/**
 * GET /api/admin/usage
 * Returns API usage summary for monitoring
 *
 * Query parameters:
 * - since: ISO date string or relative period ('24h', '7d', '30d'). Defaults to '30d'
 *
 * Headers required:
 * - X-Admin-Secret: Must match ADMIN_SECRET environment variable
 */
router.get('/usage', requireAdmin, (req: Request, res: Response) => {
  try {
    const sinceParam = req.query.since as string | undefined;
    let since: Date;

    if (!sinceParam) {
      // Default: last 30 days
      since = new Date();
      since.setDate(since.getDate() - 30);
    } else if (sinceParam.match(/^\d+[hdwm]$/)) {
      // Relative time format: 24h, 7d, 4w, 1m
      since = new Date();
      const value = parseInt(sinceParam.slice(0, -1), 10);
      const unit = sinceParam.slice(-1);

      switch (unit) {
        case 'h':
          since.setHours(since.getHours() - value);
          break;
        case 'd':
          since.setDate(since.getDate() - value);
          break;
        case 'w':
          since.setDate(since.getDate() - value * 7);
          break;
        case 'm':
          since.setMonth(since.getMonth() - value);
          break;
      }
    } else {
      // Try to parse as ISO date
      since = new Date(sinceParam);
      if (isNaN(since.getTime())) {
        res.status(400).json({
          error: 'Invalid parameter',
          message: 'since must be an ISO date string or relative period (24h, 7d, 30d, etc.)'
        });
        return;
      }
    }

    const usage = usageTracker.getTotalUsage(since);

    res.json({
      success: true,
      period: {
        since: since.toISOString(),
        until: new Date().toISOString()
      },
      summary: {
        totalRequests: usage.totalRequests,
        totalTokens: usage.totalTokens,
        uniqueUsers: usage.uniqueUsers
      },
      byService: usage.byService,
      recentActivity: usage.recentActivity
    });
  } catch (error) {
    console.error('[Admin Routes] Usage query error:', error);
    res.status(500).json({
      error: 'Query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/usage/daily
 * Returns daily usage breakdown for charting
 *
 * Query parameters:
 * - since: ISO date string or relative period. Defaults to '30d'
 *
 * Headers required:
 * - X-Admin-Secret: Must match ADMIN_SECRET environment variable
 */
router.get('/usage/daily', requireAdmin, (req: Request, res: Response) => {
  try {
    const sinceParam = req.query.since as string | undefined;
    let since: Date;

    if (!sinceParam) {
      since = new Date();
      since.setDate(since.getDate() - 30);
    } else if (sinceParam.match(/^\d+[hdwm]$/)) {
      since = new Date();
      const value = parseInt(sinceParam.slice(0, -1), 10);
      const unit = sinceParam.slice(-1);

      switch (unit) {
        case 'h':
          since.setHours(since.getHours() - value);
          break;
        case 'd':
          since.setDate(since.getDate() - value);
          break;
        case 'w':
          since.setDate(since.getDate() - value * 7);
          break;
        case 'm':
          since.setMonth(since.getMonth() - value);
          break;
      }
    } else {
      since = new Date(sinceParam);
      if (isNaN(since.getTime())) {
        res.status(400).json({
          error: 'Invalid parameter',
          message: 'since must be an ISO date string or relative period (24h, 7d, 30d, etc.)'
        });
        return;
      }
    }

    const dailyUsage = usageTracker.getDailyUsage(since);

    res.json({
      success: true,
      period: {
        since: since.toISOString(),
        until: new Date().toISOString()
      },
      daily: dailyUsage
    });
  } catch (error) {
    console.error('[Admin Routes] Daily usage query error:', error);
    res.status(500).json({
      error: 'Query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/usage/user/:userId
 * Returns usage for a specific user
 *
 * Query parameters:
 * - since: ISO date string or relative period. Defaults to '30d'
 *
 * Headers required:
 * - X-Admin-Secret: Must match ADMIN_SECRET environment variable
 */
router.get('/usage/user/:userId', requireAdmin, (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const sinceParam = req.query.since as string | undefined;
    let since: Date;

    if (!sinceParam) {
      since = new Date();
      since.setDate(since.getDate() - 30);
    } else if (sinceParam.match(/^\d+[hdwm]$/)) {
      since = new Date();
      const value = parseInt(sinceParam.slice(0, -1), 10);
      const unit = sinceParam.slice(-1);

      switch (unit) {
        case 'h':
          since.setHours(since.getHours() - value);
          break;
        case 'd':
          since.setDate(since.getDate() - value);
          break;
        case 'w':
          since.setDate(since.getDate() - value * 7);
          break;
        case 'm':
          since.setMonth(since.getMonth() - value);
          break;
      }
    } else {
      since = new Date(sinceParam);
      if (isNaN(since.getTime())) {
        res.status(400).json({
          error: 'Invalid parameter',
          message: 'since must be an ISO date string or relative period (24h, 7d, 30d, etc.)'
        });
        return;
      }
    }

    const userUsage = usageTracker.getUsageForUser(userId, since);

    res.json({
      success: true,
      period: {
        since: since.toISOString(),
        until: new Date().toISOString()
      },
      usage: userUsage
    });
  } catch (error) {
    console.error('[Admin Routes] User usage query error:', error);
    res.status(500).json({
      error: 'Query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
