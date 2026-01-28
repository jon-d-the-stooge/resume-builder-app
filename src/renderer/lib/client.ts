/**
 * API Client for Resume Builder Web Application
 *
 * Drop-in replacement for IPC-based communication. Instead of:
 *   ipcRenderer.invoke('vault:getAll')
 * Use:
 *   api.vaults.list()
 *
 * Features:
 * - Automatic JSON parsing
 * - Auth header injection from configured auth provider
 * - Error handling matching IPC error patterns
 * - Full TypeScript types for all endpoints
 */

import type {
  Vault,
  NewVault,
  VaultProfile,
  VaultSection,
  SectionObject,
  VaultItem,
  SectionObjectMetadata,
} from '../../types/vault';
import type { ContentItem, ContentItemInput, SearchQuery } from '../../types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get API base URL from environment or default to relative path.
 * Supports both Vite (import.meta.env) and process.env patterns.
 */
function getApiBaseUrl(): string {
  // Vite environment (bundled web app)
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Node.js/test environment
  if (typeof process !== 'undefined' && process.env?.API_URL) {
    return process.env.API_URL;
  }
  // Default to relative path for same-origin deployment
  return '/api';
}

const API_BASE_URL = getApiBaseUrl();

// ============================================================================
// Types
// ============================================================================

/**
 * Standard API error response matching backend error format
 */
export interface ApiError {
  error: string;
  message: string;
  status?: number;
  recoverable?: boolean;
  suggestedAction?: string;
}

/**
 * Wrapper for API responses that matches IPC success pattern
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Auth token getter function type - allows flexible auth provider integration
 */
export type AuthTokenGetter = () => Promise<string | null>;

/**
 * LLM Provider types
 */
export type LLMProvider = 'anthropic' | 'openai';

/**
 * Settings with masked API keys (as returned by GET /settings)
 */
export interface MaskedSettings {
  llmProvider: LLMProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  defaultModel?: string;
  jsearchApiKey?: string;
  adzunaAppId?: string;
  adzunaApiKey?: string;
  maxIterations?: number;
}

/**
 * Settings update payload
 */
export interface SettingsUpdate {
  llmProvider?: LLMProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  defaultModel?: string;
  jsearchApiKey?: string;
  adzunaAppId?: string;
  adzunaApiKey?: string;
  maxIterations?: number;
}

/**
 * Application status types
 */
export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';

/**
 * Application record
 */
export interface Application {
  id: string;
  userId: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  generatedResume: string;
  score: number;
  sourceUrl?: string;
  status: ApplicationStatus;
  notes?: string;
  metadata: {
    iterations: number;
    initialScore: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Application creation input
 */
export interface ApplicationInput {
  jobTitle: string;
  company: string;
  jobDescription: string;
  generatedResume: string;
  score: number;
  sourceUrl?: string;
  metadata: {
    iterations: number;
    initialScore: number;
  };
}

/**
 * Application statistics
 */
export interface ApplicationStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
}

/**
 * Job queue status types
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Job queue entry
 */
export interface QueueJob {
  id: string;
  company: string;
  title: string;
  sourceUrl?: string;
  status: JobStatus;
  priority: number;
  addedAt: string;
  processedAt?: string;
  retryCount: number;
  error?: string;
  hasResult: boolean;
}

/**
 * Job queue input for creating new jobs
 */
export interface QueueJobInput {
  company: string;
  title: string;
  description: string;
  sourceUrl?: string;
  requirements?: string[];
  responsibilities?: string[];
  preferredQualifications?: string[];
  priority?: number;
}

/**
 * Job optimization result
 */
export interface OptimizationResult {
  finalScore: number;
  previousScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  gaps: string[];
  recommendations: string[];
  optimizedContent: string;
  processedAt: string;
}

/**
 * Queue status summary
 */
export interface QueueStatus {
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
}

/**
 * Knowledge base entry
 */
export interface KnowledgeBaseEntry {
  id: string;
  userId: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  sourceUrl?: string;
  optimizedResume: string;
  analysis: {
    finalScore: number;
    initialScore: number;
    iterations: number;
    strengths: string[];
    gaps: string[];
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      suggestion: string;
    }>;
  };
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Knowledge base entry input
 */
export interface KnowledgeBaseInput {
  jobTitle: string;
  company: string;
  jobDescription: string;
  sourceUrl?: string;
  optimizedResume: string;
  analysis: {
    finalScore: number;
    initialScore: number;
    iterations: number;
    strengths: string[];
    gaps: string[];
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      suggestion: string;
    }>;
  };
  notes?: string;
  tags?: string[];
}

/**
 * Knowledge base filter options
 */
export interface KnowledgeBaseFilters {
  company?: string;
  jobTitle?: string;
  dateStart?: string;
  dateEnd?: string;
  text?: string;
  sortBy?: 'date' | 'score' | 'company';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Knowledge base statistics
 */
export interface KnowledgeBaseStats {
  totalEntries: number;
  averageScore: number;
  companiesCount: number;
  recentEntries: number;
}

/**
 * Content types for content items
 */
export type ContentType =
  | 'job-entry'
  | 'skill'
  | 'accomplishment'
  | 'education'
  | 'certification'
  | 'job-title'
  | 'job-location'
  | 'job-duration';

// ============================================================================
// API Client Class
// ============================================================================

/**
 * API Client for Resume Builder
 *
 * Provides typed methods for all backend endpoints with automatic
 * auth header injection and error handling.
 */
class ApiClient {
  private baseUrl: string;
  private authTokenGetter: AuthTokenGetter | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Configure the auth token getter.
   * Call this after setting up your auth provider.
   *
   * Example with Auth0:
   *   api.setAuthTokenGetter(() => auth0.getAccessTokenSilently())
   */
  setAuthTokenGetter(getter: AuthTokenGetter): void {
    this.authTokenGetter = getter;
  }

  /**
   * Get the current auth token, or null if not configured/available
   */
  private async getAuthToken(): Promise<string | null> {
    if (!this.authTokenGetter) {
      return null;
    }
    try {
      return await this.authTokenGetter();
    } catch {
      return null;
    }
  }

  /**
   * Base fetch wrapper with auth and error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth token if available
    const token = await this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Make request
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle no-content responses (204)
    if (response.status === 204) {
      return undefined as T;
    }

    // Parse response
    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      // For non-JSON responses (like markdown exports)
      data = await response.text();
      if (!response.ok) {
        throw this.createError('Request failed', response.status);
      }
      return data as T;
    }

    // Handle error responses
    if (!response.ok) {
      const error = this.createError(
        data.message || data.error || 'Request failed',
        response.status,
        data.error
      );
      throw error;
    }

    return data;
  }

  /**
   * Create a standardized API error
   */
  private createError(
    message: string,
    status: number,
    errorType?: string
  ): ApiError {
    return {
      error: errorType || 'ApiError',
      message,
      status,
      recoverable: status >= 400 && status < 500,
    };
  }

  // ==========================================================================
  // Vaults API
  // ==========================================================================

  /**
   * Vault operations - maps to /api/vaults endpoints
   *
   * IPC mapping:
   * - vault:getAll → vaults.list()
   * - vault:get → vaults.get(id)
   * - vault:create → vaults.create(data)
   * - vault:update → vaults.update(id, data)
   * - vault:delete → vaults.delete(id)
   */
  vaults = {
    /**
     * List all vaults for the authenticated user
     * IPC equivalent: ipcRenderer.invoke('vault:getAll')
     */
    list: async (): Promise<Vault[]> => {
      return this.request<Vault[]>('/vaults');
    },

    /**
     * Get a single vault by ID
     * IPC equivalent: ipcRenderer.invoke('vault:get', id)
     */
    get: async (id: string): Promise<Vault | null> => {
      try {
        return await this.request<Vault>(`/vaults/${id}`);
      } catch (error) {
        if ((error as ApiError).status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Create a new vault
     * IPC equivalent: ipcRenderer.invoke('vault:create', data)
     */
    create: async (data: NewVault): Promise<Vault> => {
      return this.request<Vault>('/vaults', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * Update a vault's profile
     * IPC equivalent: ipcRenderer.invoke('vault:update', id, data)
     */
    update: async (id: string, profile: Partial<VaultProfile>): Promise<Vault> => {
      return this.request<Vault>(`/vaults/${id}`, {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
    },

    /**
     * Delete a vault
     * IPC equivalent: ipcRenderer.invoke('vault:delete', id)
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>(`/vaults/${id}`, {
        method: 'DELETE',
      });
    },
  };

  // ==========================================================================
  // Content API
  // ==========================================================================

  /**
   * Content operations - maps to /api/content endpoints
   *
   * IPC mapping:
   * - search-content → content.search(query)
   * - get-content-item → content.get(id)
   * - create-manual-content → content.create(data)
   * - update-content-item → content.update(id, data)
   * - delete-content-item → content.delete(id)
   * - clear-vault → content.clearVault()
   */
  content = {
    /**
     * Search content items with optional filters
     * IPC equivalent: ipcRenderer.invoke('search-content', query)
     */
    search: async (query: SearchQuery): Promise<ContentItem[]> => {
      const params = new URLSearchParams();
      if (query.contentType) params.set('contentType', query.contentType);
      if (query.text) params.set('text', query.text);
      if (query.tags?.length) params.set('tags', query.tags.join(','));

      const response = await this.request<{ success: boolean; items: ContentItem[] }>(
        `/content?${params.toString()}`
      );
      return response.items;
    },

    /**
     * Get a single content item by ID
     * IPC equivalent: ipcRenderer.invoke('get-content-item', id)
     */
    get: async (id: string): Promise<ContentItem | null> => {
      try {
        const response = await this.request<{ success: boolean; item: ContentItem }>(
          `/content/${id}`
        );
        return response.item;
      } catch (error) {
        if ((error as ApiError).status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Create a new content item
     * IPC equivalent: ipcRenderer.invoke('create-manual-content', data)
     */
    create: async (data: ContentItemInput): Promise<{ success: boolean; id: string }> => {
      const response = await this.request<{ success: boolean; id: string; item: ContentItem }>(
        '/content',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return { success: response.success, id: response.id };
    },

    /**
     * Update an existing content item
     * IPC equivalent: ipcRenderer.invoke('update-content-item', { id, ...updates })
     */
    update: async (
      id: string,
      updates: Partial<ContentItemInput>
    ): Promise<ContentItem> => {
      const response = await this.request<{ success: boolean; item: ContentItem }>(
        `/content/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }
      );
      return response.item;
    },

    /**
     * Delete a content item
     * IPC equivalent: ipcRenderer.invoke('delete-content-item', id)
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>(`/content/${id}`, {
        method: 'DELETE',
      });
    },

    /**
     * Link two content items (parent-child relationship)
     */
    link: async (parentId: string, childId: string): Promise<void> => {
      await this.request<{ success: boolean }>(
        `/content/${parentId}/link/${childId}`,
        { method: 'POST' }
      );
    },

    /**
     * Link a skill to multiple job entries
     */
    linkSkillToJobs: async (skillId: string, jobIds: string[]): Promise<void> => {
      await this.request<{ success: boolean }>(
        `/content/skills/${skillId}/link-jobs`,
        {
          method: 'POST',
          body: JSON.stringify({ jobIds }),
        }
      );
    },

    /**
     * Clear all vault content (requires confirmation)
     * IPC equivalent: ipcRenderer.invoke('clear-vault', 'delete')
     */
    clearVault: async (): Promise<{ success: boolean; deletedCount: number }> => {
      return this.request<{ success: boolean; deletedCount: number }>(
        '/content/vault',
        {
          method: 'DELETE',
          body: JSON.stringify({ confirmation: 'delete' }),
        }
      );
    },
  };

  // ==========================================================================
  // Settings API
  // ==========================================================================

  /**
   * Settings operations - maps to /api/settings endpoints
   *
   * IPC mapping:
   * - get-settings → settings.get()
   * - save-settings → settings.update(data)
   * - validate-api-key → settings.validateApiKey(provider, key)
   * - check-api-key-configured → settings.checkApiKeyStatus()
   */
  settings = {
    /**
     * Get current settings with masked API keys
     * IPC equivalent: ipcRenderer.invoke('get-settings')
     */
    get: async (): Promise<MaskedSettings> => {
      const response = await this.request<{ success: boolean; settings: MaskedSettings }>(
        '/settings'
      );
      return response.settings;
    },

    /**
     * Update settings
     * IPC equivalent: ipcRenderer.invoke('save-settings', data)
     */
    update: async (data: SettingsUpdate): Promise<{ success: boolean }> => {
      return this.request<{ success: boolean }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    /**
     * Validate an API key
     * IPC equivalent: ipcRenderer.invoke('validate-api-key', { provider, apiKey })
     */
    validateApiKey: async (
      provider: LLMProvider,
      apiKey: string
    ): Promise<{ valid: boolean; error?: string }> => {
      return this.request<{ valid: boolean; error?: string }>(
        '/settings/validate-api-key',
        {
          method: 'POST',
          body: JSON.stringify({ provider, apiKey }),
        }
      );
    },

    /**
     * Check if a valid API key is configured
     * IPC equivalent: ipcRenderer.invoke('check-api-key-configured')
     */
    checkApiKeyStatus: async (): Promise<{ configured: boolean; provider?: LLMProvider }> => {
      return this.request<{ configured: boolean; provider?: LLMProvider }>(
        '/settings/api-key-status'
      );
    },

    /**
     * Get job search credentials status
     */
    getJobSearchCredentials: async (): Promise<{
      adzuna: { configured: boolean };
      jsearch: { configured: boolean };
    }> => {
      const response = await this.request<{
        success: boolean;
        adzuna: { configured: boolean };
        jsearch: { configured: boolean };
      }>('/settings/job-search-credentials');
      return { adzuna: response.adzuna, jsearch: response.jsearch };
    },

    /**
     * Clear all settings (reset to defaults)
     */
    clear: async (): Promise<{ success: boolean }> => {
      return this.request<{ success: boolean }>('/settings', {
        method: 'DELETE',
      });
    },
  };

  // ==========================================================================
  // Jobs (Queue) API
  // ==========================================================================

  /**
   * Job queue operations - maps to /api/jobs endpoints
   *
   * IPC mapping:
   * - job-queue-add → jobs.create(data)
   * - job-queue-list → jobs.list()
   * - job-queue-status → jobs.getStatus()
   * - job-queue-remove → jobs.delete(id)
   * - job-queue-process-all → jobs.optimize(data)
   */
  jobs = {
    /**
     * List all jobs in the queue
     * IPC equivalent: ipcRenderer.invoke('job-queue-list')
     */
    list: async (status?: JobStatus): Promise<{
      jobs: QueueJob[];
      total: number;
      status: QueueStatus;
    }> => {
      const params = status ? `?status=${status}` : '';
      return this.request<{
        jobs: QueueJob[];
        total: number;
        status: QueueStatus;
      }>(`/jobs${params}`);
    },

    /**
     * Get a specific job by ID
     */
    get: async (id: string): Promise<{
      job: QueueJob;
      result: OptimizationResult | null;
    } | null> => {
      try {
        return await this.request<{
          job: QueueJob;
          result: OptimizationResult | null;
        }>(`/jobs/${id}`);
      } catch (error) {
        if ((error as ApiError).status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Create/queue a new job
     * IPC equivalent: ipcRenderer.invoke('job-queue-add', data)
     */
    create: async (data: QueueJobInput): Promise<{ success: boolean; job: QueueJob }> => {
      return this.request<{ success: boolean; job: QueueJob }>('/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete/cancel a job
     * IPC equivalent: ipcRenderer.invoke('job-queue-remove', id)
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>(`/jobs/${id}`, {
        method: 'DELETE',
      });
    },

    /**
     * Start optimization for a job (returns immediately, poll for status)
     * IPC equivalent: ipcRenderer.invoke('optimizer-optimize', data)
     *
     * Can pass either:
     * - jobId: ID of existing queued job to process
     * - Full job data to create and immediately start processing
     */
    optimize: async (
      data: QueueJobInput | { jobId: string }
    ): Promise<{ success: boolean; jobId: string; job: QueueJob }> => {
      return this.request<{ success: boolean; jobId: string; job: QueueJob }>(
        '/jobs/optimize',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    },

    /**
     * Poll for job status (helper for optimize workflow)
     * Returns the job when it's no longer processing
     */
    waitForCompletion: async (
      jobId: string,
      pollInterval: number = 2000,
      maxWait: number = 300000
    ): Promise<{ job: QueueJob; result: OptimizationResult | null }> => {
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const response = await this.jobs.get(jobId);
        if (!response) {
          throw this.createError('Job not found', 404);
        }

        if (response.job.status !== 'pending' && response.job.status !== 'processing') {
          return response;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      throw this.createError('Optimization timed out', 408);
    },

    /**
     * Search for jobs using external job search APIs
     * IPC equivalent: ipcRenderer.invoke('search-jobs', criteria)
     */
    search: async (criteria: {
      query?: string;
      location?: string;
      remote?: boolean;
      employmentTypes?: string[];
      datePosted?: string;
    }): Promise<{
      success: boolean;
      results: Array<{
        id: string;
        title: string;
        company: string;
        location: string;
        sourceUrl: string;
        snippet: string;
        description?: string;
        salary?: string;
        postedDate?: string;
        remote?: boolean;
        relevanceScore: number;
      }>;
      error?: string;
    }> => {
      return this.request('/jobs/search', {
        method: 'POST',
        body: JSON.stringify(criteria)
      });
    },
  };

  // ==========================================================================
  // Applications API
  // ==========================================================================

  /**
   * Application tracking operations - maps to /api/applications endpoints
   *
   * IPC mapping:
   * - applications-list → applications.list()
   * - applications-get → applications.get(id)
   * - applications-save → applications.create(data)
   * - applications-update → applications.update(id, data)
   * - applications-delete → applications.delete(id)
   */
  applications = {
    /**
     * List all applications with optional status filter
     * IPC equivalent: ipcRenderer.invoke('applications-list', status?)
     */
    list: async (status?: ApplicationStatus): Promise<{
      applications: Application[];
      stats: ApplicationStats;
    }> => {
      const params = status ? `?status=${status}` : '';
      const response = await this.request<{
        success: boolean;
        applications: Application[];
        stats: ApplicationStats;
      }>(`/applications${params}`);
      return { applications: response.applications, stats: response.stats };
    },

    /**
     * Get application statistics
     */
    getStats: async (): Promise<ApplicationStats> => {
      const response = await this.request<{ success: boolean; stats: ApplicationStats }>(
        '/applications/stats'
      );
      return response.stats;
    },

    /**
     * Get a single application by ID
     * IPC equivalent: ipcRenderer.invoke('applications-get', id)
     */
    get: async (id: string): Promise<Application | null> => {
      try {
        const response = await this.request<{ success: boolean; application: Application }>(
          `/applications/${id}`
        );
        return response.application;
      } catch (error) {
        if ((error as ApiError).status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Save a new application
     * IPC equivalent: ipcRenderer.invoke('applications-save', data)
     */
    create: async (data: ApplicationInput): Promise<Application> => {
      const response = await this.request<{ success: boolean; application: Application }>(
        '/applications',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return response.application;
    },

    /**
     * Update an existing application
     * IPC equivalent: ipcRenderer.invoke('applications-update', { id, ...updates })
     */
    update: async (
      id: string,
      updates: { status?: ApplicationStatus; notes?: string }
    ): Promise<Application> => {
      const response = await this.request<{ success: boolean; application: Application }>(
        `/applications/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }
      );
      return response.application;
    },

    /**
     * Delete an application
     * IPC equivalent: ipcRenderer.invoke('applications-delete', id)
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>(`/applications/${id}`, {
        method: 'DELETE',
      });
    },
  };

  // ==========================================================================
  // Knowledge Base API
  // ==========================================================================

  /**
   * Knowledge base operations - maps to /api/knowledge-base endpoints
   *
   * IPC mapping:
   * - knowledge-base-list → knowledgeBase.list()
   * - knowledge-base-get → knowledgeBase.get(id)
   * - knowledge-base-save → knowledgeBase.create(data)
   * - knowledge-base-update → knowledgeBase.update(id, data)
   * - knowledge-base-delete → knowledgeBase.delete(id)
   * - knowledge-base-stats → knowledgeBase.getStats()
   * - knowledge-base-companies → knowledgeBase.getCompanies()
   * - knowledge-base-job-titles → knowledgeBase.getJobTitles()
   */
  knowledgeBase = {
    /**
     * List knowledge base entries with optional filters
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-list', filters?)
     */
    list: async (filters?: KnowledgeBaseFilters): Promise<KnowledgeBaseEntry[]> => {
      const params = new URLSearchParams();
      if (filters) {
        if (filters.company) params.set('company', filters.company);
        if (filters.jobTitle) params.set('jobTitle', filters.jobTitle);
        if (filters.dateStart) params.set('dateStart', filters.dateStart);
        if (filters.dateEnd) params.set('dateEnd', filters.dateEnd);
        if (filters.text) params.set('text', filters.text);
        if (filters.sortBy) params.set('sortBy', filters.sortBy);
        if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      }
      const queryString = params.toString();
      const response = await this.request<{ success: boolean; entries: KnowledgeBaseEntry[] }>(
        `/knowledge-base${queryString ? `?${queryString}` : ''}`
      );
      return response.entries;
    },

    /**
     * Get knowledge base statistics
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-stats')
     */
    getStats: async (): Promise<KnowledgeBaseStats> => {
      const response = await this.request<{ success: boolean; stats: KnowledgeBaseStats }>(
        '/knowledge-base/stats'
      );
      return response.stats;
    },

    /**
     * Get list of unique companies
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-companies')
     */
    getCompanies: async (): Promise<string[]> => {
      const response = await this.request<{ success: boolean; companies: string[] }>(
        '/knowledge-base/companies'
      );
      return response.companies;
    },

    /**
     * Get list of unique job titles
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-job-titles')
     */
    getJobTitles: async (): Promise<string[]> => {
      const response = await this.request<{ success: boolean; jobTitles: string[] }>(
        '/knowledge-base/job-titles'
      );
      return response.jobTitles;
    },

    /**
     * Get a single knowledge base entry by ID
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-get', id)
     */
    get: async (id: string): Promise<KnowledgeBaseEntry | null> => {
      try {
        const response = await this.request<{ success: boolean; entry: KnowledgeBaseEntry }>(
          `/knowledge-base/${id}`
        );
        return response.entry;
      } catch (error) {
        if ((error as ApiError).status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Save a new knowledge base entry
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-save', data)
     */
    create: async (data: KnowledgeBaseInput): Promise<KnowledgeBaseEntry> => {
      const response = await this.request<{ success: boolean; entry: KnowledgeBaseEntry }>(
        '/knowledge-base',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return response.entry;
    },

    /**
     * Update an existing knowledge base entry
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-update', { id, ...updates })
     */
    update: async (
      id: string,
      updates: { notes?: string; tags?: string[]; optimizedResume?: string }
    ): Promise<KnowledgeBaseEntry> => {
      const response = await this.request<{ success: boolean; entry: KnowledgeBaseEntry }>(
        `/knowledge-base/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }
      );
      return response.entry;
    },

    /**
     * Delete a knowledge base entry
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-delete', id)
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>(`/knowledge-base/${id}`, {
        method: 'DELETE',
      });
    },

    /**
     * Export a knowledge base entry
     * IPC equivalent: ipcRenderer.invoke('knowledge-base-export', { id, format })
     */
    export: async (id: string, format: 'md' | 'json' = 'md'): Promise<string | KnowledgeBaseEntry> => {
      return this.request<string | KnowledgeBaseEntry>(
        `/knowledge-base/${id}/export?format=${format}`
      );
    },
  };
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default API client instance.
 * Configure auth token getter after initializing your auth provider:
 *
 * ```ts
 * import { api } from './api/client';
 *
 * // After auth is set up:
 * api.setAuthTokenGetter(() => auth0.getAccessTokenSilently());
 * ```
 */
export const api = new ApiClient();

/**
 * Export the class for testing or custom instances
 */
export { ApiClient };

/**
 * Export types for consumers
 */
export type {
  Vault,
  NewVault,
  VaultProfile,
  VaultSection,
  SectionObject,
  VaultItem,
  SectionObjectMetadata,
  ContentItem,
  ContentItemInput,
  SearchQuery,
};
