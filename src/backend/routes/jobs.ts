/**
 * Jobs routes - handles job queue operations for ATS optimization.
 * Endpoints for creating, listing, retrieving, and cancelling jobs,
 * as well as triggering optimization processing.
 */

import { Router, Request, Response } from 'express';
import { jobQueue, queueProcessor, settingsStore, rapidAPIProxy } from '../services';
import { loggers } from '../logger';
import type { JobStatus, QueueJobInput } from '../../main/jobQueue';

const jobLogger = loggers.jobs;

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

    jobLogger.info(
      { jobId: job.id, company: job.company, title: job.title, priority: job.priority },
      'Job enqueued'
    );

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
    jobLogger.error({ err: error }, 'Failed to create job');
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
      description: job.rawDescription,
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
    jobLogger.error({ err: error }, 'Failed to list jobs');
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
        description: job.rawDescription,
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
    jobLogger.error({ err: error }, 'Failed to get job');
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
    jobLogger.error({ err: error }, 'Failed to cancel job');
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
    console.log('OPTIMIZE ROUTE: received');
    // Check API key first
    if (!settingsStore.hasValidKey()) {
      res.status(401).json({
        error: 'API key not configured',
        message: 'Please set your API key in Settings before running optimization.'
      });
      return;
    }

    await jobQueue.initialize();

    const { jobId, resumeContent, ...jobData } = req.body;
    console.log('OPTIMIZE ROUTE: resumeContent length:', resumeContent?.length || 0);
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

    console.log('OPTIMIZE ROUTE: starting job');
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
    const userId = req.user?.id || 'dev-user';
    processJobAsync(job.id, userId, resumeContent).catch(err => {
      jobLogger.error({ err, jobId: job.id }, 'Async job processing error');
    });

  } catch (error) {
    jobLogger.error({ err: error }, 'Failed to queue optimization job');
    res.status(500).json({
      error: 'Failed to queue optimization job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/jobs/process-next
 * Process the next pending job in the queue (synchronous)
 * Mirrors IPC: job-queue-process-next
 */
router.post('/process-next', async (req: Request, res: Response) => {
  try {
    if (!settingsStore.hasValidKey()) {
      res.status(401).json({
        success: false,
        error: 'API key not configured. Please set your API key in Settings.'
      });
      return;
    }

    await jobQueue.initialize();
    const job = await jobQueue.dequeue();

    if (!job) {
      res.json({ success: false, message: 'No pending jobs in queue' });
      return;
    }

    const userId = req.user?.id || 'dev-user';
    try {
      const result = await queueProcessor.processJob(job, userId);
      await jobQueue.completeJob(job.id, result);

      res.json({
        success: true,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          status: 'completed'
        },
        result: {
          finalScore: result.finalScore,
          matchedSkills: result.matchedSkills.length,
          gaps: result.gaps.length,
          recommendations: result.recommendations.length
        }
      });
    } catch (error) {
      await jobQueue.failJob(job.id, (error as Error).message);
      res.json({
        success: false,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          status: 'failed'
        },
        error: (error as Error).message
      });
    }
  } catch (error) {
    jobLogger.error({ err: error }, 'Failed to process next job');
    res.status(500).json({
      success: false,
      error: 'Failed to process next job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/jobs/process-all
 * Process all pending jobs in the queue (synchronous)
 * Mirrors IPC: job-queue-process-all
 */
router.post('/process-all', async (req: Request, res: Response) => {
  try {
    if (!settingsStore.hasValidKey()) {
      res.status(401).json({
        success: false,
        error: 'API key not configured. Please set your API key in Settings.',
        results: [],
        summary: { processed: 0, succeeded: 0, failed: 0 }
      });
      return;
    }

    await jobQueue.initialize();
    const results: Array<{
      jobId: string;
      title: string;
      company: string;
      success: boolean;
      score?: number;
      error?: string;
    }> = [];

    let processed = 0;
    const initialStatus = jobQueue.getStatus();
    const totalPending = initialStatus.pendingJobs;

    if (totalPending === 0) {
      res.json({
        success: true,
        message: 'No pending jobs to process',
        results: [],
        summary: { processed: 0, succeeded: 0, failed: 0 }
      });
      return;
    }

    const userId = req.user?.id || 'dev-user';
    while (true) {
      const status = jobQueue.getStatus();
      if (status.pendingJobs === 0) break;

      const job = await jobQueue.dequeue();
      if (!job) break;

      try {
        const result = await queueProcessor.processJob(job, userId);
        await jobQueue.completeJob(job.id, result);

        results.push({
          jobId: job.id,
          title: job.title,
          company: job.company,
          success: true,
          score: result.finalScore
        });
      } catch (error) {
        await jobQueue.failJob(job.id, (error as Error).message);

        results.push({
          jobId: job.id,
          title: job.title,
          company: job.company,
          success: false,
          error: (error as Error).message
        });
      }

      processed++;
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      results,
      summary: {
        processed,
        succeeded,
        failed,
        averageScore: succeeded > 0
          ? results.filter(r => r.success && r.score).reduce((sum, r) => sum + (r.score || 0), 0) / succeeded
          : 0
      }
    });
  } catch (error) {
    jobLogger.error({ err: error }, 'Failed to process job queue');
    res.status(500).json({
      success: false,
      error: 'Failed to process job queue',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Process a job asynchronously. Updates job status as it progresses.
 * This allows the POST /optimize endpoint to return immediately.
 */
async function processJobAsync(jobId: string, userId: string, resumeContent?: string): Promise<void> {
  console.log('PROCESS JOB ASYNC: starting', jobId, 'userId:', userId, 'resumeContent length:', resumeContent?.length || 0);
  await jobQueue.initialize();

  const job = await jobQueue.startJob(jobId);
  if (!job) {
    jobLogger.error({ jobId }, 'Failed to start job - not found or not pending');
    return;
  }

  const startTime = Date.now();

  try {
    jobLogger.info(
      { jobId, company: job.company, title: job.title },
      'Job processing started'
    );

    const result = await queueProcessor.processJob(job, userId, resumeContent);
    await jobQueue.completeJob(jobId, result);

    const duration = Date.now() - startTime;
    jobLogger.info(
      { jobId, score: result.finalScore, durationMs: duration },
      'Job completed successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    jobLogger.error(
      { err: error, jobId, durationMs: duration },
      'Job processing failed'
    );
    await jobQueue.failJob(jobId, (error as Error).message);
  }
}

/**
 * POST /api/jobs/search
 * Search for jobs using external job search APIs
 * Maps to IPC: search-jobs
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, location, remote, employmentTypes, datePosted, page, numPages } = req.body;

    if (!query) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: query'
      });
      return;
    }

    // Check if RapidAPI key is configured
    if (!rapidAPIProxy.isReady()) {
      res.status(400).json({
        success: false,
        error: 'Job search API not configured',
        message: 'RapidAPI key (RAPIDAPI_KEY) is required for job search.'
      });
      return;
    }

    const results = await rapidAPIProxy.searchJSearch(
      query,
      {
        location,
        remote,
        page: page || 1,
        numPages: numPages || 1
      },
      req.user?.id
    );

    // Transform to match expected format
    const jobs = (results.data || []).map(job => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city && job.job_state
        ? `${job.job_city}, ${job.job_state}`
        : job.job_country || 'Remote',
      sourceUrl: job.job_apply_link || job.job_google_link,
      snippet: job.job_description?.substring(0, 500) || '',
      description: job.job_description,
      salary: job.job_min_salary && job.job_max_salary
        ? `${job.job_salary_currency || '$'}${job.job_min_salary.toLocaleString()} - ${job.job_salary_currency || '$'}${job.job_max_salary.toLocaleString()}`
        : undefined,
      postedDate: job.job_posted_at_datetime_utc,
      remote: job.job_is_remote,
      employmentType: job.job_employment_type,
      relevanceScore: 1.0
    }));

    res.json({
      success: true,
      results: jobs,
      total: jobs.length
    });
  } catch (error) {
    jobLogger.error({ err: error }, 'Job search failed');
    res.status(500).json({
      success: false,
      error: 'Job search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      results: []
    });
  }
});

export default router;
