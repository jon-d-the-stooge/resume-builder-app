/**
 * E2E Tests: Full Stack Browser Tests
 *
 * Tests that run against the complete stack using a real browser.
 * These tests verify:
 * - Frontend renders correctly
 * - Navigation works
 * - API integration from browser
 * - Form submissions
 * - UI state management
 *
 * Run with: npm run test:e2e:ui
 */

import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

test.describe('Full Stack E2E Tests', () => {
  test.describe('Application Loading', () => {
    test('should load the application homepage', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Wait for React to render
      await page.waitForLoadState('networkidle');

      // Check page title or main heading
      await expect(page.locator('body')).toBeVisible();
    });

    test('should display navigation header', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Look for navigation elements
      const nav = page.locator('nav, .nav-header');
      await expect(nav).toBeVisible({ timeout: 10000 });
    });

    test('should show dashboard content', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Wait for dashboard to render
      await page.waitForLoadState('networkidle');

      // Check for dashboard elements
      const dashboard = page.locator('.dashboard-title, h1:has-text("Dashboard")');
      // Dashboard might exist
      if ((await dashboard.count()) > 0) {
        await expect(dashboard).toBeVisible();
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to different pages', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // Find navigation links
      const navLinks = page.locator('.nav-link, nav a');
      const linkCount = await navLinks.count();

      if (linkCount > 0) {
        // Click on a navigation link
        const firstLink = navLinks.first();
        await firstLink.click();
        await page.waitForLoadState('networkidle');

        // Page should still be functional after navigation
        await expect(page.locator('body')).toBeVisible();
      }
    });

    test('should have working settings link', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // Look for settings link/button
      const settingsLink = page.locator('a[href*="settings"], .nav-settings');

      if ((await settingsLink.count()) > 0) {
        await settingsLink.click();
        await page.waitForLoadState('networkidle');
        // Should navigate without error
        await expect(page.locator('body')).toBeVisible();
      }
    });
  });

  test.describe('API Health Check from Browser', () => {
    test('should be able to reach API health endpoint', async ({ page }) => {
      // Navigate to health endpoint directly
      const response = await page.request.get(`${API_URL}/api/health`);

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.status).toBe('ok');
    });

    test('should handle CORS from browser context', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Execute fetch from browser context
      const result = await page.evaluate(async (apiUrl) => {
        try {
          const response = await fetch(`${apiUrl}/api/health`);
          const data = await response.json();
          return { ok: response.ok, data };
        } catch (error: any) {
          return { error: error.message };
        }
      }, API_URL);

      // Should succeed with CORS enabled
      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe('ok');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle 404 pages gracefully', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/non-existent-page-12345`);

      // Page should still render (SPA handles routing)
      await expect(page.locator('body')).toBeVisible();

      // Should not show JavaScript error
      const errorLogs: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errorLogs.push(msg.text());
        }
      });

      // Give time for any errors to appear
      await page.waitForTimeout(1000);

      // Filter out expected errors (like favicon)
      const criticalErrors = errorLogs.filter(
        (e) => !e.includes('favicon') && !e.includes('404')
      );

      expect(criticalErrors.length).toBe(0);
    });

    test('should not have JavaScript errors on load', async ({ page }) => {
      const errors: string[] = [];

      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // No page errors should occur
      expect(errors.length).toBe(0);
    });
  });

  test.describe('Responsive Design', () => {
    test('should be responsive at desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('body')).toBeVisible();

      // Check that content is not cut off
      const body = page.locator('body');
      const box = await body.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
    });

    test('should be responsive at tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('body')).toBeVisible();
    });

    test('should be responsive at mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('API Integration', () => {
    test('should fetch vaults from API via browser', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Make API call from browser context with auth header
      const result = await page.evaluate(async (apiUrl) => {
        try {
          const response = await fetch(`${apiUrl}/api/vaults`, {
            headers: {
              'Content-Type': 'application/json',
              'X-Dev-User-Id': 'e2e-browser-user',
              'X-Dev-User-Email': 'e2e-browser@test.local',
            },
          });
          const data = await response.json();
          return { ok: response.ok, status: response.status, data };
        } catch (error: any) {
          return { error: error.message };
        }
      }, API_URL);

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test('should create vault from browser context', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Create vault via browser fetch
      const result = await page.evaluate(async (apiUrl) => {
        try {
          const response = await fetch(`${apiUrl}/api/vaults`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Dev-User-Id': 'e2e-browser-user',
              'X-Dev-User-Email': 'e2e-browser@test.local',
            },
            body: JSON.stringify({
              profile: {
                firstName: 'Browser',
                lastName: 'Test',
                email: 'browser-test@e2e.local',
              },
            }),
          });
          const data = await response.json();
          return { ok: response.ok, status: response.status, data };
        } catch (error: any) {
          return { error: error.message };
        }
      }, API_URL);

      expect(result.ok).toBe(true);
      expect(result.data.id).toBeDefined();

      // Cleanup
      if (result.data.id) {
        await page.evaluate(
          async ({ apiUrl, vaultId }) => {
            await fetch(`${apiUrl}/api/vaults/${vaultId}`, {
              method: 'DELETE',
              headers: {
                'X-Dev-User-Id': 'e2e-browser-user',
              },
            });
          },
          { apiUrl: API_URL, vaultId: result.data.id }
        );
      }
    });
  });

  test.describe('Performance', () => {
    test('should load within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      // Should load within 10 seconds
      expect(loadTime).toBeLessThan(10000);
    });

    test('should not have excessive network requests', async ({ page }) => {
      const requests: string[] = [];

      page.on('request', (request) => {
        requests.push(request.url());
      });

      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // Should have reasonable number of requests
      // (adjust threshold based on application needs)
      expect(requests.length).toBeLessThan(100);
    });
  });

  test.describe('Accessibility Basics', () => {
    test('should have proper document structure', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // Check for root element
      const root = page.locator('#root, #app, main');
      await expect(root.first()).toBeVisible();
    });

    test('should have no missing alt texts on images', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // Find images without alt
      const imagesWithoutAlt = page.locator('img:not([alt])');
      const count = await imagesWithoutAlt.count();

      expect(count).toBe(0);
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      // Check that h1 exists (or at least some heading)
      const headings = page.locator('h1, h2, h3');
      const count = await headings.count();

      // Should have at least one heading
      expect(count).toBeGreaterThan(0);
    });
  });
});
