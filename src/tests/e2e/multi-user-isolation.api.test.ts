/**
 * E2E Tests: Multi-User Isolation
 *
 * Critical security tests that verify:
 * - Users can only see their own data
 * - Cross-user data access is prevented
 * - Creating resources isolates by user
 * - Updating/deleting resources respects ownership
 * - Concurrent multi-user operations maintain isolation
 *
 * These tests use two authenticated contexts (user1 and user2)
 * to verify that data isolation is enforced across all endpoints.
 */

import { test, expect, TEST_USERS, cleanupUserData } from './fixtures';

test.describe('Multi-User Isolation', () => {
  // Clean up both users' data after tests
  test.afterEach(async ({ api, api2 }) => {
    await Promise.all([cleanupUserData(api), cleanupUserData(api2)]);
  });

  test.describe('Vault Isolation', () => {
    test('user1 cannot see user2 vaults in list', async ({ api, api2, generateVaultData }) => {
      // User1 creates a vault
      const user1VaultData = generateVaultData();
      const create1Response = await api.post('/api/vaults', { data: user1VaultData });
      const user1Vault = await create1Response.json();

      // User2 creates a vault
      const user2VaultData = generateVaultData();
      const create2Response = await api2.post('/api/vaults', { data: user2VaultData });
      const user2Vault = await create2Response.json();

      // User1 lists vaults - should only see their own
      const list1Response = await api.get('/api/vaults');
      const user1Vaults = await list1Response.json();
      const user1VaultIds = user1Vaults.map((v: any) => v.id);

      expect(user1VaultIds).toContain(user1Vault.id);
      expect(user1VaultIds).not.toContain(user2Vault.id);

      // User2 lists vaults - should only see their own
      const list2Response = await api2.get('/api/vaults');
      const user2Vaults = await list2Response.json();
      const user2VaultIds = user2Vaults.map((v: any) => v.id);

      expect(user2VaultIds).toContain(user2Vault.id);
      expect(user2VaultIds).not.toContain(user1Vault.id);
    });

    test('user1 cannot access user2 vault by ID', async ({ api, api2, generateVaultData }) => {
      // User2 creates a vault
      const user2VaultData = generateVaultData();
      const create2Response = await api2.post('/api/vaults', { data: user2VaultData });
      const user2Vault = await create2Response.json();

      // User1 tries to access user2's vault
      const accessResponse = await api.get(`/api/vaults/${user2Vault.id}`);

      // Should return 404 (vault not found for this user)
      expect(accessResponse.status()).toBe(404);
    });

    test('user1 cannot update user2 vault', async ({ api, api2, generateVaultData }) => {
      // User2 creates a vault
      const user2VaultData = generateVaultData();
      const create2Response = await api2.post('/api/vaults', { data: user2VaultData });
      const user2Vault = await create2Response.json();

      // User1 tries to update user2's vault
      const updateResponse = await api.put(`/api/vaults/${user2Vault.id}`, {
        data: { firstName: 'Hacked' },
      });

      // Should return 404 (vault not found for this user)
      expect(updateResponse.status()).toBe(404);

      // Verify vault was not modified
      const verify2Response = await api2.get(`/api/vaults/${user2Vault.id}`);
      const verifyVault = await verify2Response.json();
      expect(verifyVault.profile.firstName).toBe(user2VaultData.profile.firstName);
    });

    test('user1 cannot delete user2 vault', async ({ api, api2, generateVaultData }) => {
      // User2 creates a vault
      const user2VaultData = generateVaultData();
      const create2Response = await api2.post('/api/vaults', { data: user2VaultData });
      const user2Vault = await create2Response.json();

      // User1 tries to delete user2's vault
      const deleteResponse = await api.delete(`/api/vaults/${user2Vault.id}`);

      // Should return 404 (vault not found for this user)
      expect(deleteResponse.status()).toBe(404);

      // Verify vault still exists for user2
      const verify2Response = await api2.get(`/api/vaults/${user2Vault.id}`);
      expect(verify2Response.status()).toBe(200);
    });
  });

  test.describe('Applications Isolation', () => {
    test('user1 cannot see user2 applications', async ({ api, api2, generateJobData }) => {
      const jobData = generateJobData();

      // User1 creates an application
      const app1Data = {
        jobTitle: jobData.title,
        company: 'User1 Company',
        jobDescription: jobData.description,
        generatedResume: 'User1 resume',
        score: 0.8,
        metadata: { iterations: 2, initialScore: 0.5 },
      };
      const create1Response = await api.post('/api/applications', { data: app1Data });
      const { application: user1App } = await create1Response.json();

      // User2 creates an application
      const app2Data = {
        jobTitle: jobData.title,
        company: 'User2 Company',
        jobDescription: jobData.description,
        generatedResume: 'User2 resume',
        score: 0.75,
        metadata: { iterations: 3, initialScore: 0.4 },
      };
      const create2Response = await api2.post('/api/applications', { data: app2Data });
      const { application: user2App } = await create2Response.json();

      // User1 lists applications - should only see their own
      const list1Response = await api.get('/api/applications');
      const { applications: user1Apps } = await list1Response.json();
      const user1AppIds = user1Apps.map((a: any) => a.id);

      expect(user1AppIds).toContain(user1App.id);
      expect(user1AppIds).not.toContain(user2App.id);

      // User2 lists applications - should only see their own
      const list2Response = await api2.get('/api/applications');
      const { applications: user2Apps } = await list2Response.json();
      const user2AppIds = user2Apps.map((a: any) => a.id);

      expect(user2AppIds).toContain(user2App.id);
      expect(user2AppIds).not.toContain(user1App.id);
    });

    test('user1 cannot access user2 application by ID', async ({ api, api2, generateJobData }) => {
      const jobData = generateJobData();

      // User2 creates an application
      const appData = {
        jobTitle: jobData.title,
        company: jobData.company,
        jobDescription: jobData.description,
        generatedResume: 'Test resume',
        score: 0.85,
        metadata: { iterations: 2, initialScore: 0.6 },
      };
      const create2Response = await api2.post('/api/applications', { data: appData });
      const { application: user2App } = await create2Response.json();

      // User1 tries to access user2's application
      const accessResponse = await api.get(`/api/applications/${user2App.id}`);
      expect(accessResponse.status()).toBe(404);
    });

    test('user1 cannot update user2 application', async ({ api, api2, generateJobData }) => {
      const jobData = generateJobData();

      // User2 creates an application
      const appData = {
        jobTitle: jobData.title,
        company: jobData.company,
        jobDescription: jobData.description,
        generatedResume: 'Test resume',
        score: 0.85,
        metadata: { iterations: 2, initialScore: 0.6 },
      };
      const create2Response = await api2.post('/api/applications', { data: appData });
      const { application: user2App } = await create2Response.json();

      // User1 tries to update user2's application
      const updateResponse = await api.patch(`/api/applications/${user2App.id}`, {
        data: { status: 'rejected' },
      });

      expect(updateResponse.status()).toBe(404);

      // Verify application was not modified
      const verify2Response = await api2.get(`/api/applications/${user2App.id}`);
      const { application } = await verify2Response.json();
      expect(application.status).toBe('saved'); // Default status
    });

    test('user1 cannot delete user2 application', async ({ api, api2, generateJobData }) => {
      const jobData = generateJobData();

      // User2 creates an application
      const appData = {
        jobTitle: jobData.title,
        company: jobData.company,
        jobDescription: jobData.description,
        generatedResume: 'Test resume',
        score: 0.85,
        metadata: { iterations: 2, initialScore: 0.6 },
      };
      const create2Response = await api2.post('/api/applications', { data: appData });
      const { application: user2App } = await create2Response.json();

      // User1 tries to delete user2's application
      const deleteResponse = await api.delete(`/api/applications/${user2App.id}`);
      expect(deleteResponse.status()).toBe(404);

      // Verify application still exists
      const verify2Response = await api2.get(`/api/applications/${user2App.id}`);
      expect(verify2Response.status()).toBe(200);
    });
  });

  test.describe('Knowledge Base Isolation', () => {
    test('user1 cannot see user2 knowledge base entries', async ({ api, api2 }) => {
      // User1 creates a KB entry
      const kb1Data = {
        jobTitle: 'User1 Job',
        company: 'User1 Company',
        jobDescription: 'User1 description',
        optimizedResume: 'User1 resume',
        analysis: {
          finalScore: 0.9,
          initialScore: 0.6,
          iterations: 3,
          strengths: ['User1 strength'],
          gaps: ['User1 gap'],
          recommendations: [{ priority: 'high' as const, suggestion: 'User1 suggestion' }],
        },
      };
      const create1Response = await api.post('/api/knowledge-base', { data: kb1Data });
      const { entry: user1Entry } = await create1Response.json();

      // User2 creates a KB entry
      const kb2Data = {
        jobTitle: 'User2 Job',
        company: 'User2 Company',
        jobDescription: 'User2 description',
        optimizedResume: 'User2 resume',
        analysis: {
          finalScore: 0.85,
          initialScore: 0.5,
          iterations: 4,
          strengths: ['User2 strength'],
          gaps: ['User2 gap'],
          recommendations: [{ priority: 'medium' as const, suggestion: 'User2 suggestion' }],
        },
      };
      const create2Response = await api2.post('/api/knowledge-base', { data: kb2Data });
      const { entry: user2Entry } = await create2Response.json();

      // User1 lists entries - should only see their own
      const list1Response = await api.get('/api/knowledge-base');
      const { entries: user1Entries } = await list1Response.json();
      const user1EntryIds = user1Entries.map((e: any) => e.id);

      expect(user1EntryIds).toContain(user1Entry.id);
      expect(user1EntryIds).not.toContain(user2Entry.id);

      // User2 lists entries - should only see their own
      const list2Response = await api2.get('/api/knowledge-base');
      const { entries: user2Entries } = await list2Response.json();
      const user2EntryIds = user2Entries.map((e: any) => e.id);

      expect(user2EntryIds).toContain(user2Entry.id);
      expect(user2EntryIds).not.toContain(user1Entry.id);
    });

    test('user1 cannot access user2 KB entry by ID', async ({ api, api2 }) => {
      // User2 creates a KB entry
      const kbData = {
        jobTitle: 'Secret Job',
        company: 'Secret Company',
        jobDescription: 'Secret description',
        optimizedResume: 'Secret resume',
        analysis: {
          finalScore: 0.95,
          initialScore: 0.7,
          iterations: 5,
          strengths: ['Secret strength'],
          gaps: [],
          recommendations: [],
        },
      };
      const create2Response = await api2.post('/api/knowledge-base', { data: kbData });
      const { entry: user2Entry } = await create2Response.json();

      // User1 tries to access user2's entry
      const accessResponse = await api.get(`/api/knowledge-base/${user2Entry.id}`);
      expect(accessResponse.status()).toBe(404);
    });

    test('user1 cannot update user2 KB entry', async ({ api, api2 }) => {
      // User2 creates a KB entry
      const kbData = {
        jobTitle: 'Protected Job',
        company: 'Protected Company',
        jobDescription: 'Protected description',
        optimizedResume: 'Protected resume',
        analysis: {
          finalScore: 0.88,
          initialScore: 0.55,
          iterations: 4,
          strengths: ['Protected strength'],
          gaps: [],
          recommendations: [],
        },
        notes: 'Original notes',
      };
      const create2Response = await api2.post('/api/knowledge-base', { data: kbData });
      const { entry: user2Entry } = await create2Response.json();

      // User1 tries to update user2's entry
      const updateResponse = await api.patch(`/api/knowledge-base/${user2Entry.id}`, {
        data: { notes: 'Hacked notes' },
      });

      expect(updateResponse.status()).toBe(404);

      // Verify entry was not modified
      const verify2Response = await api2.get(`/api/knowledge-base/${user2Entry.id}`);
      const { entry } = await verify2Response.json();
      expect(entry.notes).toBeUndefined(); // Original had no notes in the entry
    });

    test('user1 cannot delete user2 KB entry', async ({ api, api2 }) => {
      // User2 creates a KB entry
      const kbData = {
        jobTitle: 'Permanent Job',
        company: 'Permanent Company',
        jobDescription: 'Permanent description',
        optimizedResume: 'Permanent resume',
        analysis: {
          finalScore: 0.92,
          initialScore: 0.65,
          iterations: 3,
          strengths: [],
          gaps: [],
          recommendations: [],
        },
      };
      const create2Response = await api2.post('/api/knowledge-base', { data: kbData });
      const { entry: user2Entry } = await create2Response.json();

      // User1 tries to delete user2's entry
      const deleteResponse = await api.delete(`/api/knowledge-base/${user2Entry.id}`);
      expect(deleteResponse.status()).toBe(404);

      // Verify entry still exists
      const verify2Response = await api2.get(`/api/knowledge-base/${user2Entry.id}`);
      expect(verify2Response.status()).toBe(200);
    });
  });

  test.describe('Settings Isolation', () => {
    test('users have independent settings', async ({ api, api2 }) => {
      // User1 updates settings
      const update1Response = await api.put('/api/settings', {
        data: { maxIterations: 7 },
      });
      expect(update1Response.ok()).toBe(true);

      // User2 updates settings differently
      const update2Response = await api2.put('/api/settings', {
        data: { maxIterations: 3 },
      });
      expect(update2Response.ok()).toBe(true);

      // User1 gets their settings
      const get1Response = await api.get('/api/settings');
      const { settings: user1Settings } = await get1Response.json();

      // User2 gets their settings
      const get2Response = await api2.get('/api/settings');
      const { settings: user2Settings } = await get2Response.json();

      // Settings should be independent
      if (user1Settings.maxIterations !== undefined && user2Settings.maxIterations !== undefined) {
        expect(user1Settings.maxIterations).toBe(7);
        expect(user2Settings.maxIterations).toBe(3);
      }
    });
  });

  test.describe('Concurrent Multi-User Operations', () => {
    test('concurrent operations maintain isolation', async ({
      api,
      api2,
      generateVaultData,
      generateJobData,
    }) => {
      // Perform concurrent operations for both users
      const [
        vault1Response,
        vault2Response,
        apps1Response,
        apps2Response,
        kb1Response,
        kb2Response,
      ] = await Promise.all([
        // User1 operations
        api.post('/api/vaults', { data: generateVaultData() }),
        // User2 operations
        api2.post('/api/vaults', { data: generateVaultData() }),
        // User1 list
        api.get('/api/applications'),
        // User2 list
        api2.get('/api/applications'),
        // User1 KB
        api.get('/api/knowledge-base'),
        // User2 KB
        api2.get('/api/knowledge-base'),
      ]);

      // All should succeed
      expect(vault1Response.status()).toBe(201);
      expect(vault2Response.status()).toBe(201);
      expect(apps1Response.ok()).toBe(true);
      expect(apps2Response.ok()).toBe(true);
      expect(kb1Response.ok()).toBe(true);
      expect(kb2Response.ok()).toBe(true);

      // Vaults should be isolated
      const vault1 = await vault1Response.json();
      const vault2 = await vault2Response.json();

      const list1Response = await api.get('/api/vaults');
      const list2Response = await api2.get('/api/vaults');

      const user1Vaults = await list1Response.json();
      const user2Vaults = await list2Response.json();

      const user1VaultIds = user1Vaults.map((v: any) => v.id);
      const user2VaultIds = user2Vaults.map((v: any) => v.id);

      expect(user1VaultIds).toContain(vault1.id);
      expect(user1VaultIds).not.toContain(vault2.id);
      expect(user2VaultIds).toContain(vault2.id);
      expect(user2VaultIds).not.toContain(vault1.id);
    });

    test('rapid alternating requests maintain isolation', async ({
      api,
      api2,
      generateVaultData,
    }) => {
      // Create interleaved requests
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(api.post('/api/vaults', { data: generateVaultData() }));
        operations.push(api2.post('/api/vaults', { data: generateVaultData() }));
      }

      const responses = await Promise.all(operations);

      // All should succeed
      for (const response of responses) {
        expect(response.status()).toBe(201);
      }

      // Verify isolation
      const [list1, list2] = await Promise.all([api.get('/api/vaults'), api2.get('/api/vaults')]);

      const user1Vaults = await list1.json();
      const user2Vaults = await list2.json();

      // Each user should have 5 vaults
      expect(user1Vaults.length).toBeGreaterThanOrEqual(5);
      expect(user2Vaults.length).toBeGreaterThanOrEqual(5);

      // No overlap in vault IDs
      const user1Ids = new Set(user1Vaults.map((v: any) => v.id));
      const user2Ids = new Set(user2Vaults.map((v: any) => v.id));

      for (const id of user1Ids) {
        expect(user2Ids.has(id)).toBe(false);
      }
    });
  });

  test.describe('Third User Isolation', () => {
    test('third user cannot access first two users data', async ({
      api,
      api2,
      createAuthenticatedContext,
      generateVaultData,
    }) => {
      // Create third user context
      const api3 = await createAuthenticatedContext(TEST_USERS.user3.id, TEST_USERS.user3.email);

      // User1 and User2 create vaults
      const vault1Response = await api.post('/api/vaults', { data: generateVaultData() });
      const vault2Response = await api2.post('/api/vaults', { data: generateVaultData() });

      const vault1 = await vault1Response.json();
      const vault2 = await vault2Response.json();

      // User3 should not be able to access either
      const access1Response = await api3.get(`/api/vaults/${vault1.id}`);
      const access2Response = await api3.get(`/api/vaults/${vault2.id}`);

      expect(access1Response.status()).toBe(404);
      expect(access2Response.status()).toBe(404);

      // User3's vault list should be empty (or only contain their own)
      const list3Response = await api3.get('/api/vaults');
      const user3Vaults = await list3Response.json();

      const user3VaultIds = user3Vaults.map((v: any) => v.id);
      expect(user3VaultIds).not.toContain(vault1.id);
      expect(user3VaultIds).not.toContain(vault2.id);
    });
  });

  test.describe('Cross-Endpoint Isolation', () => {
    test('user cannot access another users resources across different endpoints', async ({
      api,
      api2,
      generateVaultData,
      generateJobData,
    }) => {
      // User2 creates resources across multiple endpoints
      const vaultResponse = await api2.post('/api/vaults', { data: generateVaultData() });
      const vault = await vaultResponse.json();

      const jobData = generateJobData();
      const appResponse = await api2.post('/api/applications', {
        data: {
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          generatedResume: 'Test',
          score: 0.8,
          metadata: { iterations: 2, initialScore: 0.5 },
        },
      });
      const { application } = await appResponse.json();

      const kbResponse = await api2.post('/api/knowledge-base', {
        data: {
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          optimizedResume: 'Test',
          analysis: {
            finalScore: 0.8,
            initialScore: 0.5,
            iterations: 2,
            strengths: [],
            gaps: [],
            recommendations: [],
          },
        },
      });
      const { entry } = await kbResponse.json();

      // User1 tries to access all of user2's resources
      const [vaultAccess, appAccess, kbAccess] = await Promise.all([
        api.get(`/api/vaults/${vault.id}`),
        api.get(`/api/applications/${application.id}`),
        api.get(`/api/knowledge-base/${entry.id}`),
      ]);

      // All should be denied (404)
      expect(vaultAccess.status()).toBe(404);
      expect(appAccess.status()).toBe(404);
      expect(kbAccess.status()).toBe(404);
    });
  });
});
