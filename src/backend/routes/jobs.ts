/**
 * Jobs routes - handles job queue operations for ATS optimization.
 * Endpoints for creating, listing, retrieving, and cancelling jobs,
 * as well as triggering optimization processing.
 */

import { Router, Request, Response } from 'express';
import { jobQueue, queueProcessor, settingsStore } from '../services';
import type { JobStatus, QueueJobInput } from '../../main/jobQueue';

const router = Router();

/**
 * POST /api/jobs
 * Create/queue a new job for ATS optimization
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    await jobQueue.initialize();

    const jobData = req.body;

    // Build full description from structured fields if available
    let rawDescription = jobData.description || '';

    if (jobData.requirements?.length || jobData.responsibilities?.length || jobData.preferredQualifications?.length) {
      const parts = [jobData.description || ''];

      if (jobData.requirements?.length) {
        parts.push('', '## Requirements');
        parts.push(...jobData.requirements.map((r: string) => `- ${r}`));
      }

      if (jobData.preferredQualifications?.length) {
        parts.push('', '## Preferred Qualifications');
        parts.push(...jobData.preferredQualifications.map((q: string) => `- ${q}`));
      }

      if (jobData.responsibilities?.length) {
        parts.push('', '## Responsibilities');
        parts.push(...jobData.responsibilities.map((r: string) => `- ${r}`));
      }

      rawDescription = parts.filter(line => line !== '').join('\n');
    }

    const input: QueueJobInput = {
      sourceUrl: jobData.sourceUrl,
      company: jobData.company,
      title: jobData.title,
      rawDescription,
      priority: jobData.priority || 0
    };

    const job = await jobQueue.enqueue(input);

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        status: job.status,
        priority: job.priority,
        addedAt: job.addedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      error: 'Failed to create job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs
 * List all jobs in the queue, optionally filtered by status
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    await jobQueue.initialize();

    const statusFilter = req.query.status as JobStatus | undefined;

    let jobs;
    if (statusFilter) {
      jobs = jobQueue.getJobsByStatus(statusFilter);
    } else {
      jobs = jobQueue.getQueue();
    }

    // Map jobs to a consistent response format
    const formattedJobs = jobs.map(job => ({
      id: job.id,
      company: job.company,
      title: job.title,
      sourceUrl: job.sourceUrl,
      status: job.status,
      priority: job.priority,
      addedAt: job.addedAt.toISOString(),
      processedAt: job.processedAt?.toISOString(),
      retryCount: job.retryCount,
      error: job.error,
      hasResult: !!job.result
    }));

    res.json({
      jobs: formattedJobs,
      total: formattedJobs.length,
      status: jobQueue.getStatus()
    });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({
      error: 'Failed to list jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs/:id
 * Get a specific job's status and result
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    await jobQueue.initialize();

    const { id } = req.params;
    const job = jobQueue.getJob(id);

    if (!job) {
      res.status(404).json({
        error: 'Job not found',
        message: `No job exists with ID: ${id}`
      });
      return;
    }

    res.json({
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        sourceUrl: job.sourceUrl,
        status: job.status,
        priority: job.priority,
        addedAt: job.addedAt.toISOString(),
        processedAt: job.processedAt?.toISOString(),
        retryCount: job.retryCount,
        error: job.error
      },
      result: job.result ? {
        finalScore: job.result.finalScore,
        previousScore: job.result.previousScore,
        matchedSkills: job.result.matchedSkills,
        missingSkills: job.result.missingSkills,
        gaps: job.result.gaps,
        recommendations: job.result.recommendations,
        optimizedContent: job.result.optimizedContent,
        processedAt: job.result.processedAt.toISOString()
      } : null
    });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({
      error: 'Failed to get job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/jobs/:id
 * Cancel/remove a job from the queue
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await jobQueue.initialize();

    const { id } = req.params;
    const removed = await jobQueue.removeJob(id);

    if (!removed) {
      res.status(404).json({
        error: 'Job not found',
        message: `No job exists with ID: ${id}`
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/jobs/optimize
 * Queue an optimization job and return immediately with job ID.
 * The frontend can then poll GET /api/jobs/:id for status updates.
 *
 * Accepts either:
 * - A job ID to process an existing queued job: { jobId: string }
 * - Full job data to create and immediately start processing: { company, title, description, ... }
 */
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    // Check API key first
    if (!settingsStore.hasValidKey()) {
      res.status(401).json({
        error: 'API key not configured',
        message: 'Please set your API key in Settings before running optimization.'
      });
      return;
    }

    await jobQueue.initialize();

    const { jobId, ...jobData } = req.body;
    let job;

    if (jobId) {
      // Process existing queued job
      job = jobQueue.getJob(jobId);
      if (!job) {
        res.status(404).json({
          error: 'Job not found',
          message: `No job exists with ID: ${jobId}`
        });
        return;
      }

      if (job.status !== 'pending') {
        res.status(400).json({
          error: 'Invalid job status',
          message: `Job is already ${job.status}. Only pending jobs can be optimized.`
        });
        return;
      }
    } else {
      // Create new job from provided data
      if (!jobData.company || !jobData.title || !jobData.description) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'Either jobId or (company, title, description) must be provided.'
        });
        return;
      }

      // Build rawDescription from structured fields
      let rawDescription = jobData.description || '';

      if (jobData.requirements?.length || jobData.responsibilities?.length || jobData.preferredQualifications?.length) {
        const parts = [jobData.description || ''];

        if (jobData.requirements?.length) {
          parts.push('', '## Requirements');
          parts.push(...jobData.requirements.map((r: string) => `- ${r}`));
        }

        if (jobData.preferredQualifications?.length) {
          parts.push('', '## Preferred Qualifications');
          parts.push(...jobData.preferredQualifications.map((q: string) => `- ${q}`));
        }

        if (jobData.responsibilities?.length) {
          parts.push('', '## Responsibilities');
          parts.push(...jobData.responsibilities.map((r: string) => `- ${r}`));
        }

        rawDescription = parts.filter(line => line !== '').join('\n');
      }

      const input: QueueJobInput = {
        sourceUrl: jobData.sourceUrl,
        company: jobData.company,
        title: jobData.title,
        rawDescription,
        priority: jobData.priority || 10 // Higher priority for immediate optimization
      };

      job = await jobQueue.enqueue(input);
    }

    // Return job ID immediately - processing happens asynchronously
    // The frontend should poll GET /api/jobs/:id to check status
    res.status(202).json({
      success: true,
      jobId: job.id,
      message: 'Optimization job queued. Poll GET /api/jobs/:id for status updates.',
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        status: job.status
      }
    });

    // Start processing asynchronously (fire and forget)
    // This dequeues the job, processes it, and updates its status
    processJobAsync(job.id).catch(err => {
      console.error(`Async job processing error for ${job.id}:`, err);
    });

  } catch (error) {
    console.error('Error queuing optimization job:', error);
    res.status(500).json({
      error: 'Failed to queue optimization job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Process a job asynchronously. Updates job status as it progresses.
 * This allows the POST /optimize endpoint to return immediately.
 */
async function processJobAsync(jobId: string): Promise<void> {
  await jobQueue.initialize();

  const job = jobQueue.getJob(jobId);
  if (!job || job.status !== 'pending') {
    return;
  }

  // Mark as processing via dequeue
  const dequeuedJob = await jobQueue.dequeue();
  if (!dequeuedJob || dequeuedJob.id !== jobId) {
    console.error(`Failed to dequeue job ${jobId} - got ${dequeuedJob?.id || 'null'}`);
    return;
  }

  try {
    console.log(`Processing optimization job: ${dequeuedJob.title} at ${dequeuedJob.company}`);
    const result = await queueProcessor.processJob(dequeuedJob);
    await jobQueue.completeJob(jobId, result);
    console.log(`Completed job ${jobId} with score: ${result.finalScore.toFixed(2)}`);
  } catch (error) {
    console.error(`Failed to process job ${jobId}:`, error);
    await jobQueue.failJob(jobId, (error as Error).message);
  }
}

export default router;
