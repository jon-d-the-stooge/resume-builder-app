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

/**
 * POST /api/vaults
 * Create a new vault
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const vaultData = req.body;
    const vault = await vaultManager.createVault(vaultData);
    res.status(201).json(vault);
  } catch (error) {
    console.error('Error creating vault:', error);
    res.status(500).json({
      error: 'Failed to create vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/vaults/:id
 * Get a single vault by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const vault = await vaultManager.getVault(id);

    if (!vault) {
      res.status(404).json({
        error: 'Vault not found',
        message: `No vault exists with ID: ${id}`
      });
      return;
    }

    res.json(vault);
  } catch (error) {
    console.error('Error getting vault:', error);
    res.status(500).json({
      error: 'Failed to get vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/vaults/:id
 * Update a vault's profile
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profileUpdates = req.body;
    const vault = await vaultManager.updateVaultProfile(id, profileUpdates);
    res.json(vault);
  } catch (error) {
    console.error('Error updating vault:', error);

    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Vault not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to update vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/vaults/:id
 * Delete a vault
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await vaultManager.deleteVault(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting vault:', error);

    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Vault not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
