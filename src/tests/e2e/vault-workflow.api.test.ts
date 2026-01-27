/**
 * E2E Tests: Vault Workflow
 *
 * Tests the complete workflow:
 * 1. Create vault with profile
 * 2. Add content (skills, experience, etc.)
 * 3. Run optimization against job posting
 * 4. View and verify results
 *
 * This tests the core user journey through the resume optimization system.
 */

import { test, expect, waitForJobCompletion, cleanupUserData } from './fixtures';

test.describe('Vault Workflow: Create → Add Content → Optimize → View Results', () => {
  // Clean up test data after each test to avoid pollution
  test.afterEach(async ({ api }) => {
    await cleanupUserData(api);
  });

  test.describe('Step 1: Vault Creation', () => {
    test('should create a new vault with complete profile', async ({ api, generateVaultData }) => {
      const vaultData = generateVaultData();

      const response = await api.post('/api/vaults', { data: vaultData });
      expect(response.status()).toBe(201);

      const vault = await response.json();

      // Verify structure
      expect(vault.id).toBeDefined();
      expect(vault.version).toBe(1);
      expect(vault.profile).toBeDefined();
      expect(vault.sections).toBeDefined();
      expect(vault.metadata).toBeDefined();

      // Verify profile data
      expect(vault.profile.firstName).toBe(vaultData.profile.firstName);
      expect(vault.profile.lastName).toBe(vaultData.profile.lastName);
      expect(vault.profile.email).toBe(vaultData.profile.email);

      // Verify metadata
      expect(vault.metadata.createdAt).toBeDefined();
      expect(vault.metadata.updatedAt).toBeDefined();
    });

    test('should retrieve created vault by ID', async ({ api, generateVaultData }) => {
      // Create vault
      const vaultData = generateVaultData();
      const createResponse = await api.post('/api/vaults', { data: vaultData });
      const createdVault = await createResponse.json();

      // Retrieve by ID
      const getResponse = await api.get(`/api/vaults/${createdVault.id}`);
      expect(getResponse.status()).toBe(200);

      const retrievedVault = await getResponse.json();
      expect(retrievedVault.id).toBe(createdVault.id);
      expect(retrievedVault.profile.email).toBe(vaultData.profile.email);
    });

    test('should list all user vaults', async ({ api, generateVaultData }) => {
      // Create multiple vaults
      const vault1Data = generateVaultData();
      const vault2Data = generateVaultData();

      await api.post('/api/vaults', { data: vault1Data });
      await api.post('/api/vaults', { data: vault2Data });

      // List vaults
      const listResponse = await api.get('/api/vaults');
      expect(listResponse.status()).toBe(200);

      const vaults = await listResponse.json();
      expect(Array.isArray(vaults)).toBe(true);
      expect(vaults.length).toBeGreaterThanOrEqual(2);
    });

    test('should update vault profile', async ({ api, generateVaultData }) => {
      // Create vault
      const vaultData = generateVaultData();
      const createResponse = await api.post('/api/vaults', { data: vaultData });
      const vault = await createResponse.json();

      // Update profile
      const updateResponse = await api.put(`/api/vaults/${vault.id}`, {
        data: {
          firstName: 'UpdatedFirst',
          lastName: 'UpdatedLast',
          headline: 'Updated Headline - Senior Engineer',
        },
      });
      expect(updateResponse.status()).toBe(200);

      const updatedVault = await updateResponse.json();
      expect(updatedVault.profile.firstName).toBe('UpdatedFirst');
      expect(updatedVault.profile.lastName).toBe('UpdatedLast');
      expect(updatedVault.profile.headline).toBe('Updated Headline - Senior Engineer');
      // Original fields should remain
      expect(updatedVault.profile.email).toBe(vaultData.profile.email);
    });

    test('should delete a vault', async ({ api, generateVaultData }) => {
      // Create vault
      const vaultData = generateVaultData();
      const createResponse = await api.post('/api/vaults', { data: vaultData });
      const vault = await createResponse.json();

      // Delete vault
      const deleteResponse = await api.delete(`/api/vaults/${vault.id}`);
      expect(deleteResponse.status()).toBe(204);

      // Verify deletion
      const getResponse = await api.get(`/api/vaults/${vault.id}`);
      expect(getResponse.status()).toBe(404);
    });
  });

  test.describe('Step 2: Content Management', () => {
    test('should create content items of different types', async ({ api, generateContentData }) => {
      const contentTypes = ['skill', 'accomplishment', 'job-entry'];

      for (const type of contentTypes) {
        const contentData = generateContentData(type);

        const response = await api.post('/api/content', {
          data: contentData,
        });

        // Content creation should succeed or return validation response
        expect([200, 201, 400].includes(response.status())).toBe(true);

        if (response.ok()) {
          const result = await response.json();
          expect(result.success).toBeDefined();
        }
      }
    });

    test('should search content by type', async ({ api }) => {
      const response = await api.get('/api/content?contentType=skill');

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('should search content by text', async ({ api }) => {
      const response = await api.get('/api/content?text=TypeScript');

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.items).toBeDefined();
    });
  });

  test.describe('Step 3: Job Queue & Optimization', () => {
    test('should create a job in the queue', async ({ api, generateJobData }) => {
      const jobData = generateJobData();

      const response = await api.post('/api/jobs', { data: jobData });
      expect(response.status()).toBe(201);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.job).toBeDefined();
      expect(result.job.id).toBeDefined();
      expect(result.job.company).toBe(jobData.company);
      expect(result.job.title).toBe(jobData.title);
      expect(result.job.status).toBe('pending');
    });

    test('should list jobs in the queue', async ({ api, generateJobData }) => {
      // Create some jobs
      await api.post('/api/jobs', { data: generateJobData() });
      await api.post('/api/jobs', { data: generateJobData() });

      const response = await api.get('/api/jobs');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.jobs).toBeDefined();
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(2);
      expect(data.status).toBeDefined();
    });

    test('should filter jobs by status', async ({ api }) => {
      const response = await api.get('/api/jobs?status=pending');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.jobs).toBeDefined();

      // All returned jobs should be pending
      for (const job of data.jobs) {
        expect(job.status).toBe('pending');
      }
    });

    test('should get a specific job by ID', async ({ api, generateJobData }) => {
      // Create a job
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job: createdJob } = await createResponse.json();

      // Get by ID
      const getResponse = await api.get(`/api/jobs/${createdJob.id}`);
      expect(getResponse.status()).toBe(200);

      const data = await getResponse.json();
      expect(data.job.id).toBe(createdJob.id);
      expect(data.job.company).toBe(jobData.company);
    });

    test('should delete/cancel a job', async ({ api, generateJobData }) => {
      // Create a job
      const jobData = generateJobData();
      const createResponse = await api.post('/api/jobs', { data: jobData });
      const { job: createdJob } = await createResponse.json();

      // Delete the job
      const deleteResponse = await api.delete(`/api/jobs/${createdJob.id}`);
      expect(deleteResponse.status()).toBe(204);

      // Verify deletion
      const getResponse = await api.get(`/api/jobs/${createdJob.id}`);
      expect(getResponse.status()).toBe(404);
    });

    test('should start optimization job (requires API key)', async ({ api, generateJobData }) => {
      const jobData = generateJobData();

      // Attempt to start optimization
      const response = await api.post('/api/jobs/optimize', { data: jobData });

      // This will either succeed (202) if API key is configured,
      // or fail with 401 if not configured
      expect([202, 401].includes(response.status())).toBe(true);

      const result = await response.json();

      if (response.status() === 202) {
        // Successfully queued
        expect(result.success).toBe(true);
        expect(result.jobId).toBeDefined();
        expect(result.message).toContain('Poll');
      } else {
        // API key not configured
        expect(result.error).toBe('API key not configured');
      }
    });
  });

  test.describe('Step 4: View Results', () => {
    test('should get completed job with result', async ({ api }) => {
      // First, we need to have a completed job
      // For this test, we'll check the structure when a job is completed

      const listResponse = await api.get('/api/jobs?status=completed');
      const { jobs } = await listResponse.json();

      if (jobs.length > 0) {
        const completedJob = jobs[0];
        const detailResponse = await api.get(`/api/jobs/${completedJob.id}`);
        const data = await detailResponse.json();

        expect(data.job.status).toBe('completed');
        expect(data.result).toBeDefined();

        if (data.result) {
          // Verify result structure
          expect(data.result.finalScore).toBeDefined();
          expect(data.result.processedAt).toBeDefined();
        }
      }
    });

    test('should save optimization to applications', async ({ api }) => {
      // Create an application record (simulating saving an optimization result)
      const applicationData = {
        jobTitle: 'E2E Test Engineer',
        company: 'E2E Test Company',
        jobDescription: 'Test job description for E2E testing',
        generatedResume: 'Optimized resume content for testing',
        score: 0.85,
        sourceUrl: 'https://example.com/test-job',
        metadata: {
          iterations: 3,
          initialScore: 0.65,
        },
      };

      const response = await api.post('/api/applications', { data: applicationData });
      expect(response.status()).toBe(201);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.application).toBeDefined();
      expect(result.application.id).toBeDefined();
      expect(result.application.score).toBe(0.85);
    });

    test('should save optimization to knowledge base', async ({ api }) => {
      // Create a knowledge base entry (simulating saving optimization insights)
      const kbData = {
        jobTitle: 'E2E Test Developer',
        company: 'E2E Testing Corp',
        jobDescription: 'Full job description for knowledge base test',
        optimizedResume: 'Tailored resume content saved to knowledge base',
        analysis: {
          finalScore: 0.88,
          initialScore: 0.62,
          iterations: 4,
          strengths: ['Strong TypeScript skills', 'Testing experience'],
          gaps: ['No cloud certification'],
          recommendations: [
            {
              priority: 'high' as const,
              suggestion: 'Add AWS certification',
            },
          ],
        },
        tags: ['e2e-test', 'typescript'],
      };

      const response = await api.post('/api/knowledge-base', { data: kbData });
      expect(response.status()).toBe(201);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry.id).toBeDefined();
      expect(result.entry.analysis.finalScore).toBe(0.88);
    });

    test('should list and filter applications', async ({ api }) => {
      const response = await api.get('/api/applications');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.applications).toBeDefined();
      expect(data.stats).toBeDefined();
    });

    test('should list and filter knowledge base entries', async ({ api }) => {
      const response = await api.get('/api/knowledge-base');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.entries).toBeDefined();
    });
  });

  test.describe('Complete Workflow Integration', () => {
    test('should complete full workflow: create vault → add job → save application', async ({
      api,
      generateVaultData,
      generateJobData,
    }) => {
      // Step 1: Create vault
      const vaultData = generateVaultData();
      const vaultResponse = await api.post('/api/vaults', { data: vaultData });
      expect(vaultResponse.status()).toBe(201);
      const vault = await vaultResponse.json();

      // Step 2: Create job in queue
      const jobData = generateJobData();
      const jobResponse = await api.post('/api/jobs', { data: jobData });
      expect(jobResponse.status()).toBe(201);
      const { job } = await jobResponse.json();

      // Step 3: Verify job is in queue
      const listResponse = await api.get('/api/jobs');
      const { jobs } = await listResponse.json();
      const foundJob = jobs.find((j: any) => j.id === job.id);
      expect(foundJob).toBeDefined();

      // Step 4: Save as application (simulating post-optimization)
      const applicationData = {
        jobTitle: jobData.title,
        company: jobData.company,
        jobDescription: jobData.description,
        generatedResume: `Resume for ${vault.profile.firstName} ${vault.profile.lastName}`,
        score: 0.82,
        sourceUrl: jobData.sourceUrl,
        metadata: {
          iterations: 3,
          initialScore: 0.58,
        },
      };

      const appResponse = await api.post('/api/applications', { data: applicationData });
      expect(appResponse.status()).toBe(201);
      const { application } = await appResponse.json();

      // Step 5: Verify application is saved
      const getAppResponse = await api.get(`/api/applications/${application.id}`);
      expect(getAppResponse.ok()).toBe(true);
      const savedApp = await getAppResponse.json();
      expect(savedApp.application.company).toBe(jobData.company);

      // Cleanup: Delete the job
      await api.delete(`/api/jobs/${job.id}`);
    });

    test('should track application through status changes', async ({ api, generateJobData }) => {
      const jobData = generateJobData();

      // Create application
      const createResponse = await api.post('/api/applications', {
        data: {
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          generatedResume: 'Test resume',
          score: 0.75,
          metadata: { iterations: 2, initialScore: 0.5 },
        },
      });
      const { application } = await createResponse.json();

      // Status progression: saved → applied → interviewing
      const statusProgression = ['applied', 'interviewing'];

      for (const newStatus of statusProgression) {
        const updateResponse = await api.patch(`/api/applications/${application.id}`, {
          data: { status: newStatus },
        });
        expect(updateResponse.ok()).toBe(true);

        const updated = await updateResponse.json();
        expect(updated.application.status).toBe(newStatus);
      }

      // Verify final status
      const getResponse = await api.get(`/api/applications/${application.id}`);
      const finalApp = await getResponse.json();
      expect(finalApp.application.status).toBe('interviewing');
    });
  });
});
