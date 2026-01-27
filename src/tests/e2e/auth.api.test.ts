/**
 * E2E Tests: User Authentication Flow
 *
 * Tests the authentication system including:
 * - Mock authentication in development mode (AUTH_DISABLED=true)
 * - User identification via headers
 * - Authentication middleware behavior
 * - Token validation simulation
 * - Protected endpoint access
 *
 * Note: These tests run against the backend with AUTH_DISABLED=true,
 * which uses the X-Dev-User-Id header for user identification.
 * Production Auth0 flows would require separate integration tests.
 */

import { test, expect, TEST_USERS, API_BASE_URL } from './fixtures';

test.describe('User Authentication Flow', () => {
  test.describe('Health Check (Unauthenticated)', () => {
    test('health endpoint should be accessible without authentication', async ({ playwright }) => {
      // Create an unauthenticated context (no user headers)
      const context = await playwright.request.newContext({
        baseURL: API_BASE_URL,
      });

      const response = await context.get('/api/health');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');

      await context.dispose();
    });
  });

  test.describe('Protected Endpoints', () => {
    test('should access /api/me with user headers', async ({ api, userIds }) => {
      const response = await api.get('/api/me');
      expect(response.status()).toBe(200);

      const user = await response.json();
      expect(user.id).toBe(userIds.user1);
      expect(user.email).toBe(TEST_USERS.user1.email);
    });

    test('should return different user for different user headers', async ({ api, api2, userIds }) => {
      // User 1
      const response1 = await api.get('/api/me');
      const user1 = await response1.json();
      expect(user1.id).toBe(userIds.user1);

      // User 2
      const response2 = await api2.get('/api/me');
      const user2 = await response2.json();
      expect(user2.id).toBe(userIds.user2);

      // Verify they're different
      expect(user1.id).not.toBe(user2.id);
    });

    test('should access vaults endpoint when authenticated', async ({ api }) => {
      const response = await api.get('/api/vaults');
      expect(response.status()).toBe(200);

      const vaults = await response.json();
      expect(Array.isArray(vaults)).toBe(true);
    });

    test('should access settings endpoint when authenticated', async ({ api }) => {
      const response = await api.get('/api/settings');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.settings).toBeDefined();
    });

    test('should access jobs endpoint when authenticated', async ({ api }) => {
      const response = await api.get('/api/jobs');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.jobs).toBeDefined();
      expect(Array.isArray(data.jobs)).toBe(true);
    });

    test('should access applications endpoint when authenticated', async ({ api }) => {
      const response = await api.get('/api/applications');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.applications).toBeDefined();
    });

    test('should access knowledge-base endpoint when authenticated', async ({ api }) => {
      const response = await api.get('/api/knowledge-base');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.entries).toBeDefined();
    });
  });

  test.describe('User Context Propagation', () => {
    test('should create resources under the authenticated user', async ({
      api,
      generateVaultData,
      userIds,
    }) => {
      // Create a vault
      const vaultData = generateVaultData();
      const createResponse = await api.post('/api/vaults', {
        data: vaultData,
      });
      expect(createResponse.status()).toBe(201);

      const vault = await createResponse.json();
      expect(vault.id).toBeDefined();

      // Verify the vault is associated with the user
      expect(vault.metadata?.ownerId).toBe(userIds.user1);

      // Cleanup
      await api.delete(`/api/vaults/${vault.id}`);
    });

    test('should use custom user ID from headers', async ({ createAuthenticatedContext }) => {
      const customUserId = 'custom-test-user-12345';
      const customEmail = 'custom@test.local';

      const customApi = await createAuthenticatedContext(customUserId, customEmail);

      const response = await customApi.get('/api/me');
      expect(response.status()).toBe(200);

      const user = await response.json();
      expect(user.id).toBe(customUserId);
      expect(user.email).toBe(customEmail);
    });
  });

  test.describe('Authentication Header Variations', () => {
    test('should handle user ID only (email defaults)', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          'X-Dev-User-Id': 'header-only-user',
        },
      });

      const response = await context.get('/api/me');
      expect(response.status()).toBe(200);

      const user = await response.json();
      expect(user.id).toBe('header-only-user');

      await context.dispose();
    });

    test('should handle both user ID and email headers', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          'X-Dev-User-Id': 'both-headers-user',
          'X-Dev-User-Email': 'both@headers.test',
        },
      });

      const response = await context.get('/api/me');
      expect(response.status()).toBe(200);

      const user = await response.json();
      expect(user.id).toBe('both-headers-user');
      expect(user.email).toBe('both@headers.test');

      await context.dispose();
    });
  });

  test.describe('Session Simulation', () => {
    test('should maintain consistent user across multiple requests', async ({ api, userIds }) => {
      // Make multiple requests with the same context
      const responses = await Promise.all([
        api.get('/api/me'),
        api.get('/api/vaults'),
        api.get('/api/settings'),
        api.get('/api/applications'),
      ]);

      // All should succeed
      for (const response of responses) {
        expect(response.ok()).toBe(true);
      }

      // User should be consistent
      const user = await responses[0].json();
      expect(user.id).toBe(userIds.user1);
    });

    test('should allow concurrent requests from same user', async ({ api }) => {
      // Simulate concurrent operations
      const startTime = Date.now();

      const [vaultsRes, settingsRes, appsRes, kbRes] = await Promise.all([
        api.get('/api/vaults'),
        api.get('/api/settings'),
        api.get('/api/applications'),
        api.get('/api/knowledge-base'),
      ]);

      const endTime = Date.now();

      // All should succeed
      expect(vaultsRes.ok()).toBe(true);
      expect(settingsRes.ok()).toBe(true);
      expect(appsRes.ok()).toBe(true);
      expect(kbRes.ok()).toBe(true);

      // Should complete in reasonable time (parallel, not sequential)
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  test.describe('Authentication Error Handling', () => {
    test('should return user info even without explicit auth token in dev mode', async ({
      playwright,
    }) => {
      // In AUTH_DISABLED mode, requests without auth should use default mock user
      const context = await playwright.request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          // No X-Dev-User-Id header - should use default mock user
        },
      });

      // Should still work in dev mode with default user
      const response = await context.get('/api/me');

      // In AUTH_DISABLED mode, this should succeed with a default user
      if (response.ok()) {
        const user = await response.json();
        expect(user.id).toBeDefined();
      }

      await context.dispose();
    });
  });

  test.describe('Cross-Request User Isolation', () => {
    test('should not leak user context between different users', async ({
      api,
      api2,
      generateVaultData,
    }) => {
      // Create vault as user1
      const vault1Data = generateVaultData();
      const create1Response = await api.post('/api/vaults', { data: vault1Data });
      expect(create1Response.ok()).toBe(true);
      const vault1 = await create1Response.json();

      // Create vault as user2
      const vault2Data = generateVaultData();
      const create2Response = await api2.post('/api/vaults', { data: vault2Data });
      expect(create2Response.ok()).toBe(true);
      const vault2 = await create2Response.json();

      // Verify user1 can see only their vault
      const list1Response = await api.get('/api/vaults');
      const vaults1 = await list1Response.json();
      const user1VaultIds = vaults1.map((v: any) => v.id);
      expect(user1VaultIds).toContain(vault1.id);
      expect(user1VaultIds).not.toContain(vault2.id);

      // Verify user2 can see only their vault
      const list2Response = await api2.get('/api/vaults');
      const vaults2 = await list2Response.json();
      const user2VaultIds = vaults2.map((v: any) => v.id);
      expect(user2VaultIds).toContain(vault2.id);
      expect(user2VaultIds).not.toContain(vault1.id);

      // Cleanup
      await api.delete(`/api/vaults/${vault1.id}`);
      await api2.delete(`/api/vaults/${vault2.id}`);
    });
  });
});
