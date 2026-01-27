/**
 * Backend API Integration Tests
 *
 * Comprehensive tests for all API routes using mocked services and authentication.
 * Tests CRUD operations, user isolation, filtering, and error handling.
 *
 * Run with: npx vitest run src/tests/backend-api.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Application, Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ============================================================================
// Mock Services Setup - Using vi.hoisted() for proper mock hoisting
// ============================================================================

// Create mocks using vi.hoisted() so they're available when vi.mock() is hoisted
const {
  mockVaultManager,
  mockJobQueue,
  mockQueueProcessor,
  mockApplicationsStore,
  mockKnowledgeBaseStore,
  mockSettingsStore,
} = vi.hoisted(() => ({
  mockVaultManager: {
    getAllVaults: vi.fn(),
    getVault: vi.fn(),
    createVault: vi.fn(),
    updateVaultProfile: vi.fn(),
    deleteVault: vi.fn(),
  },
  mockJobQueue: {
    initialize: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn(),
    getQueue: vi.fn(),
    getJobsByStatus: vi.fn(),
    getJob: vi.fn(),
    removeJob: vi.fn(),
    dequeue: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ pending: 0, processing: 0, completed: 0, failed: 0 }),
  },
  mockQueueProcessor: {
    processJob: vi.fn(),
  },
  mockApplicationsStore: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      total: 0,
      byStatus: { saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0, withdrawn: 0 },
      averageScore: 0,
    }),
  },
  mockKnowledgeBaseStore: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      total: 0,
      averageScore: 0,
      companiesCount: 0,
      lastUpdated: null,
    }),
    getCompanies: vi.fn().mockReturnValue([]),
    getJobTitles: vi.fn().mockReturnValue([]),
  },
  mockSettingsStore: {
    isReady: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    getMasked: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
    hasValidKey: vi.fn().mockReturnValue(true),
    getProvider: vi.fn().mockReturnValue('anthropic'),
    getAdzunaCredentials: vi.fn().mockReturnValue(null),
    getJSearchApiKey: vi.fn().mockReturnValue(''),
  },
}));

// Mock the services module
vi.mock('../backend/services', () => ({
  vaultManager: mockVaultManager,
  jobQueue: mockJobQueue,
  queueProcessor: mockQueueProcessor,
  applicationsStore: mockApplicationsStore,
  knowledgeBaseStore: mockKnowledgeBaseStore,
  settingsStore: mockSettingsStore,
}));

// Mock the logger
vi.mock('../backend/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  loggers: {
    jobs: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

// Import routes after mocking
import vaultsRouter from '../backend/routes/vaults';
import jobsRouter from '../backend/routes/jobs';
import applicationsRouter from '../backend/routes/applications';
import knowledgeBaseRouter from '../backend/routes/knowledgeBase';
import settingsRouter from '../backend/routes/settings';

// ============================================================================
// Test App Setup
// ============================================================================

/**
 * Creates a test Express app with mocked authentication.
 * Authentication middleware injects a configurable test user.
 */
function createTestApp(testUserId: string = 'test-user-1'): Application {
  const app = express();
  app.use(express.json());

  // Mock authentication middleware - injects test user
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: testUserId,
      email: `${testUserId}@test.local`,
    };
    next();
  });

  // Mount routes
  app.use('/api/vaults', vaultsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/knowledge-base', knowledgeBaseRouter);
  app.use('/api/settings', settingsRouter);

  return app;
}

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockVault(overrides: Partial<any> = {}) {
  const now = new Date().toISOString();
  return {
    id: `vault-${Date.now()}`,
    version: 1,
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: null,
      location: null,
      links: [],
      headline: null,
    },
    sections: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      ownerId: 'test-user-1',
    },
    ...overrides,
  };
}

function createMockJob(overrides: Partial<any> = {}) {
  return {
    id: `job-${Date.now()}`,
    company: 'Test Company',
    title: 'Software Engineer',
    sourceUrl: 'https://example.com/job',
    rawDescription: 'Job description here',
    status: 'pending',
    priority: 0,
    addedAt: new Date(),
    processedAt: null,
    retryCount: 0,
    error: null,
    result: null,
    ...overrides,
  };
}

function createMockApplication(overrides: Partial<any> = {}) {
  const now = new Date().toISOString();
  return {
    id: `app-${Date.now()}`,
    userId: 'test-user-1',
    jobTitle: 'Software Engineer',
    company: 'Test Company',
    date: now,
    jobDescription: 'Full job description',
    generatedResume: 'Optimized resume content',
    score: 0.85,
    status: 'saved',
    sourceUrl: 'https://example.com/job',
    notes: null,
    metadata: {
      optimizedAt: now,
      iterations: 3,
      initialScore: 0.65,
    },
    ...overrides,
  };
}

function createMockKBEntry(overrides: Partial<any> = {}) {
  const now = new Date().toISOString();
  return {
    id: `kb-${Date.now()}`,
    userId: 'test-user-1',
    jobTitle: 'Software Engineer',
    company: 'Test Company',
    jobDescription: 'Full job description',
    sourceUrl: 'https://example.com/job',
    optimizedResume: 'Optimized resume content',
    createdAt: now,
    notes: null,
    tags: [],
    analysis: {
      finalScore: 0.85,
      initialScore: 0.65,
      iterations: 3,
      strengths: ['Strong TypeScript skills'],
      gaps: ['No AWS experience listed'],
      recommendations: [
        { priority: 'high', suggestion: 'Add cloud experience', rationale: 'Required skill' },
      ],
    },
    ...overrides,
  };
}

function createMockSettings() {
  return {
    llmProvider: 'anthropic',
    anthropicApiKey: '••••',
    openaiApiKey: '',
    defaultModel: 'claude-3-5-sonnet-20240620',
    jsearchApiKey: '',
    adzunaAppId: '',
    adzunaApiKey: '',
    maxIterations: 5,
    hasAnthropicKey: true,
    hasOpenaiKey: false,
  };
}

// ============================================================================
// VAULTS API TESTS
// ============================================================================

describe('Vaults API', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp('test-user-1');
    vi.clearAllMocks();
  });

  describe('GET /api/vaults', () => {
    it('should return all vaults for the authenticated user', async () => {
      const vaults = [createMockVault({ id: 'vault-1' }), createMockVault({ id: 'vault-2' })];
      mockVaultManager.getAllVaults.mockResolvedValue(vaults);

      const res = await request(app).get('/api/vaults');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(vaults);
      expect(mockVaultManager.getAllVaults).toHaveBeenCalledWith('test-user-1');
    });

    it('should return empty array when user has no vaults', async () => {
      mockVaultManager.getAllVaults.mockResolvedValue([]);

      const res = await request(app).get('/api/vaults');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockVaultManager.getAllVaults.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/api/vaults');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to list vaults');
    });
  });

  describe('POST /api/vaults', () => {
    it('should create a new vault', async () => {
      const vaultInput = {
        profile: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
      };
      const createdVault = createMockVault({ ...vaultInput, id: 'new-vault-id' });
      mockVaultManager.createVault.mockResolvedValue(createdVault);

      const res = await request(app).post('/api/vaults').send(vaultInput);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new-vault-id');
      expect(mockVaultManager.createVault).toHaveBeenCalledWith('test-user-1', vaultInput);
    });

    it('should handle creation errors', async () => {
      mockVaultManager.createVault.mockRejectedValue(new Error('Validation failed'));

      const res = await request(app).post('/api/vaults').send({ profile: {} });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create vault');
    });
  });

  describe('GET /api/vaults/:id', () => {
    it('should return a vault by ID', async () => {
      const vault = createMockVault({ id: 'vault-123' });
      mockVaultManager.getVault.mockResolvedValue(vault);

      const res = await request(app).get('/api/vaults/vault-123');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('vault-123');
      expect(mockVaultManager.getVault).toHaveBeenCalledWith('test-user-1', 'vault-123');
    });

    it('should return 404 for non-existent vault', async () => {
      mockVaultManager.getVault.mockResolvedValue(null);

      const res = await request(app).get('/api/vaults/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Vault not found');
    });
  });

  describe('PUT /api/vaults/:id', () => {
    it('should update a vault profile', async () => {
      const updatedVault = createMockVault({
        id: 'vault-123',
        profile: { firstName: 'Updated', lastName: 'Name', email: 'updated@example.com' },
      });
      mockVaultManager.updateVaultProfile.mockResolvedValue(updatedVault);

      const res = await request(app)
        .put('/api/vaults/vault-123')
        .send({ firstName: 'Updated', lastName: 'Name' });

      expect(res.status).toBe(200);
      expect(res.body.profile.firstName).toBe('Updated');
    });

    it('should return 404 for non-existent vault', async () => {
      mockVaultManager.updateVaultProfile.mockRejectedValue(new Error('Vault not found: vault-xyz'));

      const res = await request(app).put('/api/vaults/vault-xyz').send({ firstName: 'Test' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Vault not found');
    });
  });

  describe('DELETE /api/vaults/:id', () => {
    it('should delete a vault', async () => {
      mockVaultManager.deleteVault.mockResolvedValue(undefined);

      const res = await request(app).delete('/api/vaults/vault-123');

      expect(res.status).toBe(204);
      expect(mockVaultManager.deleteVault).toHaveBeenCalledWith('test-user-1', 'vault-123');
    });

    it('should return 404 for non-existent vault', async () => {
      mockVaultManager.deleteVault.mockRejectedValue(new Error('Vault not found: vault-xyz'));

      const res = await request(app).delete('/api/vaults/vault-xyz');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Vault not found');
    });
  });

  describe('User Isolation', () => {
    it('should only return vaults for the authenticated user', async () => {
      const user1App = createTestApp('user-1');
      const user2App = createTestApp('user-2');

      mockVaultManager.getAllVaults.mockImplementation((userId: string) => {
        if (userId === 'user-1') return Promise.resolve([createMockVault({ id: 'v1' })]);
        if (userId === 'user-2') return Promise.resolve([createMockVault({ id: 'v2' })]);
        return Promise.resolve([]);
      });

      const res1 = await request(user1App).get('/api/vaults');
      const res2 = await request(user2App).get('/api/vaults');

      expect(res1.body).toHaveLength(1);
      expect(res1.body[0].id).toBe('v1');
      expect(res2.body).toHaveLength(1);
      expect(res2.body[0].id).toBe('v2');
    });

    it('should not allow accessing another user\'s vault', async () => {
      const user2App = createTestApp('user-2');
      mockVaultManager.getVault.mockResolvedValue(null); // Simulates ownership check failing

      const res = await request(user2App).get('/api/vaults/user-1-vault');

      expect(res.status).toBe(404);
    });
  });
});

// ============================================================================
// JOBS API TESTS
// ============================================================================

describe('Jobs API', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp('test-user-1');
    vi.clearAllMocks();
  });

  describe('POST /api/jobs', () => {
    it('should create a new job', async () => {
      const jobInput = {
        company: 'Acme Corp',
        title: 'Senior Engineer',
        description: 'Build awesome software',
        sourceUrl: 'https://acme.com/job',
      };
      const createdJob = createMockJob({
        id: 'job-new',
        company: 'Acme Corp',
        title: 'Senior Engineer',
      });
      mockJobQueue.enqueue.mockResolvedValue(createdJob);

      const res = await request(app).post('/api/jobs').send(jobInput);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.job.company).toBe('Acme Corp');
    });

    it('should combine structured fields into description', async () => {
      const jobInput = {
        company: 'Test Co',
        title: 'Developer',
        description: 'Overview',
        requirements: ['Node.js', 'TypeScript'],
        responsibilities: ['Build APIs'],
        preferredQualifications: ['5+ years exp'],
      };
      const createdJob = createMockJob({ id: 'job-structured' });
      mockJobQueue.enqueue.mockResolvedValue(createdJob);

      const res = await request(app).post('/api/jobs').send(jobInput);

      expect(res.status).toBe(201);
      // Verify the description was combined
      const callArgs = mockJobQueue.enqueue.mock.calls[0][0];
      expect(callArgs.rawDescription).toContain('## Requirements');
      expect(callArgs.rawDescription).toContain('Node.js');
    });
  });

  describe('GET /api/jobs', () => {
    it('should return all jobs in the queue', async () => {
      const jobs = [
        createMockJob({ id: 'job-1', status: 'pending' }),
        createMockJob({ id: 'job-2', status: 'completed' }),
      ];
      mockJobQueue.getQueue.mockReturnValue(jobs);

      const res = await request(app).get('/api/jobs');

      expect(res.status).toBe(200);
      expect(res.body.jobs).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('should filter jobs by status', async () => {
      const pendingJobs = [createMockJob({ id: 'job-1', status: 'pending' })];
      mockJobQueue.getJobsByStatus.mockReturnValue(pendingJobs);

      const res = await request(app).get('/api/jobs?status=pending');

      expect(res.status).toBe(200);
      expect(res.body.jobs).toHaveLength(1);
      expect(mockJobQueue.getJobsByStatus).toHaveBeenCalledWith('pending');
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('should return a job with result when completed', async () => {
      const job = createMockJob({
        id: 'job-123',
        status: 'completed',
        result: {
          finalScore: 0.9,
          previousScore: 0.7,
          matchedSkills: ['TypeScript', 'React'],
          missingSkills: ['AWS'],
          gaps: [],
          recommendations: [],
          optimizedContent: 'Optimized resume...',
          processedAt: new Date(),
        },
      });
      mockJobQueue.getJob.mockReturnValue(job);

      const res = await request(app).get('/api/jobs/job-123');

      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('completed');
      expect(res.body.result.finalScore).toBe(0.9);
    });

    it('should return 404 for non-existent job', async () => {
      mockJobQueue.getJob.mockReturnValue(null);

      const res = await request(app).get('/api/jobs/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found');
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('should cancel/remove a job', async () => {
      mockJobQueue.removeJob.mockResolvedValue(true);

      const res = await request(app).delete('/api/jobs/job-123');

      expect(res.status).toBe(204);
    });

    it('should return 404 for non-existent job', async () => {
      mockJobQueue.removeJob.mockResolvedValue(false);

      const res = await request(app).delete('/api/jobs/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/jobs/optimize', () => {
    it('should queue a new optimization job and return 202', async () => {
      const newJob = createMockJob({ id: 'opt-job-1', status: 'pending' });
      mockJobQueue.enqueue.mockResolvedValue(newJob);
      mockJobQueue.getJob.mockReturnValue(null); // No existing job

      const res = await request(app).post('/api/jobs/optimize').send({
        company: 'Optimize Co',
        title: 'Engineer',
        description: 'Job description',
      });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe('opt-job-1');
      expect(res.body.message).toContain('Poll GET /api/jobs/:id');
    });

    it('should process existing pending job by ID', async () => {
      const existingJob = createMockJob({ id: 'existing-job', status: 'pending' });
      mockJobQueue.getJob.mockReturnValue(existingJob);

      const res = await request(app).post('/api/jobs/optimize').send({ jobId: 'existing-job' });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBe('existing-job');
    });

    it('should reject non-pending job', async () => {
      const completedJob = createMockJob({ id: 'completed-job', status: 'completed' });
      mockJobQueue.getJob.mockReturnValue(completedJob);

      const res = await request(app).post('/api/jobs/optimize').send({ jobId: 'completed-job' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid job status');
    });

    it('should return 401 when API key is not configured', async () => {
      mockSettingsStore.hasValidKey.mockReturnValue(false);

      const res = await request(app).post('/api/jobs/optimize').send({
        company: 'Test',
        title: 'Test',
        description: 'Test',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('API key not configured');

      // Reset mock
      mockSettingsStore.hasValidKey.mockReturnValue(true);
    });

    it('should return 400 for missing required fields', async () => {
      mockJobQueue.getJob.mockReturnValue(null);

      const res = await request(app).post('/api/jobs/optimize').send({ company: 'Only Company' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });
  });
});

// ============================================================================
// APPLICATIONS API TESTS
// ============================================================================

describe('Applications API', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp('test-user-1');
    vi.clearAllMocks();
  });

  describe('GET /api/applications', () => {
    it('should return all applications with stats', async () => {
      const applications = [
        createMockApplication({ id: 'app-1', status: 'saved' }),
        createMockApplication({ id: 'app-2', status: 'applied' }),
      ];
      mockApplicationsStore.list.mockReturnValue(applications);

      const res = await request(app).get('/api/applications');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.applications).toHaveLength(2);
      expect(res.body.stats).toBeDefined();
    });

    it('should filter applications by status', async () => {
      const savedApps = [createMockApplication({ status: 'saved' })];
      mockApplicationsStore.list.mockReturnValue(savedApps);

      const res = await request(app).get('/api/applications?status=saved');

      expect(res.status).toBe(200);
      expect(mockApplicationsStore.list).toHaveBeenCalledWith('test-user-1', 'saved');
    });

    it('should reject invalid status filter', async () => {
      const res = await request(app).get('/api/applications?status=invalid');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid status filter');
    });
  });

  describe('GET /api/applications/stats', () => {
    it('should return application statistics', async () => {
      mockApplicationsStore.getStats.mockReturnValue({
        total: 10,
        byStatus: { saved: 3, applied: 4, interviewing: 2, offered: 1, rejected: 0, withdrawn: 0 },
        averageScore: 0.82,
      });

      const res = await request(app).get('/api/applications/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.total).toBe(10);
    });
  });

  describe('GET /api/applications/:id', () => {
    it('should return an application by ID', async () => {
      const application = createMockApplication({ id: 'app-123' });
      mockApplicationsStore.get.mockReturnValue(application);

      const res = await request(app).get('/api/applications/app-123');

      expect(res.status).toBe(200);
      expect(res.body.application.id).toBe('app-123');
    });

    it('should return 404 for non-existent application', async () => {
      mockApplicationsStore.get.mockReturnValue(null);

      const res = await request(app).get('/api/applications/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/applications', () => {
    it('should save a new application', async () => {
      const input = {
        jobTitle: 'Senior Engineer',
        company: 'Tech Corp',
        jobDescription: 'Full description',
        generatedResume: 'Optimized resume',
        score: 0.88,
        sourceUrl: 'https://techcorp.com/job',
        metadata: { iterations: 4, initialScore: 0.7 },
      };
      const savedApp = createMockApplication({ ...input, id: 'new-app-id' });
      mockApplicationsStore.save.mockReturnValue(savedApp);

      const res = await request(app).post('/api/applications').send(input);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.application.id).toBe('new-app-id');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app).post('/api/applications').send({
        jobTitle: 'Only Title',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });

    it('should reject missing metadata', async () => {
      const res = await request(app).post('/api/applications').send({
        jobTitle: 'Engineer',
        company: 'Company',
        jobDescription: 'Description',
        generatedResume: 'Resume',
        score: 0.8,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing metadata');
    });
  });

  describe('PATCH /api/applications/:id', () => {
    it('should update application status', async () => {
      const updatedApp = createMockApplication({ id: 'app-123', status: 'applied' });
      mockApplicationsStore.update.mockReturnValue(updatedApp);

      const res = await request(app).patch('/api/applications/app-123').send({ status: 'applied' });

      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe('applied');
    });

    it('should update application notes', async () => {
      const updatedApp = createMockApplication({ id: 'app-123', notes: 'New note' });
      mockApplicationsStore.update.mockReturnValue(updatedApp);

      const res = await request(app)
        .patch('/api/applications/app-123')
        .send({ notes: 'New note' });

      expect(res.status).toBe(200);
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .patch('/api/applications/app-123')
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid status');
    });

    it('should reject empty update', async () => {
      const res = await request(app).patch('/api/applications/app-123').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No updates provided');
    });

    it('should return 404 for non-existent application', async () => {
      mockApplicationsStore.update.mockReturnValue(null);

      const res = await request(app)
        .patch('/api/applications/non-existent')
        .send({ status: 'applied' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/applications/:id', () => {
    it('should delete an application', async () => {
      mockApplicationsStore.delete.mockReturnValue(true);

      const res = await request(app).delete('/api/applications/app-123');

      expect(res.status).toBe(204);
    });

    it('should return 404 for non-existent application', async () => {
      mockApplicationsStore.delete.mockReturnValue(false);

      const res = await request(app).delete('/api/applications/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('User Isolation', () => {
    it('should only return applications for the authenticated user', async () => {
      const user1App = createTestApp('user-1');
      const user2App = createTestApp('user-2');

      mockApplicationsStore.list.mockImplementation((userId: string) => {
        if (userId === 'user-1') return [createMockApplication({ id: 'a1', userId: 'user-1' })];
        if (userId === 'user-2') return [createMockApplication({ id: 'a2', userId: 'user-2' })];
        return [];
      });

      const res1 = await request(user1App).get('/api/applications');
      const res2 = await request(user2App).get('/api/applications');

      expect(res1.body.applications[0].id).toBe('a1');
      expect(res2.body.applications[0].id).toBe('a2');
    });
  });
});

// ============================================================================
// KNOWLEDGE BASE API TESTS
// ============================================================================

describe('Knowledge Base API', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp('test-user-1');
    vi.clearAllMocks();
  });

  describe('GET /api/knowledge-base', () => {
    it('should return all entries', async () => {
      const entries = [createMockKBEntry({ id: 'kb-1' }), createMockKBEntry({ id: 'kb-2' })];
      mockKnowledgeBaseStore.list.mockReturnValue(entries);

      const res = await request(app).get('/api/knowledge-base');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.entries).toHaveLength(2);
    });

    it('should filter by company', async () => {
      mockKnowledgeBaseStore.list.mockReturnValue([createMockKBEntry({ company: 'Acme' })]);

      const res = await request(app).get('/api/knowledge-base?company=Acme');

      expect(res.status).toBe(200);
      expect(mockKnowledgeBaseStore.list).toHaveBeenCalledWith(
        'test-user-1',
        expect.objectContaining({ company: 'Acme' })
      );
    });

    it('should filter by job title', async () => {
      mockKnowledgeBaseStore.list.mockReturnValue([]);

      const res = await request(app).get('/api/knowledge-base?jobTitle=Engineer');

      expect(res.status).toBe(200);
      expect(mockKnowledgeBaseStore.list).toHaveBeenCalledWith(
        'test-user-1',
        expect.objectContaining({ jobTitle: 'Engineer' })
      );
    });

    it('should filter by date range', async () => {
      mockKnowledgeBaseStore.list.mockReturnValue([]);

      const res = await request(app).get(
        '/api/knowledge-base?dateStart=2024-01-01&dateEnd=2024-12-31'
      );

      expect(res.status).toBe(200);
      expect(mockKnowledgeBaseStore.list).toHaveBeenCalledWith(
        'test-user-1',
        expect.objectContaining({
          dateStart: '2024-01-01',
          dateEnd: '2024-12-31',
        })
      );
    });

    it('should search by text', async () => {
      mockKnowledgeBaseStore.list.mockReturnValue([]);

      const res = await request(app).get('/api/knowledge-base?text=typescript');

      expect(res.status).toBe(200);
      expect(mockKnowledgeBaseStore.list).toHaveBeenCalledWith(
        'test-user-1',
        expect.objectContaining({ text: 'typescript' })
      );
    });

    it('should support sorting', async () => {
      mockKnowledgeBaseStore.list.mockReturnValue([]);

      const res = await request(app).get('/api/knowledge-base?sortBy=score&sortOrder=desc');

      expect(res.status).toBe(200);
      expect(mockKnowledgeBaseStore.list).toHaveBeenCalledWith(
        'test-user-1',
        expect.objectContaining({ sortBy: 'score', sortOrder: 'desc' })
      );
    });
  });

  describe('GET /api/knowledge-base/stats', () => {
    it('should return KB statistics', async () => {
      mockKnowledgeBaseStore.getStats.mockReturnValue({
        total: 25,
        averageScore: 0.84,
        companiesCount: 10,
        lastUpdated: '2024-01-15T00:00:00.000Z',
      });

      const res = await request(app).get('/api/knowledge-base/stats');

      expect(res.status).toBe(200);
      expect(res.body.stats.total).toBe(25);
    });
  });

  describe('GET /api/knowledge-base/companies', () => {
    it('should return unique company list', async () => {
      mockKnowledgeBaseStore.getCompanies.mockReturnValue(['Acme', 'TechCorp', 'StartupXYZ']);

      const res = await request(app).get('/api/knowledge-base/companies');

      expect(res.status).toBe(200);
      expect(res.body.companies).toEqual(['Acme', 'TechCorp', 'StartupXYZ']);
    });
  });

  describe('GET /api/knowledge-base/job-titles', () => {
    it('should return unique job title list', async () => {
      mockKnowledgeBaseStore.getJobTitles.mockReturnValue([
        'Software Engineer',
        'Senior Developer',
      ]);

      const res = await request(app).get('/api/knowledge-base/job-titles');

      expect(res.status).toBe(200);
      expect(res.body.jobTitles).toHaveLength(2);
    });
  });

  describe('GET /api/knowledge-base/:id', () => {
    it('should return an entry by ID', async () => {
      const entry = createMockKBEntry({ id: 'kb-123' });
      mockKnowledgeBaseStore.get.mockReturnValue(entry);

      const res = await request(app).get('/api/knowledge-base/kb-123');

      expect(res.status).toBe(200);
      expect(res.body.entry.id).toBe('kb-123');
    });

    it('should return 404 for non-existent entry', async () => {
      mockKnowledgeBaseStore.get.mockReturnValue(null);

      const res = await request(app).get('/api/knowledge-base/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/knowledge-base', () => {
    it('should save a new entry', async () => {
      const input = {
        jobTitle: 'Staff Engineer',
        company: 'BigTech',
        jobDescription: 'Lead technical initiatives',
        optimizedResume: 'Tailored resume content',
        analysis: {
          finalScore: 0.91,
          initialScore: 0.72,
          iterations: 5,
          strengths: ['Leadership experience'],
          gaps: ['No startup experience'],
          recommendations: [{ priority: 'medium', suggestion: 'Add scaling examples' }],
        },
      };
      const savedEntry = createMockKBEntry({ ...input, id: 'new-kb-id' });
      mockKnowledgeBaseStore.save.mockReturnValue(savedEntry);

      const res = await request(app).post('/api/knowledge-base').send(input);

      expect(res.status).toBe(201);
      expect(res.body.entry.id).toBe('new-kb-id');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app).post('/api/knowledge-base').send({
        jobTitle: 'Only Title',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });

    it('should reject invalid analysis structure', async () => {
      const res = await request(app).post('/api/knowledge-base').send({
        jobTitle: 'Engineer',
        company: 'Company',
        jobDescription: 'Description',
        optimizedResume: 'Resume',
        analysis: {
          finalScore: 0.8,
          // Missing other required fields
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid analysis structure');
    });
  });

  describe('PATCH /api/knowledge-base/:id', () => {
    it('should update entry notes', async () => {
      const updatedEntry = createMockKBEntry({ id: 'kb-123', notes: 'Updated notes' });
      mockKnowledgeBaseStore.update.mockReturnValue(updatedEntry);

      const res = await request(app)
        .patch('/api/knowledge-base/kb-123')
        .send({ notes: 'Updated notes' });

      expect(res.status).toBe(200);
    });

    it('should update entry tags', async () => {
      const updatedEntry = createMockKBEntry({ id: 'kb-123', tags: ['remote', 'senior'] });
      mockKnowledgeBaseStore.update.mockReturnValue(updatedEntry);

      const res = await request(app)
        .patch('/api/knowledge-base/kb-123')
        .send({ tags: ['remote', 'senior'] });

      expect(res.status).toBe(200);
    });

    it('should reject non-array tags', async () => {
      const res = await request(app)
        .patch('/api/knowledge-base/kb-123')
        .send({ tags: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid tags');
    });

    it('should reject empty update', async () => {
      const res = await request(app).patch('/api/knowledge-base/kb-123').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No updates provided');
    });

    it('should return 404 for non-existent entry', async () => {
      mockKnowledgeBaseStore.update.mockReturnValue(null);

      const res = await request(app)
        .patch('/api/knowledge-base/non-existent')
        .send({ notes: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/knowledge-base/:id', () => {
    it('should delete an entry', async () => {
      mockKnowledgeBaseStore.delete.mockReturnValue(true);

      const res = await request(app).delete('/api/knowledge-base/kb-123');

      expect(res.status).toBe(204);
    });

    it('should return 404 for non-existent entry', async () => {
      mockKnowledgeBaseStore.delete.mockReturnValue(false);

      const res = await request(app).delete('/api/knowledge-base/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/knowledge-base/:id/export', () => {
    it('should export entry as markdown by default', async () => {
      const entry = createMockKBEntry({ id: 'kb-123' });
      mockKnowledgeBaseStore.get.mockResolvedValue(entry);

      const res = await request(app).get('/api/knowledge-base/kb-123/export');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('# Software Engineer at Test Company');
    });

    it('should export entry as JSON when format=json', async () => {
      const entry = createMockKBEntry({ id: 'kb-123' });
      mockKnowledgeBaseStore.get.mockResolvedValue(entry);

      const res = await request(app).get('/api/knowledge-base/kb-123/export?format=json');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.id).toBe('kb-123');
    });

    it('should return 404 for non-existent entry', async () => {
      mockKnowledgeBaseStore.get.mockResolvedValue(null);

      const res = await request(app).get('/api/knowledge-base/non-existent/export');

      expect(res.status).toBe(404);
    });
  });

  describe('User Isolation', () => {
    it('should only return entries for the authenticated user', async () => {
      const user1App = createTestApp('user-1');
      const user2App = createTestApp('user-2');

      mockKnowledgeBaseStore.list.mockImplementation((userId: string) => {
        if (userId === 'user-1') return [createMockKBEntry({ id: 'kb1', userId: 'user-1' })];
        if (userId === 'user-2') return [createMockKBEntry({ id: 'kb2', userId: 'user-2' })];
        return [];
      });

      const res1 = await request(user1App).get('/api/knowledge-base');
      const res2 = await request(user2App).get('/api/knowledge-base');

      expect(res1.body.entries[0].id).toBe('kb1');
      expect(res2.body.entries[0].id).toBe('kb2');
    });
  });
});

// ============================================================================
// SETTINGS API TESTS
// ============================================================================

describe('Settings API', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp('test-user-1');
    vi.clearAllMocks();
  });

  describe('GET /api/settings', () => {
    it('should return masked settings', async () => {
      const maskedSettings = createMockSettings();
      mockSettingsStore.getMasked.mockReturnValue(maskedSettings);

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.settings.anthropicApiKey).toBe('••••');
      expect(res.body.settings.hasAnthropicKey).toBe(true);
    });

    it('should initialize store if not ready', async () => {
      mockSettingsStore.isReady.mockReturnValue(false);
      mockSettingsStore.getMasked.mockReturnValue(createMockSettings());

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(mockSettingsStore.initialize).toHaveBeenCalledWith('test-user-1');
    });
  });

  describe('PUT /api/settings', () => {
    it('should update settings', async () => {
      const res = await request(app).put('/api/settings').send({
        llmProvider: 'openai',
        openaiApiKey: 'sk-test-key',
        maxIterations: 7,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSettingsStore.set).toHaveBeenCalledWith('test-user-1', {
        llmProvider: 'openai',
        openaiApiKey: 'sk-test-key',
        maxIterations: 7,
      });
    });

    it('should reject invalid LLM provider', async () => {
      const res = await request(app).put('/api/settings').send({
        llmProvider: 'invalid-provider',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid LLM provider');
    });

    it('should reject invalid maxIterations (too low)', async () => {
      const res = await request(app).put('/api/settings').send({
        maxIterations: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid maxIterations');
    });

    it('should reject invalid maxIterations (too high)', async () => {
      const res = await request(app).put('/api/settings').send({
        maxIterations: 15,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid maxIterations');
    });

    it('should allow partial updates', async () => {
      const res = await request(app).put('/api/settings').send({
        anthropicApiKey: 'sk-ant-new-key',
      });

      expect(res.status).toBe(200);
      expect(mockSettingsStore.set).toHaveBeenCalledWith('test-user-1', {
        anthropicApiKey: 'sk-ant-new-key',
      });
    });
  });

  describe('GET /api/settings/api-key-status', () => {
    it('should return configured status', async () => {
      mockSettingsStore.hasValidKey.mockReturnValue(true);
      mockSettingsStore.getProvider.mockReturnValue('anthropic');

      const res = await request(app).get('/api/settings/api-key-status');

      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.provider).toBe('anthropic');
    });

    it('should return not configured when no key', async () => {
      mockSettingsStore.hasValidKey.mockReturnValue(false);
      mockSettingsStore.getProvider.mockReturnValue(null);

      const res = await request(app).get('/api/settings/api-key-status');

      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });
  });

  describe('GET /api/settings/job-search-credentials', () => {
    it('should return job search API status', async () => {
      mockSettingsStore.getAdzunaCredentials.mockReturnValue({ appId: 'app', apiKey: 'key' });
      mockSettingsStore.getJSearchApiKey.mockReturnValue('jsearch-key');

      const res = await request(app).get('/api/settings/job-search-credentials');

      expect(res.status).toBe(200);
      expect(res.body.adzuna.configured).toBe(true);
      expect(res.body.jsearch.configured).toBe(true);
    });

    it('should return not configured when no credentials', async () => {
      mockSettingsStore.getAdzunaCredentials.mockReturnValue(null);
      mockSettingsStore.getJSearchApiKey.mockReturnValue('');

      const res = await request(app).get('/api/settings/job-search-credentials');

      expect(res.status).toBe(200);
      expect(res.body.adzuna.configured).toBe(false);
      expect(res.body.jsearch.configured).toBe(false);
    });
  });

  describe('DELETE /api/settings', () => {
    it('should clear settings', async () => {
      const res = await request(app).delete('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSettingsStore.clear).toHaveBeenCalledWith('test-user-1');
    });
  });

  describe('User Isolation', () => {
    it('should use correct user ID for each user', async () => {
      const user1App = createTestApp('user-1');
      const user2App = createTestApp('user-2');

      mockSettingsStore.getMasked.mockReturnValue(createMockSettings());

      await request(user1App).get('/api/settings');
      await request(user2App).get('/api/settings');

      expect(mockSettingsStore.getMasked).toHaveBeenCalledWith('user-1');
      expect(mockSettingsStore.getMasked).toHaveBeenCalledWith('user-2');
    });
  });
});
