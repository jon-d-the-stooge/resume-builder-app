/**
 * Playwright E2E Test Configuration
 *
 * Configures Playwright for full-stack E2E testing against both
 * the backend API (Express) and frontend (React/Vite).
 *
 * Test categories:
 * - Authentication flows (Auth0 or mock auth)
 * - Vault CRUD and content management
 * - Job queue optimization with polling
 * - Multi-user isolation verification
 */

import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from .env.test if present
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './src/tests/e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI for now - can enable once tests are stable */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],

  /* Shared settings for all projects */
  use: {
    /* Base URL for API calls and navigation */
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure for debugging */
    video: 'on-first-retry',

    /* Default timeout for actions */
    actionTimeout: 10000,

    /* Default navigation timeout */
    navigationTimeout: 30000,

    /* Extra HTTP headers for API requests */
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  },

  /* Configure projects for different test types */
  projects: [
    /* API-only tests - no browser needed */
    {
      name: 'api',
      testMatch: /.*\.api\.test\.ts/,
      use: {
        // API tests don't need a browser
      },
    },

    /* Full E2E tests with browser */
    {
      name: 'chromium',
      testMatch: /.*\.e2e\.test\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    /* Mobile viewport testing */
    {
      name: 'mobile',
      testMatch: /.*\.e2e\.test\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],

  /* Run local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        NODE_ENV: 'test',
        AUTH_DISABLED: 'true',
        PORT: '3001',
      },
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],

  /* Global timeout for tests */
  timeout: 60000,

  /* Expect timeout */
  expect: {
    timeout: 10000,
  },

  /* Output folder for test artifacts */
  outputDir: 'test-results/',
});
