/**
 * Main router index - aggregates all route modules and exports the combined router.
 * This serves as the central routing configuration for the Express backend.
 */

import { Router } from 'express';

const router = Router();

// Route modules will be imported and mounted here
// e.g., router.use('/vaults', vaultsRouter);

export default router;
