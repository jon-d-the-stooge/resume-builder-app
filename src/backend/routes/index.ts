/**
 * Main router index - aggregates all route modules and exports the combined router.
 * This serves as the central routing configuration for the Express backend.
 */

import { Router } from 'express';
import vaultsRouter from './vaults';
import jobsRouter from './jobs';
import applicationsRouter from './applications';
import knowledgeBaseRouter from './knowledgeBase';
import settingsRouter from './settings';
import contentRouter from './content';

const router = Router();

// Mount all route modules
router.use('/vaults', vaultsRouter);
router.use('/jobs', jobsRouter);
router.use('/applications', applicationsRouter);
router.use('/knowledge-base', knowledgeBaseRouter);
router.use('/settings', settingsRouter);
router.use('/content', contentRouter);

// Re-export individual routers for direct import
export {
  vaultsRouter,
  jobsRouter,
  applicationsRouter,
  knowledgeBaseRouter,
  settingsRouter,
  contentRouter
};

export default router;
