/**
 * E2E Test Fixtures and Helpers
 *
 * Provides reusable fixtures for Playwright E2E tests including:
 * - Authenticated API request context
 * - Multi-user test contexts
 * - Test data factories
 * - Cleanup utilities
 */

import { test as base, expect, APIRequestContext } from '@playwright/test';

// ============================================================================
// Configuration
// ============================================================================

export const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:3001';
export const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:5173';

/**
 * Test users for multi-user isolation testing.
 * In AUTH_DISABLED mode, we use X-Dev-User-Id header to specify user.
 */
export const TEST_USERS = {
  user1: {
    id: 'e2e-test-user-1',
    email: 'user1@e2e-test.local',
  },
  user2: {
    id: 'e2e-test-user-2',
    email: 'user2@e2e-test.local',
  },
  user3: {
    id: 'e2e-test-user-3',
    email: 'user3@e2e-test.local',
  },
};

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedFixtures {
  /** API context authenticated as user1 */
  api: APIRequestContext;
  /** API context authenticated as user2 (for isolation tests) */
  api2: APIRequestContext;
  /** User IDs for the authenticated contexts */
  userIds: { user1: string; user2: string };
  /** Helper to create authenticated API context for any user */
  createAuthenticatedContext: (userId: string, email?: string) => Promise<APIRequestContext>;
}

export interface TestDataFixtures {
  /** Generate unique test vault data */
  generateVaultData: () => VaultTestData;
  /** Generate unique test job data */
  generateJobData: () => JobTestData;
  /** Generate unique test content data */
  generateContentData: (type: string) => ContentTestData;
  /** Unique test run ID for isolation */
  testRunId: string;
}

export interface VaultTestData {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    location?: string;
    headline?: string;
    links?: Array<{ label: string; url: string }>;
  };
}

export interface JobTestData {
  company: string;
  title: string;
  description: string;
  sourceUrl?: string;
  requirements?: string[];
  responsibilities?: string[];
  priority?: number;
}

export interface ContentTestData {
  type: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Test Data Factories
// ============================================================================

let testCounter = 0;

/**
 * Generate unique vault test data
 */
export function generateVaultData(): VaultTestData {
  testCounter++;
  const timestamp = Date.now();
  return {
    profile: {
      firstName: `E2ETest${testCounter}`,
      lastName: `User${timestamp}`,
      email: `e2e-test-${testCounter}-${timestamp}@test.local`,
      phone: '+1-555-0100',
      location: 'Test City, TC',
      headline: `Software Engineer (Test ${testCounter})`,
      links: [
        { label: 'LinkedIn', url: `https://linkedin.com/in/e2e-test-${timestamp}` },
        { label: 'GitHub', url: `https://github.com/e2e-test-${timestamp}` },
      ],
    },
  };
}

/**
 * Generate unique job test data for optimization
 */
export function generateJobData(): JobTestData {
  testCounter++;
  const timestamp = Date.now();
  return {
    company: `E2E Test Company ${testCounter}`,
    title: `Senior Software Engineer ${timestamp}`,
    description: `
## About the Role

We are looking for a Senior Software Engineer to join our team and help build the next generation of our platform.

## Requirements

- 5+ years of experience in software development
- Strong proficiency in TypeScript and Node.js
- Experience with React and modern frontend frameworks
- Understanding of RESTful API design
- Experience with PostgreSQL or similar databases
- Strong problem-solving skills

## Responsibilities

- Design and implement scalable backend services
- Collaborate with product and design teams
- Mentor junior developers
- Participate in code reviews
- Write comprehensive tests

## Nice to Have

- Experience with Kubernetes and Docker
- Knowledge of AWS or GCP
- Experience with GraphQL
- Contributions to open source projects
    `.trim(),
    sourceUrl: `https://example.com/jobs/${timestamp}`,
    requirements: [
      'TypeScript',
      'Node.js',
      'React',
      'PostgreSQL',
      'REST APIs',
    ],
    responsibilities: [
      'Design scalable services',
      'Code reviews',
      'Mentor juniors',
    ],
    priority: 5,
  };
}

/**
 * Generate unique content test data
 */
export function generateContentData(type: string): ContentTestData {
  testCounter++;
  const timestamp = Date.now();
  return {
    type,
    content: `E2E Test ${type} content ${testCounter} - ${timestamp}`,
    tags: ['e2e-test', `test-${testCounter}`, type],
    metadata: {
      testId: testCounter,
      timestamp,
    },
  };
}

// ============================================================================
// Custom Test Fixture
// ============================================================================

/**
 * Extended test fixture with authenticated API contexts
 */
export const test = base.extend<AuthenticatedFixtures & TestDataFixtures>({
  /**
   * Primary authenticated API context (user1)
   */
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: API_BASE_URL,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Dev-User-Id': TEST_USERS.user1.id,
        'X-Dev-User-Email': TEST_USERS.user1.email,
      },
    });
    await use(context);
    await context.dispose();
  },

  /**
   * Secondary authenticated API context (user2) for isolation tests
   */
  api2: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: API_BASE_URL,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Dev-User-Id': TEST_USERS.user2.id,
        'X-Dev-User-Email': TEST_USERS.user2.email,
      },
    });
    await use(context);
    await context.dispose();
  },

  /**
   * User IDs for reference in tests
   */
  userIds: async ({}, use) => {
    await use({
      user1: TEST_USERS.user1.id,
      user2: TEST_USERS.user2.id,
    });
  },

  /**
   * Factory for creating additional authenticated contexts
   */
  createAuthenticatedContext: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];

    const factory = async (userId: string, email?: string) => {
      const context = await playwright.request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Dev-User-Id': userId,
          'X-Dev-User-Email': email || `${userId}@test.local`,
        },
      });
      contexts.push(context);
      return context;
    };

    await use(factory);

    // Cleanup all created contexts
    for (const ctx of contexts) {
      await ctx.dispose();
    }
  },

  /**
   * Vault data generator
   */
  generateVaultData: async ({}, use) => {
    await use(generateVaultData);
  },

  /**
   * Job data generator
   */
  generateJobData: async ({}, use) => {
    await use(generateJobData);
  },

  /**
   * Content data generator
   */
  generateContentData: async ({}, use) => {
    await use(generateContentData);
  },

  /**
   * Unique test run ID for data isolation
   */
  testRunId: async ({}, use) => {
    const id = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await use(id);
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Poll for job completion with timeout
 */
export async function waitForJobCompletion(
  api: APIRequestContext,
  jobId: string,
  options: {
    pollInterval?: number;
    maxWait?: number;
    expectedStatus?: 'completed' | 'failed';
  } = {}
): Promise<{ job: any; result: any }> {
  const {
    pollInterval = 1000,
    maxWait = 60000,
    expectedStatus,
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const response = await api.get(`/api/jobs/${jobId}`);

    if (!response.ok()) {
      throw new Error(`Failed to get job status: ${response.status()}`);
    }

    const data = await response.json();
    const { job, result } = data;

    // Check if job is in a terminal state
    if (job.status === 'completed' || job.status === 'failed') {
      if (expectedStatus && job.status !== expectedStatus) {
        throw new Error(`Job ended with status '${job.status}' but expected '${expectedStatus}'`);
      }
      return { job, result };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job ${jobId} did not complete within ${maxWait}ms`);
}

/**
 * Clean up test data for a specific user
 */
export async function cleanupUserData(api: APIRequestContext): Promise<void> {
  // Delete all vaults
  try {
    const vaultsResponse = await api.get('/api/vaults');
    if (vaultsResponse.ok()) {
      const vaults = await vaultsResponse.json();
      for (const vault of vaults) {
        await api.delete(`/api/vaults/${vault.id}`);
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  // Delete all applications
  try {
    const appsResponse = await api.get('/api/applications');
    if (appsResponse.ok()) {
      const { applications } = await appsResponse.json();
      for (const app of applications) {
        await api.delete(`/api/applications/${app.id}`);
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  // Delete all knowledge base entries
  try {
    const kbResponse = await api.get('/api/knowledge-base');
    if (kbResponse.ok()) {
      const { entries } = await kbResponse.json();
      for (const entry of entries) {
        await api.delete(`/api/knowledge-base/${entry.id}`);
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Assert that a response has the expected status
 */
export function assertStatus(response: { status: () => number }, expected: number): void {
  expect(response.status()).toBe(expected);
}

/**
 * Assert that a response is successful (2xx)
 */
export function assertSuccess(response: { ok: () => boolean; status: () => number }): void {
  expect(response.ok(), `Expected success but got ${response.status()}`).toBe(true);
}

// Re-export expect for convenience
export { expect } from '@playwright/test';
