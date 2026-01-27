/**
 * Services index - re-exports service modules from shared/services/ for use by backend routes.
 * This provides a clean abstraction layer between the Express routes
 * and the core business logic implemented in the shared modules.
 *
 * NOTE: All services are imported from src/shared/services/ which contains
 * NO Electron dependencies, making them safe for web/Docker deployment.
 */

export { vaultManager } from '../../shared/services/vaultManager';
export { jobQueue } from '../../shared/services/jobQueue';
export { queueProcessor } from '../../shared/services/queueProcessor';
export { applicationsStore } from '../../shared/services/applicationsStore';
export { knowledgeBaseStore } from '../../shared/services/knowledgeBaseStore';
export { settingsStore } from '../../shared/services/settingsStore';
export { contentManager } from '../../shared/services/contentManager';
export { ResumeParser } from '../../shared/services/resumeParser';
export { csvImporter } from '../../shared/services/csvImporter';
export { markdownGenerator } from '../../shared/services/markdownGenerator';

// API proxy services for external API calls
export { llmProxy, rapidAPIProxy, LLMProxy, RapidAPIProxy } from './apiProxy';
export type { UsageStats, RapidAPIStats, JSearchJob, JSearchResponse, JSearchJobDetails } from './apiProxy';

// Usage tracking service
export { usageTracker } from './usageTracker';
export type {
  ServiceType,
  UsageRecord,
  UsageSummary,
  UserUsageSummary,
  AdminUsageSummary
} from './usageTracker';
