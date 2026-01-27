/**
 * API Client Tests
 *
 * Verifies the API client produces the same data structure as IPC version.
 * Run with: npx vitest run src/renderer/api/client.test.ts
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ApiClient, api } from '../renderer/api/client';

// Mock fetch for unit tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ApiClient', () => {
  beforeAll(() => {
    mockFetch.mockReset();
  });

  describe('Configuration', () => {
    it('should use default /api base URL', () => {
      const client = new ApiClient();
      expect(client).toBeDefined();
    });

    it('should accept custom base URL', () => {
      const client = new ApiClient('http://localhost:3001/api');
      expect(client).toBeDefined();
    });

    it('should allow setting auth token getter', () => {
      const client = new ApiClient();
      const getter = async () => 'test-token';
      client.setAuthTokenGetter(getter);
      expect(client).toBeDefined();
    });
  });

  describe('vaults.list()', () => {
    it('should return array of vaults matching IPC structure', async () => {
      const mockVaults = [
        {
          id: 'vault-1',
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
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockVaults,
      });

      const vaults = await api.vaults.list();

      expect(vaults).toEqual(mockVaults);
      expect(Array.isArray(vaults)).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vaults',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('vaults.get()', () => {
    it('should return vault by ID', async () => {
      const mockVault = {
        id: 'vault-1',
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
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockVault,
      });

      const vault = await api.vaults.get('vault-1');

      expect(vault).toEqual(mockVault);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vaults/vault-1',
        expect.any(Object)
      );
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Not found', message: 'Vault not found' }),
      });

      const vault = await api.vaults.get('nonexistent');

      expect(vault).toBeNull();
    });
  });

  describe('vaults.create()', () => {
    it('should create vault and return it', async () => {
      const newVault = {
        profile: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          phone: null,
          location: null,
          links: [],
          headline: null,
        },
      };

      const createdVault = {
        id: 'vault-2',
        version: 1,
        ...newVault,
        sections: [],
        metadata: {
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => createdVault,
      });

      const vault = await api.vaults.create(newVault);

      expect(vault.id).toBe('vault-2');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vaults',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newVault),
        })
      );
    });
  });

  describe('vaults.delete()', () => {
    it('should delete vault without returning data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      await api.vaults.delete('vault-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vaults/vault-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('content.search()', () => {
    it('should search content with query params', async () => {
      const mockItems = [
        {
          id: 'item-1',
          type: 'skill',
          content: 'TypeScript',
          tags: ['programming'],
          metadata: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, items: mockItems }),
      });

      const items = await api.content.search({ contentType: 'skill' as any });

      expect(items).toEqual(mockItems);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/content?contentType=skill',
        expect.any(Object)
      );
    });
  });

  describe('settings.get()', () => {
    it('should return masked settings', async () => {
      const mockSettings = {
        llmProvider: 'anthropic',
        anthropicApiKey: '••••',
        openaiApiKey: '',
        hasAnthropicKey: true,
        hasOpenaiKey: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, settings: mockSettings }),
      });

      const settings = await api.settings.get();

      expect(settings.hasAnthropicKey).toBe(true);
      expect(settings.anthropicApiKey).toBe('••••');
    });
  });

  describe('Auth header injection', () => {
    it('should include Authorization header when token getter is set', async () => {
      const client = new ApiClient('/api');
      client.setAuthTokenGetter(async () => 'test-bearer-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await client.vaults.list();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vaults',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-bearer-token',
          }),
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw ApiError for non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Internal Server Error',
          message: 'Something went wrong',
        }),
      });

      await expect(api.vaults.list()).rejects.toMatchObject({
        error: 'Internal Server Error',
        message: 'Something went wrong',
        status: 500,
      });
    });
  });
});

describe('IPC to API mapping verification', () => {
  it('maps vault:getAll to vaults.list()', () => {
    expect(typeof api.vaults.list).toBe('function');
  });

  it('maps vault:get to vaults.get(id)', () => {
    expect(typeof api.vaults.get).toBe('function');
  });

  it('maps vault:create to vaults.create(data)', () => {
    expect(typeof api.vaults.create).toBe('function');
  });

  it('maps vault:update to vaults.update(id, data)', () => {
    expect(typeof api.vaults.update).toBe('function');
  });

  it('maps vault:delete to vaults.delete(id)', () => {
    expect(typeof api.vaults.delete).toBe('function');
  });

  it('maps search-content to content.search(query)', () => {
    expect(typeof api.content.search).toBe('function');
  });

  it('maps get-content-item to content.get(id)', () => {
    expect(typeof api.content.get).toBe('function');
  });

  it('maps create-manual-content to content.create(data)', () => {
    expect(typeof api.content.create).toBe('function');
  });

  it('maps update-content-item to content.update(id, data)', () => {
    expect(typeof api.content.update).toBe('function');
  });

  it('maps delete-content-item to content.delete(id)', () => {
    expect(typeof api.content.delete).toBe('function');
  });

  it('maps get-settings to settings.get()', () => {
    expect(typeof api.settings.get).toBe('function');
  });

  it('maps save-settings to settings.update(data)', () => {
    expect(typeof api.settings.update).toBe('function');
  });

  it('maps job-queue-list to jobs.list()', () => {
    expect(typeof api.jobs.list).toBe('function');
  });

  it('maps applications-list to applications.list()', () => {
    expect(typeof api.applications.list).toBe('function');
  });

  it('maps knowledge-base-list to knowledgeBase.list()', () => {
    expect(typeof api.knowledgeBase.list).toBe('function');
  });
});
