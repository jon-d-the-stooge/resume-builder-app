/**
 * Vaults routes - handles CRUD operations for vault management.
 * Endpoints for listing, creating, updating, and deleting vaults,
 * as well as vault-specific operations like file management.
 */

import { Router, Request, Response } from 'express';
import { vaultManager } from '../services';

const router = Router();

/**
 * GET /api/vaults
 * List all vaults
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const vaults = await vaultManager.getAllVaults();
    res.json(vaults);
  } catch (error) {
    console.error('Error listing vaults:', error);
    res.status(500).json({
      error: 'Failed to list vaults',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
