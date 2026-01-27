/**
 * Applications routes - handles CRUD operations for job application tracking.
 * Maps IPC handlers (applications-list, applications-get, applications-save,
 * applications-update, applications-delete) to REST endpoints.
 */

import { Router, Request, Response } from 'express';
import { applicationsStore } from '../services';
import type { ApplicationStatus } from '../../main/applicationsStore';

const router = Router();

/**
 * GET /api/applications
 * List all applications for the authenticated user with optional status filter
 * Maps to IPC: applications-list
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as ApplicationStatus | undefined;

    // Validate status filter if provided
    const validStatuses: ApplicationStatus[] = ['saved', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      res.status(400).json({
        error: 'Invalid status filter',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
      return;
    }

    const applications = applicationsStore.list(req.user?.id, statusFilter);
    const stats = applicationsStore.getStats(req.user?.id);

    res.json({
      success: true,
      applications,
      stats
    });
  } catch (error) {
    console.error('Error listing applications:', error);
    res.status(500).json({
      error: 'Failed to list applications',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/applications/stats
 * Get application statistics for the authenticated user
 * Derived from IPC: applications-list (stats component)
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = applicationsStore.getStats(req.user?.id);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting application stats:', error);
    res.status(500).json({
      error: 'Failed to get application stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/applications/:id
 * Get a single application by ID (only if owned by authenticated user)
 * Maps to IPC: applications-get
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const application = applicationsStore.get(req.user?.id, id);

    if (!application) {
      res.status(404).json({
        error: 'Application not found',
        message: `No application exists with ID: ${id}`
      });
      return;
    }

    res.json({
      success: true,
      application
    });
  } catch (error) {
    console.error('Error getting application:', error);
    res.status(500).json({
      error: 'Failed to get application',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/applications
 * Save a new application for the authenticated user
 * Maps to IPC: applications-save
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { jobTitle, company, jobDescription, generatedResume, score, sourceUrl, metadata } = req.body;

    // Validate required fields
    if (!jobTitle || !company || !jobDescription || !generatedResume || score === undefined) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'jobTitle, company, jobDescription, generatedResume, and score are required'
      });
      return;
    }

    if (!metadata || metadata.iterations === undefined || metadata.initialScore === undefined) {
      res.status(400).json({
        error: 'Missing metadata',
        message: 'metadata.iterations and metadata.initialScore are required'
      });
      return;
    }

    const application = applicationsStore.save(req.user?.id, {
      jobTitle,
      company,
      jobDescription,
      generatedResume,
      score,
      sourceUrl,
      metadata: {
        iterations: metadata.iterations,
        initialScore: metadata.initialScore
      }
    });

    if (!application) {
      res.status(500).json({
        error: 'Failed to save application',
        message: 'Vault path may not be configured'
      });
      return;
    }

    res.status(201).json({
      success: true,
      application
    });
  } catch (error) {
    console.error('Error saving application:', error);
    res.status(500).json({
      error: 'Failed to save application',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/applications/:id
 * Update an existing application (only if owned by authenticated user)
 * Maps to IPC: applications-update
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Validate status if provided
    const validStatuses: ApplicationStatus[] = ['saved', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({
        error: 'Invalid status',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
      return;
    }

    // Ensure at least one update field is provided
    if (status === undefined && notes === undefined) {
      res.status(400).json({
        error: 'No updates provided',
        message: 'At least one of status or notes must be provided'
      });
      return;
    }

    const application = applicationsStore.update(req.user?.id, id, { status, notes });

    if (!application) {
      res.status(404).json({
        error: 'Application not found',
        message: `No application exists with ID: ${id}`
      });
      return;
    }

    res.json({
      success: true,
      application
    });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({
      error: 'Failed to update application',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/applications/:id
 * Delete an application (only if owned by authenticated user)
 * Maps to IPC: applications-delete
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = applicationsStore.delete(req.user?.id, id);

    if (!deleted) {
      res.status(404).json({
        error: 'Application not found',
        message: `No application exists with ID: ${id}`
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({
      error: 'Failed to delete application',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
