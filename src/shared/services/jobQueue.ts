/**
 * Job Queue System
 *
 * FIFO queue for job postings awaiting ATS optimization.
 * Persists queue state to Obsidian vault for durability.
 */

import * as fs from 'fs';
import * as path from 'path';
import { obsidianClient } from '../obsidian/client';

/**
 * Status of a queued job
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Parsed elements from a job posting
 */
export interface ParsedJobElements {
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  keywords: string[];
  experienceYears?: number;
  educationLevel?: string;
}

/**
 * Result of ATS optimization for a job
 */
export interface OptimizationResult {
  jobId: string;
  finalScore: number;
  previousScore: number;
  matchedSkills: Array<{ name: string; importance: number }>;
  missingSkills: Array<{ name: string; importance: number }>;
  gaps: Array<{ name: string; importance: number; suggestion: string }>;
  recommendations: string[];
  optimizedContent?: string;
  processedAt: Date;
}

/**
 * Progress tracking for a job in processing
 */
export interface JobProgress {
  phase: 'analyzing' | 'identifying' | 'rewriting' | 'refining' | 'complete' | 'error';
  message: string;
  updatedAt: Date;
}

/**
 * A job posting in the queue
 */
export interface QueuedJob {
  id: string;
  sourceUrl?: string;
  company: string;
  title: string;
  rawDescription: string;
  parsedElements?: ParsedJobElements;
  status: JobStatus;
  priority: number; // Higher = more important
  addedAt: Date;
  processedAt?: Date;
  result?: OptimizationResult;
  error?: string;
  retryCount: number;
  maxRetries: number;
  progress?: JobProgress;
}

/**
 * Input for adding a job to the queue
 */
export interface QueueJobInput {
  sourceUrl?: string;
  company: string;
  title: string;
  rawDescription: string;
  parsedElements?: ParsedJobElements;
  priority?: number;
}

/**
 * Queue status summary
 */
export interface QueueStatus {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  currentJob: QueuedJob | null;
}

/**
 * Event types for queue changes
 */
export type QueueEventType =
  | 'job-added'
  | 'job-started'
  | 'job-completed'
  | 'job-failed'
  | 'job-removed'
  | 'queue-cleared';

/**
 * Queue event listener callback
 */
export type QueueEventListener = (event: QueueEventType, job: QueuedJob | null) => void;

/**
 * Job Queue implementation
 */
export class JobQueue {
  private queue: QueuedJob[] = [];
  private processing: QueuedJob | null = null;
  private listeners: QueueEventListener[] = [];
  private persistPath: string;
  private autoSave: boolean;
  private initialized: boolean = false;

  constructor(options?: { persistPath?: string; autoSave?: boolean }) {
    this.persistPath = options?.persistPath || 'job-queue/queue.json';
    this.autoSave = options?.autoSave ?? true;
  }

  /**
   * Initializes the queue, loading persisted state if available.
   * Skips reload if already initialized to preserve in-memory state (like progress).
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.load();
    this.initialized = true;
  }

  /**
   * Adds a job to the queue
   */
  async enqueue(input: QueueJobInput): Promise<QueuedJob> {
    // DEBUG: Log what we receive
    console.log('[JobQueue.enqueue] Input received:', JSON.stringify({
      hasSourceUrl: !!input.sourceUrl,
      company: input.company,
      title: input.title,
      rawDescriptionLength: input.rawDescription?.length ?? 0,
      rawDescriptionPreview: input.rawDescription?.substring(0, 100)
    }));

    const job: QueuedJob = {
      id: this.generateJobId(),
      sourceUrl: input.sourceUrl,
      company: input.company,
      title: input.title,
      rawDescription: input.rawDescription,
      parsedElements: input.parsedElements,
      status: 'pending',
      priority: input.priority ?? 0,
      addedAt: new Date(),
      retryCount: 0,
      maxRetries: 3
    };

    // DEBUG: Log the created job
    console.log('[JobQueue.enqueue] Job created:', JSON.stringify({
      id: job.id,
      hasRawDescription: !!job.rawDescription,
      rawDescLength: job.rawDescription?.length ?? 0
    }));

    // Insert based on priority (higher priority first)
    const insertIndex = this.queue.findIndex(q => q.priority < job.priority);
    if (insertIndex === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(insertIndex, 0, job);
    }

    this.emit('job-added', job);

    if (this.autoSave) {
      await this.save();
    }

    return job;
  }

  /**
   * Gets the next pending job without removing it
   */
  peek(): QueuedJob | null {
    return this.queue.find(j => j.status === 'pending') || null;
  }

  /**
   * Removes and returns the next pending job for processing
   */
  async dequeue(): Promise<QueuedJob | null> {
    const job = this.queue.find(j => j.status === 'pending');

    if (!job) {
      return null;
    }

    job.status = 'processing';
    this.processing = job;

    this.emit('job-started', job);

    if (this.autoSave) {
      await this.save();
    }

    return job;
  }

  /**
   * Marks a specific pending job as processing and returns it.
   */
  async startJob(jobId: string): Promise<QueuedJob | null> {
    console.log('[JobQueue.startJob] Looking for job:', jobId);
    console.log('[JobQueue.startJob] Queue has', this.queue.length, 'jobs');
    this.queue.forEach((j, i) => {
      console.log(`[JobQueue.startJob] Queue[${i}]: id=${j.id}, status=${j.status}`);
    });

    const job = this.queue.find(j => j.id === jobId && j.status === 'pending');

    if (!job) {
      console.log('[JobQueue.startJob] Job not found or not pending');
      return null;
    }
    console.log('[JobQueue.startJob] Found job, marking as processing');

    job.status = 'processing';
    this.processing = job;

    this.emit('job-started', job);

    if (this.autoSave) {
      await this.save();
    }

    return job;
  }

  /**
   * Marks the current job as completed
   */
  async completeJob(jobId: string, result: OptimizationResult): Promise<void> {
    const job = this.queue.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = 'completed';
    job.processedAt = new Date();
    job.result = result;

    if (this.processing?.id === jobId) {
      this.processing = null;
    }

    this.emit('job-completed', job);

    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Marks a job as failed
   */
  async failJob(jobId: string, error: string): Promise<void> {
    const job = this.queue.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.retryCount++;

    if (job.retryCount >= job.maxRetries) {
      job.status = 'failed';
      job.error = error;
      this.emit('job-failed', job);
    } else {
      // Reset to pending for retry
      job.status = 'pending';
    }

    if (this.processing?.id === jobId) {
      this.processing = null;
    }

    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Removes a job from the queue
   */
  async removeJob(jobId: string): Promise<boolean> {
    const index = this.queue.findIndex(j => j.id === jobId);

    if (index === -1) {
      return false;
    }

    const [removed] = this.queue.splice(index, 1);

    if (this.processing?.id === jobId) {
      this.processing = null;
    }

    this.emit('job-removed', removed);

    if (this.autoSave) {
      await this.save();
    }

    return true;
  }

  /**
   * Updates a job's priority
   */
  async updatePriority(jobId: string, priority: number): Promise<void> {
    const job = this.queue.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.priority = priority;

    // Re-sort queue by priority
    this.queue.sort((a, b) => b.priority - a.priority);

    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Gets the current queue status
   */
  getStatus(): QueueStatus {
    return {
      totalJobs: this.queue.length,
      pendingJobs: this.queue.filter(j => j.status === 'pending').length,
      processingJobs: this.queue.filter(j => j.status === 'processing').length,
      completedJobs: this.queue.filter(j => j.status === 'completed').length,
      failedJobs: this.queue.filter(j => j.status === 'failed').length,
      currentJob: this.processing
    };
  }

  /**
   * Gets all jobs in the queue
   */
  getQueue(): QueuedJob[] {
    return [...this.queue];
  }

  /**
   * Gets jobs filtered by status
   */
  getJobsByStatus(status: JobStatus): QueuedJob[] {
    return this.queue.filter(j => j.status === status);
  }

  /**
   * Gets a specific job by ID
   */
  getJob(jobId: string): QueuedJob | undefined {
    return this.queue.find(j => j.id === jobId);
  }

  /**
   * Updates the progress of a job
   */
  updateProgress(jobId: string, phase: JobProgress['phase'], message: string): void {
    const job = this.queue.find(j => j.id === jobId);
    if (job) {
      job.progress = {
        phase,
        message,
        updatedAt: new Date()
      };
      // Don't persist on every progress update to avoid excessive I/O
      // Progress is ephemeral and doesn't need to survive restarts
    }
  }

  /**
   * Clears all completed and failed jobs
   */
  async clearFinished(): Promise<number> {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(j => j.status === 'pending' || j.status === 'processing');
    const removed = initialLength - this.queue.length;

    if (removed > 0) {
      this.emit('queue-cleared', null);

      if (this.autoSave) {
        await this.save();
      }
    }

    return removed;
  }

  /**
   * Clears the entire queue
   */
  async clearAll(): Promise<void> {
    this.queue = [];
    this.processing = null;
    this.emit('queue-cleared', null);

    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Gets the position of a job in the queue
   */
  getPosition(jobId: string): number {
    const pendingJobs = this.queue.filter(j => j.status === 'pending');
    const index = pendingJobs.findIndex(j => j.id === jobId);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Adds an event listener
   */
  addEventListener(listener: QueueEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Removes an event listener
   */
  removeEventListener(listener: QueueEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emits an event to all listeners
   */
  private emit(event: QueueEventType, job: QueuedJob | null): void {
    for (const listener of this.listeners) {
      try {
        listener(event, job);
      } catch (error) {
        console.error('Queue event listener error:', error);
      }
    }
  }

  /**
   * Persists queue state to storage
   */
  async save(): Promise<void> {
    const vaultPath = obsidianClient.getVaultRootPath();
    const fullPath = path.join(vaultPath, this.persistPath);

    // Ensure directory exists
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const data = {
      queue: this.queue.map(j => ({
        ...j,
        addedAt: j.addedAt.toISOString(),
        processedAt: j.processedAt?.toISOString(),
        // Progress is ephemeral and not persisted (cleared on save)
        progress: undefined,
        result: j.result ? {
          ...j.result,
          processedAt: j.result.processedAt.toISOString()
        } : undefined
      })),
      savedAt: new Date().toISOString()
    };

    // DEBUG: Log what we're saving
    console.log('[JobQueue.save] Saving queue with', this.queue.length, 'jobs');
    this.queue.forEach((j, i) => {
      console.log(`[JobQueue.save] Job ${i}: id=${j.id}, rawDescLen=${j.rawDescription?.length ?? 'MISSING'}`);
    });

    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Loads queue state from storage
   */
  async load(): Promise<void> {
    const vaultPath = obsidianClient.getVaultRootPath();
    const fullPath = path.join(vaultPath, this.persistPath);

    if (!fs.existsSync(fullPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(content);

      this.queue = data.queue.map((j: any) => ({
        ...j,
        addedAt: new Date(j.addedAt),
        processedAt: j.processedAt ? new Date(j.processedAt) : undefined,
        // Progress is not persisted, clear any stale data
        progress: undefined,
        result: j.result ? {
          ...j.result,
          processedAt: new Date(j.result.processedAt)
        } : undefined
      }));

      // Reset any processing jobs to pending (app may have crashed)
      for (const job of this.queue) {
        if (job.status === 'processing') {
          job.status = 'pending';
        }
      }

      // DEBUG: Log loaded jobs with rawDescription status
      console.log(`Loaded ${this.queue.length} jobs from queue`);
      this.queue.forEach((j, i) => {
        console.log(`[JobQueue.load] Job ${i}: id=${j.id}, rawDescLen=${j.rawDescription?.length ?? 'MISSING'}`);
      });
    } catch (error) {
      console.error('Failed to load job queue:', error);
    }
  }

  /**
   * Generates a unique job ID
   */
  private generateJobId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `job-${timestamp}-${random}`;
  }

  /**
   * Gets queue statistics
   */
  getStatistics(): {
    averageProcessingTime: number;
    successRate: number;
    totalProcessed: number;
  } {
    const completed = this.queue.filter(j => j.status === 'completed' && j.result);
    const failed = this.queue.filter(j => j.status === 'failed');
    const totalProcessed = completed.length + failed.length;

    let averageProcessingTime = 0;
    if (completed.length > 0) {
      const totalTime = completed.reduce((sum, j) => {
        const processTime = j.processedAt!.getTime() - j.addedAt.getTime();
        return sum + processTime;
      }, 0);
      averageProcessingTime = totalTime / completed.length;
    }

    return {
      averageProcessingTime,
      successRate: totalProcessed > 0 ? completed.length / totalProcessed : 0,
      totalProcessed
    };
  }
}

// Export singleton instance
export const jobQueue = new JobQueue();
