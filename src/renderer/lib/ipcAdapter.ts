/**
 * IPC Adapter - Bridges Electron IPC interface to Web API client
 *
 * This adapter allows existing code that uses:
 *   import { ipcRenderer } from 'electron';
 *   ipcRenderer.invoke('channel', ...args)
 *
 * To be seamlessly replaced with:
 *   import { ipcRenderer } from '../api/ipcAdapter';
 *   ipcRenderer.invoke('channel', ...args)
 *
 * The invoke() method routes to the appropriate API client method,
 * maintaining backward compatibility during the Electron→Web migration.
 */

import { api } from './client';
import { ContentType } from '../../shared/obsidian/types';
import type {
  ContentItemInput,
  SearchQuery,
  SettingsUpdate,
  LLMProvider,
  ApplicationStatus,
  ApplicationInput,
  QueueJobInput,
  KnowledgeBaseFilters,
  KnowledgeBaseInput,
} from './client';
import type { ParsedResume } from '../../types';

// ============================================================================
// Types
// ============================================================================

/**
 * All supported IPC channels from docs/ipc-handlers.md
 * Plus vault:* channels from API client mapping
 */
export type IpcChannel =
  // Vault Operations (mapped from API client)
  | 'vault:getAll'
  | 'vault:get'
  | 'vault:create'
  | 'vault:update'
  | 'vault:delete'
  // File Validation & Resume Processing
  | 'validate-file'
  | 'process-resume'
  | 'get-parsed-data'
  | 'save-parsed-content'
  // Content Management
  | 'create-manual-content'
  | 'search-content'
  | 'get-content-item'
  | 'update-content-item'
  | 'delete-content-item'
  | 'clear-vault'
  // Vault Path (Electron-specific)
  | 'select-vault-path'
  | 'get-vault-path'
  | 'select-resume-file'
  // Settings
  | 'get-settings'
  | 'save-settings'
  | 'validate-api-key'
  | 'check-api-key-configured'
  // Job Queue
  | 'job-queue-add'
  | 'job-queue-status'
  | 'job-queue-list'
  | 'job-queue-remove'
  | 'job-queue-clear-finished'
  | 'job-queue-process-next'
  | 'job-queue-process-all'
  | 'job-queue-get-result'
  // CSV Import
  | 'import-csv-select'
  | 'import-csv-validate'
  | 'import-csv-import'
  | 'import-csv-template'
  // Opus Agent
  | 'agent-chat'
  | 'agent-get-preferences'
  | 'agent-learn-preference'
  | 'agent-infer-skill'
  | 'agent-get-context'
  | 'agent-search-companies'
  // Job Search
  | 'search-jobs'
  | 'extract-job-from-url'
  | 'search-agent-config'
  // ATS Optimizer
  | 'optimizer-get-resume-preview'
  | 'optimizer-optimize'
  | 'optimizer-extract-file'
  | 'optimizer-export'
  | 'optimizer-export-pdf'
  | 'optimizer-export-word'
  | 'get-optimization-result'
  | 'optimizer-save-to-vault'
  // App State
  | 'app-state-start-workflow'
  | 'app-state-update-workflow'
  | 'app-state-get-workflow'
  | 'app-state-clear-workflow'
  | 'app-state-save-page'
  | 'app-state-get-page'
  | 'app-state-get-continue-info'
  // Applications
  | 'applications-list'
  | 'applications-get'
  | 'applications-save'
  | 'applications-update'
  | 'applications-delete'
  // Knowledge Base
  | 'knowledge-base-list'
  | 'knowledge-base-get'
  | 'knowledge-base-save'
  | 'knowledge-base-update'
  | 'knowledge-base-delete'
  | 'knowledge-base-stats'
  | 'knowledge-base-companies'
  | 'knowledge-base-job-titles'
  | 'knowledge-base-export';

/**
 * Handler function type for IPC channels
 */
type IpcHandler = (...args: unknown[]) => Promise<unknown>;

// ============================================================================
// Electron Detection (use real ipcRenderer when available)
// ============================================================================

type AnyIpcRenderer = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  send: (channel: string, ...args: unknown[]) => void;
  sendSync: (channel: string, ...args: unknown[]) => unknown;
  on: (channel: string, listener: (...args: unknown[]) => void) => unknown;
  once: (channel: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener: (channel: string, listener: (...args: unknown[]) => void) => unknown;
  removeAllListeners: (channel?: string) => unknown;
};

function getElectronIpcRenderer(): AnyIpcRenderer | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    process?: { versions?: { electron?: string } };
    require?: (mod: string) => unknown;
    ipcRenderer?: AnyIpcRenderer;
  };
  if (w.ipcRenderer?.invoke) {
    return w.ipcRenderer;
  }

  if (typeof w.require === 'function') {
    try {
      const electron = w.require('electron') as { ipcRenderer?: AnyIpcRenderer };
      if (electron?.ipcRenderer?.invoke) {
        return electron.ipcRenderer;
      }
    } catch {
      // Swallow if require('electron') is unavailable in web mode.
    }
  }

  // Fallback check for Electron-specific process flag (some bundlers strip require)
  const isElectron = !!w?.process?.versions?.electron;
  if (!isElectron) return null;

  return null;
}

/**
 * Registry of channel handlers
 */
type HandlerRegistry = Record<IpcChannel, IpcHandler>;

// ============================================================================
// Not Implemented Helper
// ============================================================================

/**
 * Creates a handler that throws a "not implemented" error for Electron-only features
 */
function notImplemented(channel: string, reason: string): IpcHandler {
  return async () => {
    console.warn(`IPC channel "${channel}" is not available in web mode: ${reason}`);
    return {
      success: false,
      error: `Channel "${channel}" requires Electron. ${reason}`,
    };
  };
}

/**
 * Creates a handler that needs a web-specific implementation
 */
function webAlternative(channel: string, alternative: string): IpcHandler {
  return async () => {
    console.warn(`IPC channel "${channel}" has a web alternative: ${alternative}`);
    return {
      success: false,
      error: `Use ${alternative} instead of IPC channel "${channel}" in web mode.`,
    };
  };
}

// ============================================================================
// Channel Handlers
// ============================================================================

const handlers: HandlerRegistry = {
  // --------------------------------------------------------------------------
  // Vault Operations
  // --------------------------------------------------------------------------

  'vault:getAll': async () => {
    return api.vaults.list();
  },

  'vault:get': async (id: unknown) => {
    return api.vaults.get(id as string);
  },

  'vault:create': async (data: unknown) => {
    return api.vaults.create(data as Parameters<typeof api.vaults.create>[0]);
  },

  'vault:update': async (id: unknown, data: unknown) => {
    return api.vaults.update(id as string, data as Parameters<typeof api.vaults.update>[1]);
  },

  'vault:delete': async (id: unknown) => {
    await api.vaults.delete(id as string);
    return { success: true };
  },

  // --------------------------------------------------------------------------
  // File Validation & Resume Processing
  // --------------------------------------------------------------------------

  'validate-file': notImplemented(
    'validate-file',
    'Use the web file upload API instead.'
  ),

  'process-resume': notImplemented(
    'process-resume',
    'Use the /api/resume/upload endpoint for web-based resume processing.'
  ),

  'get-parsed-data': notImplemented(
    'get-parsed-data',
    'Parsed data is returned directly from the upload endpoint.'
  ),

  'save-parsed-content': async (data: unknown) => {
    const parsed = data as ParsedResume;
    if (!parsed || !Array.isArray(parsed.jobEntries)) {
      throw new Error('Invalid parsed resume data');
    }

    const normalizeLocation = (loc: unknown) => {
      if (!loc) return undefined;
      if (typeof loc === 'string') {
        const trimmed = loc.trim();
        return trimmed ? { city: trimmed } : undefined;
      }
      return loc as ContentItemInput['metadata']['location'];
    };

    const createdSkillNames = new Set<string>();

    // Create job entries and their child accomplishments/skills
    for (const job of parsed.jobEntries || []) {
      const jobContent = job.title || job.company || 'Job Entry';
      const jobMetadata: ContentItemInput['metadata'] = {};

      if (job.company) jobMetadata.company = job.company;
      if (job.location) jobMetadata.location = normalizeLocation(job.location);
      if (job.duration?.start || job.duration?.end) {
        jobMetadata.dateRange = {
          start: job.duration?.start || '',
          end: job.duration?.end || undefined,
        };
      }

      const jobResult = await api.content.create({
        type: 'job-entry',
        content: jobContent,
        tags: (job.tags as string[] | undefined) || [],
        metadata: jobMetadata,
      });

      const jobId = jobResult.id;

      for (const acc of job.accomplishments || []) {
        if (!acc.description) continue;
        await api.content.create({
          type: 'accomplishment',
          content: acc.description,
          tags: acc.tags || [],
          metadata: {},
          parentId: jobId,
        });
      }

      for (const skill of job.skills || []) {
        if (!skill.name) continue;
        const nameKey = skill.name.toLowerCase();
        createdSkillNames.add(nameKey);
        await api.content.create({
          type: 'skill',
          content: skill.name,
          tags: skill.tags || [],
          metadata: skill.proficiency ? { proficiency: skill.proficiency } : {},
          parentId: jobId,
        });
      }
    }

    // Create standalone skills (avoid duplicates)
    for (const skill of parsed.skills || []) {
      if (!skill.name) continue;
      const nameKey = skill.name.toLowerCase();
      if (createdSkillNames.has(nameKey)) continue;
      createdSkillNames.add(nameKey);
      await api.content.create({
        type: 'skill',
        content: skill.name,
        tags: skill.tags || [],
        metadata: skill.proficiency ? { proficiency: skill.proficiency } : {},
      });
    }

    // Education
    for (const edu of parsed.education || []) {
      const parts = [edu.degree, edu.institution].filter(Boolean);
      const content = parts.join(' — ') || edu.institution || edu.degree || 'Education';
      const metadata: ContentItemInput['metadata'] = {};

      if (edu.location) metadata.location = normalizeLocation(edu.location);
      if (edu.dateRange?.start || edu.dateRange?.end) {
        metadata.dateRange = {
          start: edu.dateRange?.start || '',
          end: edu.dateRange?.end || undefined,
        };
      }

      await api.content.create({
        type: 'education',
        content,
        tags: edu.tags || [],
        metadata,
      });
    }

    // Certifications
    for (const cert of parsed.certifications || []) {
      const content = cert.name || 'Certification';
      const metadata: ContentItemInput['metadata'] = {};

      if (cert.issuer) metadata.company = cert.issuer;
      if (cert.dateIssued || cert.expirationDate) {
        metadata.dateRange = {
          start: cert.dateIssued || '',
          end: cert.expirationDate || undefined,
        };
      }

      await api.content.create({
        type: 'certification',
        content,
        tags: cert.tags || [],
        metadata,
      });
    }

    return { success: true };
  },

  // --------------------------------------------------------------------------
  // Content Management
  // --------------------------------------------------------------------------

  'create-manual-content': async (formData: unknown) => {
    const data = formData as ContentItemInput;
    return api.content.create(data);
  },

  'search-content': async (query: unknown) => {
    const searchQuery = query as SearchQuery;
    const items = await api.content.search(searchQuery);
    return items;
  },

  'get-content-item': async (id: unknown) => {
    const item = await api.content.get(id as string);
    return item;
  },

  'update-content-item': async (formData: unknown) => {
    const { id, ...updates } = formData as { id: string } & Partial<ContentItemInput>;
    const item = await api.content.update(id, updates);
    return { success: true, id: item.id };
  },

  'delete-content-item': async (id: unknown) => {
    await api.content.delete(id as string);
    return { success: true };
  },

  'clear-vault': async (confirmation: unknown) => {
    if (confirmation !== 'delete') {
      return { success: false, error: 'Confirmation must be "delete"' };
    }
    return api.content.clearVault();
  },

  // --------------------------------------------------------------------------
  // Vault Path (Electron-specific - native dialogs)
  // --------------------------------------------------------------------------

  'select-vault-path': notImplemented(
    'select-vault-path',
    'Native file dialogs are not available in web browsers.'
  ),

  'get-vault-path': notImplemented(
    'get-vault-path',
    'Obsidian vault paths are an Electron-only feature.'
  ),

  'select-resume-file': webAlternative(
    'select-resume-file',
    'HTML file input (<input type="file">)'
  ),

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  'get-settings': async () => {
    const settings = await api.settings.get();
    return settings;
  },

  'save-settings': async (newSettings: unknown) => {
    return api.settings.update(newSettings as SettingsUpdate);
  },

  'validate-api-key': async (params: unknown) => {
    const { provider, apiKey } = params as { provider: LLMProvider; apiKey: string };
    return api.settings.validateApiKey(provider, apiKey);
  },

  'check-api-key-configured': async () => {
    return api.settings.checkApiKeyStatus();
  },

  // --------------------------------------------------------------------------
  // Job Queue
  // --------------------------------------------------------------------------

  'job-queue-add': async (jobData: unknown) => {
    return api.jobs.create(jobData as QueueJobInput);
  },

  'job-queue-status': async () => {
    const result = await api.jobs.list();
    return result.status;
  },

  'job-queue-list': async () => {
    const result = await api.jobs.list();
    return result.jobs;
  },

  'job-queue-remove': async (jobId: unknown) => {
    await api.jobs.delete(jobId as string);
    return { success: true };
  },

  'job-queue-clear-finished': async () => {
    // Get list of completed/failed jobs and delete them
    const { jobs } = await api.jobs.list();
    const finishedJobs = jobs.filter(
      (j) => j.status === 'completed' || j.status === 'failed'
    );
    let removed = 0;
    for (const job of finishedJobs) {
      try {
        await api.jobs.delete(job.id);
        removed++;
      } catch {
        // Continue deleting others
      }
    }
    return { success: true, removed };
  },

  'job-queue-process-next': async () => {
    // Get first pending job and optimize it
    const { jobs } = await api.jobs.list('pending');
    if (jobs.length === 0) {
      return { success: false, message: 'No pending jobs' };
    }
    const job = jobs[0];
    const result = await api.jobs.optimize({ jobId: job.id });
    // Wait for completion
    const completed = await api.jobs.waitForCompletion(result.jobId, 2000, 300000);
    return {
      success: completed.job.status === 'completed',
      job: completed.job,
      result: completed.result,
      error: completed.job.error,
    };
  },

  'job-queue-process-all': async () => {
    const { jobs } = await api.jobs.list('pending');
    const results: Array<{ job: unknown; result: unknown; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;
    let totalScore = 0;

    for (const job of jobs) {
      try {
        const optimizeResult = await api.jobs.optimize({ jobId: job.id });
        const completed = await api.jobs.waitForCompletion(optimizeResult.jobId);
        results.push({
          job: completed.job,
          result: completed.result,
        });
        if (completed.job.status === 'completed') {
          succeeded++;
          if (completed.result?.finalScore) {
            totalScore += completed.result.finalScore;
          }
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        results.push({
          job,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        processed: jobs.length,
        succeeded,
        failed,
        averageScore: succeeded > 0 ? totalScore / succeeded : undefined,
      },
    };
  },

  'job-queue-get-result': async (jobId: unknown) => {
    const result = await api.jobs.get(jobId as string);
    if (!result) {
      return { success: false, error: 'Job not found' };
    }
    return {
      success: true,
      job: result.job,
      result: result.result,
    };
  },

  // --------------------------------------------------------------------------
  // CSV Import (Web file upload alternative)
  // --------------------------------------------------------------------------

  'import-csv-select': webAlternative(
    'import-csv-select',
    'HTML file input (<input type="file" accept=".csv">)'
  ),

  'import-csv-validate': notImplemented(
    'import-csv-validate',
    'CSV validation will be handled by the upload endpoint.'
  ),

  'import-csv-import': notImplemented(
    'import-csv-import',
    'Use /api/jobs/import-csv endpoint with FormData.'
  ),

  'import-csv-template': async () => {
    // Return the template content directly for download
    const template = 'company,title,description,sourceUrl,requirements,responsibilities\n';
    return {
      success: true,
      content: template,
      filename: 'job-import-template.csv',
    };
  },

  // --------------------------------------------------------------------------
  // Opus Agent
  // --------------------------------------------------------------------------

  'agent-chat': async (message: string) => {
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    return response.json();
  },

  'agent-get-preferences': async (type?: string) => {
    const url = type ? `/api/agent/preferences?type=${encodeURIComponent(type)}` : '/api/agent/preferences';
    const response = await fetch(url);
    return response.json();
  },

  'agent-learn-preference': async (preference: unknown) => {
    const response = await fetch('/api/agent/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preference)
    });
    return response.json();
  },

  'agent-infer-skill': async (params: { skill: string; source?: string; proficiency?: string }) => {
    const response = await fetch('/api/agent/infer-skill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return response.json();
  },

  'agent-get-context': async () => {
    const response = await fetch('/api/agent/context');
    return response.json();
  },

  'agent-search-companies': notImplemented(
    'agent-search-companies',
    'Agent company search endpoint not yet implemented in web API.'
  ),

  // --------------------------------------------------------------------------
  // Job Search
  // --------------------------------------------------------------------------

  'search-jobs': async (criteria: unknown) => {
    const searchCriteria = criteria as {
      query?: string;
      keywords?: string[];
      title?: string;
      location?: string;
      remote?: boolean;
      employmentTypes?: string[];
      datePosted?: string;
    };

    // Build query from criteria
    const query = searchCriteria.query ||
      searchCriteria.keywords?.join(' ') ||
      searchCriteria.title ||
      '';

    return api.jobs.search({
      query,
      location: searchCriteria.location,
      remote: searchCriteria.remote,
      employmentTypes: searchCriteria.employmentTypes,
      datePosted: searchCriteria.datePosted
    });
  },

  'extract-job-from-url': notImplemented(
    'extract-job-from-url',
    'Job extraction endpoint not yet implemented in web API.'
  ),

  'search-agent-config': notImplemented(
    'search-agent-config',
    'Search agent config endpoint not yet implemented in web API.'
  ),

  // --------------------------------------------------------------------------
  // ATS Optimizer
  // --------------------------------------------------------------------------

  'optimizer-get-resume-preview': async () => {
    console.log('IPC ADAPTER: optimizer-get-resume-preview called');
    // Fetch resume-related content types and format as a preview
    const types = [
      ContentType.JOB_ENTRY,
      ContentType.EDUCATION,
      ContentType.SKILL,
      ContentType.ACCOMPLISHMENT,
      ContentType.CERTIFICATION,
    ];

    const allItems = [];
    for (const type of types) {
      const items = await api.content.search({ contentType: type });
      allItems.push(...items);
    }

    const jobEntries = allItems.filter((i) => i.type === ContentType.JOB_ENTRY).length;
    const accomplishments = allItems.filter((i) => i.type === ContentType.ACCOMPLISHMENT).length;
    const skills = allItems.filter((i) => i.type === ContentType.SKILL).length;
    const education = allItems.filter((i) => i.type === ContentType.EDUCATION).length;
    const certifications = allItems.filter((i) => i.type === ContentType.CERTIFICATION).length;

    // Build content string (simplified for web)
    const content = allItems.map((item) => item.content).join('\n\n');

    const result = {
      success: true,
      content,
      metadata: {
        jobEntries,
        accomplishments,
        skills,
        education,
        certifications,
      },
    };
    console.log('IPC ADAPTER: returning', result);
    return result;
  },

  'optimizer-optimize': async (params: unknown) => {
    console.log('OPTIMIZE IPC: received', params);
    const { jobPosting } = params as {
      jobPosting: { company: string; title: string; description: string };
    };
    console.log('OPTIMIZE IPC: calling api.jobs.optimize');
    const result = await api.jobs.optimize({
      company: jobPosting.company,
      title: jobPosting.title,
      description: jobPosting.description,
    });
    console.log('OPTIMIZE IPC: job created', result);
    console.log('OPTIMIZE IPC: waiting for completion');
    // Wait for completion and return result
    const completed = await api.jobs.waitForCompletion(result.jobId);
    console.log('OPTIMIZE IPC: completed', completed);
    return {
      success: completed.job.status === 'completed',
      data: completed.result,
      error: completed.job.error,
    };
  },

  'optimizer-extract-file': webAlternative(
    'optimizer-extract-file',
    'Upload file to /api/files/extract endpoint'
  ),

  'optimizer-export': async (params: unknown) => {
    const { content, format, filename } = params as {
      content: string;
      format: string;
      filename?: string;
    };
    // Trigger browser download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `optimized-resume.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  },

  'optimizer-export-pdf': webAlternative(
    'optimizer-export-pdf',
    'Server-side PDF generation via /api/export/pdf'
  ),

  'optimizer-export-word': webAlternative(
    'optimizer-export-word',
    'Server-side DOCX generation via /api/export/docx'
  ),

  'get-optimization-result': async (jobId: unknown) => {
    const result = await api.jobs.get(jobId as string);
    if (!result) {
      return { success: false, error: 'Job not found' };
    }
    return {
      success: true,
      job: result.job,
      result: result.result,
    };
  },

  'optimizer-save-to-vault': notImplemented(
    'optimizer-save-to-vault',
    'Obsidian vault integration is an Electron-only feature. Use knowledge-base-save instead.'
  ),

  // --------------------------------------------------------------------------
  // App State (Workflow persistence)
  // --------------------------------------------------------------------------

  'app-state-start-workflow': notImplemented(
    'app-state-start-workflow',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  'app-state-update-workflow': notImplemented(
    'app-state-update-workflow',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  'app-state-get-workflow': notImplemented(
    'app-state-get-workflow',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  'app-state-clear-workflow': notImplemented(
    'app-state-clear-workflow',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  'app-state-save-page': notImplemented(
    'app-state-save-page',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  'app-state-get-page': notImplemented(
    'app-state-get-page',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  'app-state-get-continue-info': notImplemented(
    'app-state-get-continue-info',
    'App state is managed client-side in web mode. Use React state/context.'
  ),

  // --------------------------------------------------------------------------
  // Applications
  // --------------------------------------------------------------------------

  'applications-list': async (statusFilter?: unknown) => {
    const result = await api.applications.list(statusFilter as ApplicationStatus | undefined);
    return {
      success: true,
      applications: result.applications,
      stats: result.stats,
    };
  },

  'applications-get': async (id: unknown) => {
    const application = await api.applications.get(id as string);
    return {
      success: true,
      application,
    };
  },

  'applications-save': async (data: unknown) => {
    const application = await api.applications.create(data as ApplicationInput);
    return {
      success: true,
      application,
    };
  },

  'applications-update': async (params: unknown) => {
    const { id, updates } = params as {
      id: string;
      updates: { status?: ApplicationStatus; notes?: string };
    };
    const application = await api.applications.update(id, updates);
    return {
      success: true,
      application,
    };
  },

  'applications-delete': async (id: unknown) => {
    await api.applications.delete(id as string);
    return { success: true };
  },

  // --------------------------------------------------------------------------
  // Knowledge Base
  // --------------------------------------------------------------------------

  'knowledge-base-list': async (filters?: unknown) => {
    const entries = await api.knowledgeBase.list(filters as KnowledgeBaseFilters | undefined);
    return {
      success: true,
      entries,
    };
  },

  'knowledge-base-get': async (id: unknown) => {
    const entry = await api.knowledgeBase.get(id as string);
    return {
      success: true,
      entry,
    };
  },

  'knowledge-base-save': async (data: unknown) => {
    const entry = await api.knowledgeBase.create(data as KnowledgeBaseInput);
    return {
      success: true,
      entry,
    };
  },

  'knowledge-base-update': async (params: unknown) => {
    const { id, updates } = params as {
      id: string;
      updates: { notes?: string; tags?: string[]; optimizedResume?: string };
    };
    const entry = await api.knowledgeBase.update(id, updates);
    return {
      success: true,
      entry,
    };
  },

  'knowledge-base-delete': async (id: unknown) => {
    await api.knowledgeBase.delete(id as string);
    return { success: true };
  },

  'knowledge-base-stats': async () => {
    const stats = await api.knowledgeBase.getStats();
    return {
      success: true,
      stats,
    };
  },

  'knowledge-base-companies': async () => {
    const companies = await api.knowledgeBase.getCompanies();
    return {
      success: true,
      companies,
    };
  },

  'knowledge-base-job-titles': async () => {
    const jobTitles = await api.knowledgeBase.getJobTitles();
    return {
      success: true,
      jobTitles,
    };
  },

  'knowledge-base-export': async (params: unknown) => {
    const { id, format } = params as { id: string; format: 'pdf' | 'docx' | 'md' };
    if (format === 'pdf' || format === 'docx') {
      return {
        success: false,
        error: `Export to ${format} requires server-side generation. Use /api/knowledge-base/${id}/export?format=${format}`,
      };
    }
    // For markdown, we can export directly
    const content = await api.knowledgeBase.export(id, 'md');
    // Trigger browser download
    const blob = new Blob([content as string], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-base-${id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  },
};

// ============================================================================
// IPC Renderer Mock (Web API adapter)
// ============================================================================

/**
 * Event listener storage for on/once methods
 */
type EventCallback = (...args: unknown[]) => void;
const eventListeners: Map<string, Set<EventCallback>> = new Map();

/**
 * Mock ipcRenderer object that maintains Electron's interface
 * but routes calls to the web API client.
 */
const webIpcRenderer = {
  /**
   * Invoke an IPC handler and return a promise with the result.
   * This is the primary method used for request/response communication.
   *
   * @param channel - The IPC channel name
   * @param args - Arguments to pass to the handler
   * @returns Promise resolving to the handler's return value
   *
   * @example
   * // Get all vaults
   * const vaults = await ipcRenderer.invoke('vault:getAll');
   *
   * // Create content
   * const result = await ipcRenderer.invoke('create-manual-content', {
   *   type: 'skill',
   *   content: 'TypeScript',
   *   tags: ['programming']
   * });
   */
  invoke: async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers[channel as IpcChannel];

    if (!handler) {
      console.error(`IPC Adapter: Unknown channel "${channel}"`);
      throw new Error(`Unknown IPC channel: ${channel}`);
    }

    try {
      const result = await handler(...args);
      return result as T;
    } catch (error) {
      // Re-throw with consistent error format
      if (error instanceof Error) {
        console.error(`IPC Adapter: Error in channel "${channel}":`, error.message);
        throw error;
      }
      throw new Error(`IPC channel "${channel}" failed: ${String(error)}`);
    }
  },

  /**
   * Send a one-way message (fire and forget).
   * In web mode, this is mostly a no-op since we use invoke for everything.
   *
   * @param channel - The channel to send to
   * @param args - Arguments to send
   */
  send: (channel: string, ...args: unknown[]): void => {
    console.warn(
      `IPC Adapter: send() called for "${channel}". Consider using invoke() instead.`,
      args
    );
  },

  /**
   * Send a synchronous message. Not recommended and not fully supported in web mode.
   *
   * @param channel - The channel to send to
   * @param args - Arguments to send
   * @returns undefined (sync IPC not supported in web mode)
   */
  sendSync: (channel: string, ...args: unknown[]): unknown => {
    console.error(
      `IPC Adapter: sendSync() is not supported in web mode. Channel: "${channel}"`,
      args
    );
    return undefined;
  },

  /**
   * Register an event listener for main process messages.
   * In web mode, this can be used for simulated events.
   *
   * @param channel - The channel to listen on
   * @param listener - Callback function
   */
  on: (channel: string, listener: EventCallback): typeof ipcRenderer => {
    if (!eventListeners.has(channel)) {
      eventListeners.set(channel, new Set());
    }
    eventListeners.get(channel)!.add(listener);
    return ipcRenderer;
  },

  /**
   * Register a one-time event listener.
   *
   * @param channel - The channel to listen on
   * @param listener - Callback function (called once then removed)
   */
  once: (channel: string, listener: EventCallback): typeof ipcRenderer => {
    const wrappedListener: EventCallback = (...args) => {
      ipcRenderer.removeListener(channel, wrappedListener);
      listener(...args);
    };
    return ipcRenderer.on(channel, wrappedListener);
  },

  /**
   * Remove an event listener.
   *
   * @param channel - The channel to remove listener from
   * @param listener - The listener to remove
   */
  removeListener: (channel: string, listener: EventCallback): typeof ipcRenderer => {
    eventListeners.get(channel)?.delete(listener);
    return ipcRenderer;
  },

  /**
   * Remove all listeners for a channel.
   *
   * @param channel - The channel to clear (optional, clears all if omitted)
   */
  removeAllListeners: (channel?: string): typeof ipcRenderer => {
    if (channel) {
      eventListeners.delete(channel);
    } else {
      eventListeners.clear();
    }
    return ipcRenderer;
  },

  /**
   * Emit an event to listeners (for testing/simulation purposes).
   * Not part of the standard Electron API but useful for testing.
   *
   * @param channel - The channel to emit on
   * @param args - Arguments to pass to listeners
   */
  emit: (channel: string, ...args: unknown[]): void => {
    const listeners = eventListeners.get(channel);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener({}, ...args); // First arg is event object in Electron
        } catch (error) {
          console.error(`IPC Adapter: Error in listener for "${channel}":`, error);
        }
      });
    }
  },
};

const electronIpcRenderer = getElectronIpcRenderer();

export const ipcRenderer = electronIpcRenderer
  ? {
      ...electronIpcRenderer,
      emit: (channel: string, ...args: unknown[]): void => {
        console.warn(
          `IPC Adapter: emit() called in Electron context for "${channel}". ` +
            'This is a web-only helper; no-op in Electron.',
          args
        );
      }
    }
  : webIpcRenderer;

// ============================================================================
// Type Exports
// ============================================================================

export type { IpcHandler };

/**
 * Default export for drop-in replacement of Electron's ipcRenderer
 */
export default ipcRenderer;
