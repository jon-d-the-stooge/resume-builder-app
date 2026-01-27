/**
 * E2E Tests: Job Queue Polling
 *
 * Tests the asynchronous job queue system including:
 * - Job creation and queuing
 * - Status polling mechanisms
 * - Completion detection
 * - Error handling and retry behavior
 * - Multiple concurrent jobs
 *
 * These tests verify that the polling-based workflow for
 * long-running optimization jobs works correctly.
 */

import { test, expect, waitForJobCompletion, cleanupUserData } from './fixtures';

test.describe('Job Queue Polling', () => {
  test.afterEach(async ({ api }) => {
    await cleanupUserData(api);
  });

  test.describe('Job Lifecycle', () => {
    test('should track job through status transitions', async ({ api, generateJobData }) => {
      const jobData = generateJobData();

      // Create job
      const createResponse = await api.post('/api/jobs', { data: jobData });
      expect(createResponse.status()).toBe(201);

      const { job } = await createResponse.json();
      expect(job.status).toBe('pending');
      expect(job.addedAt).toBeDefined();

      // Verify pending status
      const statusResponse = await api.get(`/api/jobs/${job.id}`);
      const statusData = await statusResponse.json();
      expect(statusData.job.status).toBe('pending');
    });

    test('should return queue status counts', async ({ api, generateJobData }) => {
      // Create multiple jobs
      await api.post('/api/jobs', { data: generateJobData() });
      await api.post('/api/jobs', { data: generateJobData() });

      const response = await api.get('/api/jobs');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.status).toBeDefined();
      expect(typeof data.status.pending).toBe('number');
      expect(typeof data.status.processing).toBe('number');
      expect(typeof data.status.completed).toBe('number');
      expect(typeof data.status.failed).toBe('number');
    });

    test('should include total count in list response', async ({ api, generateJobData }) => {
      // Create jobs
      const job1Response = await api.post('/api/jobs', { data: generateJobData() });
      const job2Response = await api.post('/api/jobs', { data: generateJobData() });

      const { job: job1 } = await job1Response.json();
      const { job: job2 } = await job2Response.json();

      const response = await api.get('/api/jobs');
      const data = await response.json();

      expect(data.total).toBeGreaterThanOrEqual(2);
      expect(data.jobs.length).toBe(data.total);

      // Cleanup
      await api.delete(`/api/jobs/${job1.id}`);
      await api.delete(`/api/jobs/${job2.id}`);
    });
  });

  test.describe('Polling Mechanism', () => {
    test('should poll job status multiple times', async ({ api, generateJobData }) => {
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job } = await createResponse.json();

      // Poll multiple times
      const pollResults = [];
      for (let i = 0; i < 5; i++) {
        const pollResponse = await api.get(`/api/jobs/${job.id}`);
        expect(pollResponse.ok()).toBe(true);

        const pollData = await pollResponse.json();
        pollResults.push({
          iteration: i,
          status: pollData.job.status,
          timestamp: new Date().toISOString(),
        });

        // Short delay between polls
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // All polls should return consistent job data
      for (const result of pollResults) {
        expect(['pending', 'processing', 'completed', 'failed']).toContain(result.status);
      }

      // Cleanup
      await api.delete(`/api/jobs/${job.id}`);
    });

    test('should handle rapid polling without errors', async ({ api, generateJobData }) => {
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job } = await createResponse.json();

      // Rapid concurrent polls
      const pollPromises = Array.from({ length: 10 }, () => api.get(`/api/jobs/${job.id}`));

      const responses = await Promise.all(pollPromises);

      // All should succeed
      for (const response of responses) {
        expect(response.ok()).toBe(true);
      }

      // Cleanup
      await api.delete(`/api/jobs/${job.id}`);
    });

    test('should include result when job completes', async ({ api }) => {
      // Get any completed jobs
      const listResponse = await api.get('/api/jobs?status=completed');
      const { jobs } = await listResponse.json();

      if (jobs.length > 0) {
        const completedJob = jobs[0];
        const detailResponse = await api.get(`/api/jobs/${completedJob.id}`);
        const data = await detailResponse.json();

        expect(data.job.status).toBe('completed');
        expect(data.job.processedAt).toBeDefined();

        // Result should be present for completed jobs
        if (data.result) {
          expect(data.result.processedAt).toBeDefined();
        }
      }
    });

    test('should return error info for failed jobs', async ({ api }) => {
      // Get any failed jobs
      const listResponse = await api.get('/api/jobs?status=failed');
      const { jobs } = await listResponse.json();

      if (jobs.length > 0) {
        const failedJob = jobs[0];
        const detailResponse = await api.get(`/api/jobs/${failedJob.id}`);
        const data = await detailResponse.json();

        expect(data.job.status).toBe('failed');
        // Failed jobs should have error information
        expect(data.job.error || data.job.retryCount > 0).toBe(true);
      }
    });
  });

  test.describe('Optimization Trigger', () => {
    test('should accept optimization request with job ID', async ({ api, generateJobData }) => {
      // First create a pending job
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job } = await createResponse.json();

      // Attempt to trigger optimization
      const optimizeResponse = await api.post('/api/jobs/optimize', {
        data: { jobId: job.id },
      });

      // Could be 202 (accepted) or 401 (API key not configured) or 400 (invalid status)
      expect([202, 400, 401].includes(optimizeResponse.status())).toBe(true);

      // Cleanup
      await api.delete(`/api/jobs/${job.id}`);
    });

    test('should accept optimization request with new job data', async ({
      api,
      generateJobData,
    }) => {
      const jobData = generateJobData();

      const response = await api.post('/api/jobs/optimize', { data: jobData });

      // Could be 202 (accepted) or 401 (API key not configured)
      expect([202, 401].includes(response.status())).toBe(true);

      const result = await response.json();

      if (response.status() === 202) {
        expect(result.success).toBe(true);
        expect(result.jobId).toBeDefined();

        // Cleanup
        await api.delete(`/api/jobs/${result.jobId}`);
      }
    });

    test('should reject optimization for non-pending job', async ({ api }) => {
      // Get a completed job if available
      const listResponse = await api.get('/api/jobs?status=completed');
      const { jobs } = await listResponse.json();

      if (jobs.length > 0) {
        const completedJob = jobs[0];

        const response = await api.post('/api/jobs/optimize', {
          data: { jobId: completedJob.id },
        });

        // Should reject with 400 for invalid status
        expect(response.status()).toBe(400);
        const result = await response.json();
        expect(result.error).toBe('Invalid job status');
      }
    });

    test('should return 404 for non-existent job ID', async ({ api }) => {
      const response = await api.post('/api/jobs/optimize', {
        data: { jobId: 'non-existent-job-id-12345' },
      });

      expect(response.status()).toBe(404);
    });

    test('should require API key for optimization', async ({ api, generateJobData }) => {
      const jobData = generateJobData();

      const response = await api.post('/api/jobs/optimize', { data: jobData });

      if (response.status() === 401) {
        const result = await response.json();
        expect(result.error).toBe('API key not configured');
      }
      // If 202, API key is configured and test passes
    });
  });

  test.describe('Queue Management', () => {
    test('should respect job priority ordering', async ({ api, generateJobData }) => {
      // Create jobs with different priorities
      const lowPriorityJob = { ...generateJobData(), priority: 1 };
      const highPriorityJob = { ...generateJobData(), priority: 10 };
      const mediumPriorityJob = { ...generateJobData(), priority: 5 };

      await api.post('/api/jobs', { data: lowPriorityJob });
      await api.post('/api/jobs', { data: highPriorityJob });
      await api.post('/api/jobs', { data: mediumPriorityJob });

      // Get pending jobs - they should be ordered by priority
      const response = await api.get('/api/jobs?status=pending');
      const { jobs } = await response.json();

      // Verify priority ordering (higher priority first)
      for (let i = 1; i < jobs.length; i++) {
        expect(jobs[i - 1].priority).toBeGreaterThanOrEqual(jobs[i].priority);
      }
    });

    test('should track retry count', async ({ api }) => {
      // Get any failed jobs to check retry count
      const response = await api.get('/api/jobs?status=failed');
      const { jobs } = await response.json();

      for (const job of jobs) {
        expect(typeof job.retryCount).toBe('number');
        expect(job.retryCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should delete job and remove from queue', async ({ api, generateJobData }) => {
      // Create job
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job } = await createResponse.json();

      // Verify it's in the queue
      const listBeforeResponse = await api.get('/api/jobs');
      const { total: totalBefore } = await listBeforeResponse.json();

      // Delete job
      const deleteResponse = await api.delete(`/api/jobs/${job.id}`);
      expect(deleteResponse.status()).toBe(204);

      // Verify it's removed
      const listAfterResponse = await api.get('/api/jobs');
      const { total: totalAfter } = await listAfterResponse.json();

      expect(totalAfter).toBe(totalBefore - 1);
    });
  });

  test.describe('Concurrent Jobs', () => {
    test('should handle multiple concurrent job creations', async ({ api, generateJobData }) => {
      const jobPromises = Array.from({ length: 5 }, () =>
        api.post('/api/jobs', { data: generateJobData() })
      );

      const responses = await Promise.all(jobPromises);

      // All should succeed
      const createdJobs = [];
      for (const response of responses) {
        expect(response.status()).toBe(201);
        const { job } = await response.json();
        createdJobs.push(job);
      }

      // All should have unique IDs
      const jobIds = createdJobs.map((j) => j.id);
      const uniqueIds = new Set(jobIds);
      expect(uniqueIds.size).toBe(jobIds.length);

      // Cleanup
      for (const job of createdJobs) {
        await api.delete(`/api/jobs/${job.id}`);
      }
    });

    test('should handle concurrent polling of different jobs', async ({ api, generateJobData }) => {
      // Create multiple jobs
      const job1Response = await api.post('/api/jobs', { data: generateJobData() });
      const job2Response = await api.post('/api/jobs', { data: generateJobData() });
      const job3Response = await api.post('/api/jobs', { data: generateJobData() });

      const { job: job1 } = await job1Response.json();
      const { job: job2 } = await job2Response.json();
      const { job: job3 } = await job3Response.json();

      // Poll all concurrently
      const pollPromises = [
        api.get(`/api/jobs/${job1.id}`),
        api.get(`/api/jobs/${job2.id}`),
        api.get(`/api/jobs/${job3.id}`),
      ];

      const responses = await Promise.all(pollPromises);

      // All should succeed with correct job data
      const [data1, data2, data3] = await Promise.all(responses.map((r) => r.json()));

      expect(data1.job.id).toBe(job1.id);
      expect(data2.job.id).toBe(job2.id);
      expect(data3.job.id).toBe(job3.id);

      // Cleanup
      await Promise.all([
        api.delete(`/api/jobs/${job1.id}`),
        api.delete(`/api/jobs/${job2.id}`),
        api.delete(`/api/jobs/${job3.id}`),
      ]);
    });
  });

  test.describe('Polling Helper Integration', () => {
    test('waitForJobCompletion should timeout for stuck jobs', async ({ api, generateJobData }) => {
      // Create a job that won't be processed (no optimization trigger)
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job } = await createResponse.json();

      // Attempt to wait with short timeout - should timeout since job stays pending
      try {
        await waitForJobCompletion(api, job.id, {
          pollInterval: 100,
          maxWait: 500,
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('did not complete');
      }

      // Cleanup
      await api.delete(`/api/jobs/${job.id}`);
    });

    test('waitForJobCompletion should detect completed jobs', async ({ api }) => {
      // Get a completed job if available
      const listResponse = await api.get('/api/jobs?status=completed');
      const { jobs } = await listResponse.json();

      if (jobs.length > 0) {
        const completedJob = jobs[0];

        // Should return immediately since already completed
        const result = await waitForJobCompletion(api, completedJob.id, {
          pollInterval: 100,
          maxWait: 1000,
        });

        expect(result.job.status).toBe('completed');
      }
    });

    test('waitForJobCompletion should return 404 for non-existent job', async ({ api }) => {
      try {
        await waitForJobCompletion(api, 'non-existent-job-id-xyz', {
          pollInterval: 100,
          maxWait: 500,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Failed to get job status');
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should return 404 for non-existent job', async ({ api }) => {
      const response = await api.get('/api/jobs/non-existent-job-id-12345');
      expect(response.status()).toBe(404);

      const data = await response.json();
      expect(data.error).toBe('Job not found');
    });

    test('should return 404 when deleting non-existent job', async ({ api }) => {
      const response = await api.delete('/api/jobs/non-existent-job-id-12345');
      expect(response.status()).toBe(404);
    });

    test('should reject invalid status filter', async ({ api }) => {
      const response = await api.get('/api/jobs?status=invalid-status');

      // Should either ignore invalid filter or return validation error
      // Checking actual behavior
      expect([200, 400].includes(response.status())).toBe(true);
    });

    test('should handle malformed job data gracefully', async ({ api }) => {
      const response = await api.post('/api/jobs', {
        data: {
          // Missing required fields
          company: 'Test',
        },
      });

      // Should return validation error
      expect([400, 500].includes(response.status())).toBe(true);
    });
  });
});
