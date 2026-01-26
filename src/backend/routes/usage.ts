/**
 * Usage routes - provides user-facing usage information and rate limit status.
 */

import { Router, Request, Response } from 'express';
import { checkRateLimit, getUserId } from '../middleware/rateLimiter';

const router = Router();

/**
 * GET /api/usage
 * Returns current user's API usage and rate limit status
 *
 * Response includes:
 * - Current usage (requests, tokens) for today
 * - Configured limits
 * - Remaining quota
 * - Reset time (start of next UTC day)
 */
router.get('/', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const status = checkRateLimit(userId);

  res.json({
    success: true,
    ...status,
  });
});

export default router;
