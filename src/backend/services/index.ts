/**
 * Services index - re-exports service modules from main/ for use by backend routes.
 * This provides a clean abstraction layer between the Express routes
 * and the core business logic implemented in the main process modules.
 */

export { vaultManager } from '../../main/vaultManager';
export { jobQueue } from '../../main/jobQueue';
export { queueProcessor } from '../../main/queueProcessor';
export { applicationsStore } from '../../main/applicationsStore';
export { knowledgeBaseStore } from '../../main/knowledgeBaseStore';
export { settingsStore } from '../../main/settingsStore';
export { contentManager } from '../../main/contentManager';
export { ResumeParser } from '../../main/resumeParser';
export { csvImporter } from '../../main/csvImporter';
export { markdownGenerator } from '../../main/markdownGenerator';

// API proxy services for external API calls
export { llmProxy, rapidAPIProxy, LLMProxy, RapidAPIProxy } from './apiProxy';
export type { UsageStats, RapidAPIStats, JSearchJob, JSearchResponse, JSearchJobDetails } from './apiProxy';
