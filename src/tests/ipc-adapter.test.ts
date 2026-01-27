/**
 * IPC Adapter Tests
 *
 * Verifies that the ipcAdapter routes channels to the correct API client methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcRenderer } from '../renderer/api/ipcAdapter';
import { api } from '../renderer/api/client';

// Mock the API client
vi.mock('../renderer/api/client', () => ({
  api: {
    vaults: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    content: {
      search: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      clearVault: vi.fn(),
    },
    settings: {
      get: vi.fn(),
      update: vi.fn(),
      validateApiKey: vi.fn(),
      checkApiKeyStatus: vi.fn(),
    },
    applications: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    knowledgeBase: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getStats: vi.fn(),
      getCompanies: vi.fn(),
      getJobTitles: vi.fn(),
      export: vi.fn(),
    },
    jobs: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      optimize: vi.fn(),
      waitForCompletion: vi.fn(),
    },
  },
}));

describe('IPC Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Vault channels', () => {
    it('vault:getAll → api.vaults.list()', async () => {
      const mockVaults = [{ id: '1', name: 'Test Vault' }];
      vi.mocked(api.vaults.list).mockResolvedValue(mockVaults as any);

      const result = await ipcRenderer.invoke('vault:getAll');

      expect(api.vaults.list).toHaveBeenCalled();
      expect(result).toEqual(mockVaults);
    });

    it('vault:get → api.vaults.get(id)', async () => {
      const mockVault = { id: '123', name: 'My Vault' };
      vi.mocked(api.vaults.get).mockResolvedValue(mockVault as any);

      const result = await ipcRenderer.invoke('vault:get', '123');

      expect(api.vaults.get).toHaveBeenCalledWith('123');
      expect(result).toEqual(mockVault);
    });

    it('vault:create → api.vaults.create(data)', async () => {
      const newVault = { name: 'New Vault' };
      const createdVault = { id: '456', ...newVault };
      vi.mocked(api.vaults.create).mockResolvedValue(createdVault as any);

      const result = await ipcRenderer.invoke('vault:create', newVault);

      expect(api.vaults.create).toHaveBeenCalledWith(newVault);
      expect(result).toEqual(createdVault);
    });

    it('vault:update → api.vaults.update(id, data)', async () => {
      const updates = { name: 'Updated Vault' };
      const updatedVault = { id: '123', ...updates };
      vi.mocked(api.vaults.update).mockResolvedValue(updatedVault as any);

      const result = await ipcRenderer.invoke('vault:update', '123', updates);

      expect(api.vaults.update).toHaveBeenCalledWith('123', updates);
      expect(result).toEqual(updatedVault);
    });

    it('vault:delete → api.vaults.delete(id)', async () => {
      vi.mocked(api.vaults.delete).mockResolvedValue(undefined);

      const result = await ipcRenderer.invoke('vault:delete', '123');

      expect(api.vaults.delete).toHaveBeenCalledWith('123');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Content channels', () => {
    it('search-content → api.content.search(query)', async () => {
      const mockItems = [{ id: '1', type: 'skill', content: 'TypeScript' }];
      vi.mocked(api.content.search).mockResolvedValue(mockItems as any);

      const query = { contentType: 'skill' };
      const result = await ipcRenderer.invoke('search-content', query);

      expect(api.content.search).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockItems);
    });

    it('create-manual-content → api.content.create(data)', async () => {
      const mockResponse = { success: true, id: 'new-id' };
      vi.mocked(api.content.create).mockResolvedValue(mockResponse);

      const data = { type: 'skill', content: 'React' };
      const result = await ipcRenderer.invoke('create-manual-content', data);

      expect(api.content.create).toHaveBeenCalledWith(data);
      expect(result).toEqual(mockResponse);
    });

    it('delete-content-item → api.content.delete(id)', async () => {
      vi.mocked(api.content.delete).mockResolvedValue(undefined);

      const result = await ipcRenderer.invoke('delete-content-item', 'item-123');

      expect(api.content.delete).toHaveBeenCalledWith('item-123');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Settings channels', () => {
    it('get-settings → api.settings.get()', async () => {
      const mockSettings = { llmProvider: 'anthropic', hasAnthropicKey: true };
      vi.mocked(api.settings.get).mockResolvedValue(mockSettings as any);

      const result = await ipcRenderer.invoke('get-settings');

      expect(api.settings.get).toHaveBeenCalled();
      expect(result).toEqual(mockSettings);
    });

    it('save-settings → api.settings.update(data)', async () => {
      vi.mocked(api.settings.update).mockResolvedValue({ success: true });

      const settings = { llmProvider: 'openai' as const };
      const result = await ipcRenderer.invoke('save-settings', settings);

      expect(api.settings.update).toHaveBeenCalledWith(settings);
      expect(result).toEqual({ success: true });
    });

    it('validate-api-key → api.settings.validateApiKey()', async () => {
      vi.mocked(api.settings.validateApiKey).mockResolvedValue({ valid: true });

      const result = await ipcRenderer.invoke('validate-api-key', {
        provider: 'anthropic',
        apiKey: 'sk-test',
      });

      expect(api.settings.validateApiKey).toHaveBeenCalledWith('anthropic', 'sk-test');
      expect(result).toEqual({ valid: true });
    });
  });

  describe('Applications channels', () => {
    it('applications-list → api.applications.list()', async () => {
      const mockResponse = {
        applications: [{ id: '1', jobTitle: 'Engineer' }],
        stats: { total: 1, byStatus: {} },
      };
      vi.mocked(api.applications.list).mockResolvedValue(mockResponse as any);

      const result = await ipcRenderer.invoke('applications-list');

      expect(api.applications.list).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        applications: mockResponse.applications,
        stats: mockResponse.stats,
      });
    });

    it('applications-save → api.applications.create()', async () => {
      const mockApp = { id: 'new-app', jobTitle: 'Developer' };
      vi.mocked(api.applications.create).mockResolvedValue(mockApp as any);

      const data = { jobTitle: 'Developer', company: 'Acme' };
      const result = await ipcRenderer.invoke('applications-save', data);

      expect(api.applications.create).toHaveBeenCalledWith(data);
      expect(result).toEqual({ success: true, application: mockApp });
    });
  });

  describe('Job Queue channels', () => {
    it('job-queue-add → api.jobs.create()', async () => {
      const mockJob = { id: 'job-1', company: 'Acme', status: 'pending' };
      vi.mocked(api.jobs.create).mockResolvedValue({ success: true, job: mockJob } as any);

      const jobData = { company: 'Acme', title: 'Engineer', description: 'Build stuff' };
      const result = await ipcRenderer.invoke('job-queue-add', jobData);

      expect(api.jobs.create).toHaveBeenCalledWith(jobData);
      expect(result).toEqual({ success: true, job: mockJob });
    });

    it('job-queue-list → api.jobs.list()', async () => {
      const mockJobs = [{ id: '1', company: 'Acme' }];
      vi.mocked(api.jobs.list).mockResolvedValue({
        jobs: mockJobs,
        total: 1,
        status: { pendingCount: 1 },
      } as any);

      const result = await ipcRenderer.invoke('job-queue-list');

      expect(api.jobs.list).toHaveBeenCalled();
      expect(result).toEqual(mockJobs);
    });
  });

  describe('Knowledge Base channels', () => {
    it('knowledge-base-stats → api.knowledgeBase.getStats()', async () => {
      const mockStats = { totalEntries: 10, averageScore: 85 };
      vi.mocked(api.knowledgeBase.getStats).mockResolvedValue(mockStats as any);

      const result = await ipcRenderer.invoke('knowledge-base-stats');

      expect(api.knowledgeBase.getStats).toHaveBeenCalled();
      expect(result).toEqual({ success: true, stats: mockStats });
    });
  });

  describe('Unknown channels', () => {
    it('throws error for unknown channel', async () => {
      await expect(ipcRenderer.invoke('unknown-channel')).rejects.toThrow(
        'Unknown IPC channel: unknown-channel'
      );
    });
  });

  describe('Event listeners', () => {
    it('on() registers listener', () => {
      const listener = vi.fn();
      ipcRenderer.on('test-event', listener);
      ipcRenderer.emit('test-event', 'arg1', 'arg2');

      expect(listener).toHaveBeenCalledWith({}, 'arg1', 'arg2');
    });

    it('once() listener is called only once', () => {
      const listener = vi.fn();
      ipcRenderer.once('one-time', listener);
      ipcRenderer.emit('one-time', 'data');
      ipcRenderer.emit('one-time', 'data');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('removeListener() removes specific listener', () => {
      const listener = vi.fn();
      ipcRenderer.on('removable', listener);
      ipcRenderer.removeListener('removable', listener);
      ipcRenderer.emit('removable', 'data');

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
