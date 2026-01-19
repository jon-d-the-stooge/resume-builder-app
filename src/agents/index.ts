/**
 * Agents Module Exports
 *
 * Export all agent implementations for use throughout the application.
 */

export { OpusAgent, opusAgent } from './opusAgent';
export type {
  JobPreference,
  InteractionEntry,
  AgentMemory,
  AgentResponse,
  AgentAction,
  SearchCriteria
} from './opusAgent';

export { JobSearchAgent, jobSearchAgent } from './jobSearchAgent';
export type {
  JobSearchResult,
  ExtractedJob,
  JobSearchConfig
} from './jobSearchAgent';
