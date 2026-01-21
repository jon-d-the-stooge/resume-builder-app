/**
 * Selector Module
 *
 * Stage 1 of the two-stage resume pipeline.
 * Selects relevant content from the vault for a specific job posting.
 *
 * @module selector
 */

// Types
export type {
  ContentVaultItem,
  SelectedItem,
  SelectionResult,
  SelectorConfig,
  ParsedJobRequirements,
  JobRequirement,
  SelectedItemGroup,
  PipelineConfig,
  PipelineConfigInput,
  PipelineResult,
  RequirementParseResponse,
  ContentSelectionResponse
} from './types';

// Constants
export {
  DEFAULT_SELECTOR_CONFIG,
  DEFAULT_PIPELINE_CONFIG
} from './types';

// Selector agent
export {
  runSelector,
  parseJobRequirements,
  resolveVaultRelationships
} from './selector';

// Resume builder
export { buildDraftResume } from './resumeBuilder';

// Vault adapter (for hierarchical vault integration)
export {
  vaultToContentVaultItems,
  formatVaultItemForLLM,
  formatVaultContentForLLM,
  getExperienceMetadata,
  hasStructuredExperienceMetadata
} from './vaultAdapter';
