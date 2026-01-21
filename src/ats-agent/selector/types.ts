/**
 * Selector Types
 *
 * Type definitions for the content selector stage of the resume pipeline.
 *
 * The Selector agent picks relevant content from the content vault for a specific
 * job posting, then passes the draft resume to the Committee for optimization.
 */

import type { ContentItem, ContentType } from '../../types';
import type { Resume, JobPosting } from '../types';
import type { DateRange, ContentMetadata } from '../../shared/types/common';

// ============================================================================
// Content Vault Types
// ============================================================================

/**
 * Unified content item for selector processing
 * Extends ContentItem with selection-specific fields
 */
export interface ContentVaultItem extends ContentItem {
  /** Resolved children (accomplishments under jobs, skills linked to jobs) */
  children?: ContentVaultItem[];

  /** For backward navigation - jobs can have parent items linked */
  linkedItems?: string[];
}

/**
 * A selected content item with relevance scoring
 */
export interface SelectedItem {
  /** The selected content item from the vault */
  item: ContentVaultItem;

  /** Relevance score (0.0 to 1.0) - how well this item matches the job */
  relevanceScore: number;

  /** Job requirements that this item addresses */
  matchedRequirements: string[];

  /** Explanation for why this item was selected */
  rationale: string;

  /** How the selector suggests using this in the resume */
  suggestedUsage?: string;
}

/**
 * A requirement extracted from the job posting
 */
export interface JobRequirement {
  /** The requirement text */
  text: string;

  /** Type of requirement */
  type: 'skill' | 'experience' | 'education' | 'certification' | 'soft_skill' | 'other';

  /** Importance level */
  importance: 'required' | 'preferred' | 'nice_to_have';

  /** Keywords associated with this requirement */
  keywords: string[];
}

/**
 * Parsed job posting with structured requirements
 */
export interface ParsedJobRequirements {
  /** Unique identifier for the job */
  jobId: string;

  /** Job title */
  title: string;

  /** Company name (if available) */
  company?: string;

  /** Extracted requirements */
  requirements: JobRequirement[];

  /** Key themes/focus areas identified in the job */
  themes: string[];

  /** Domain/industry context */
  domain?: string;

  /** Experience level expected */
  seniorityLevel?: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
}

// ============================================================================
// Selection Result Types
// ============================================================================

/**
 * A group of selected items by type
 */
export interface SelectedItemGroup {
  type: ContentType;
  items: SelectedItem[];
  totalRelevanceScore: number;
}

/**
 * Result from the selector agent
 */
export interface SelectionResult {
  /** All selected items with their relevance scores and rationale */
  selectedItems: SelectedItem[];

  /** Selected items grouped by content type */
  groupedItems: {
    jobs: SelectedItem[];
    skills: SelectedItem[];
    accomplishments: SelectedItem[];
    education: SelectedItem[];
    certifications: SelectedItem[];
  };

  /** The draft resume assembled from selected content */
  draftResume: Resume;

  /** Summary of the selection process */
  selectionSummary: string;

  /** Requirements that could not be matched */
  unmatchedRequirements: JobRequirement[];

  /** Coverage score (0.0 to 1.0) - how many requirements have matching content */
  coverageScore: number;

  /** Parsed job requirements used for selection */
  parsedRequirements: ParsedJobRequirements;

  /** Warnings or notes about the selection */
  warnings?: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the selector agent
 */
export interface SelectorConfig {
  /** Maximum number of job entries to include */
  maxJobs: number;

  /** Maximum number of skills to include */
  maxSkills: number;

  /** Maximum number of accomplishments per job */
  maxAccomplishmentsPerJob: number;

  /** Minimum relevance score to include an item (0.0 to 1.0) */
  minRelevanceScore: number;

  /** Whether to include education even if not explicitly required */
  alwaysIncludeEducation: boolean;

  /** Whether to include certifications even if not explicitly required */
  alwaysIncludeCertifications: boolean;

  /** Model to use for selection */
  model?: string;

  /** Temperature for LLM calls */
  temperature?: number;
}

/**
 * Default selector configuration
 */
export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  maxJobs: 5,
  maxSkills: 15,
  maxAccomplishmentsPerJob: 4,
  minRelevanceScore: 0.3,
  alwaysIncludeEducation: true,
  alwaysIncludeCertifications: true,
  model: 'gpt-4o',
  temperature: 0.3
};

// ============================================================================
// Pipeline Types
// ============================================================================

/**
 * Configuration for the full pipeline (Selector → Committee)
 */
export interface PipelineConfig {
  /** Selector configuration */
  selector: SelectorConfig;

  /** Committee configuration (passed through to committee) */
  committee: {
    maxRounds: number;
    consensusThreshold: number;
    targetFit: number;
    fastMode: boolean;
    models?: {
      advocate: string;
      critic: string;
      writer: string;
    };
  };

  /** Whether to skip committee and just return selected content */
  skipCommittee?: boolean;
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  selector: DEFAULT_SELECTOR_CONFIG,
  committee: {
    maxRounds: 2,
    consensusThreshold: 0.1,
    targetFit: 0.75,
    fastMode: true
  },
  skipCommittee: false
};

/**
 * Input type for pipeline configuration (allows partial configs)
 */
export interface PipelineConfigInput {
  /** Partial selector configuration */
  selector?: Partial<SelectorConfig>;

  /** Partial committee configuration */
  committee?: Partial<PipelineConfig['committee']>;

  /** Whether to skip committee and just return selected content */
  skipCommittee?: boolean;
}

/**
 * Enhanced committee output for Knowledge Base persistence
 * Captures the full advocate/critic dialogue for audit trail
 */
export interface EnhancedCommitteeOutput {
  /** Advocate's fit score from final round */
  advocateFitScore: number;
  /** Critic's fit score from final round */
  criticFitScore: number;
  /** Number of dialogue rounds */
  rounds: number;
  /** Why optimization stopped */
  terminationReason: 'consensus' | 'target_reached' | 'max_rounds' | 'no_improvement';
  /** Connections found between resume and job requirements */
  connections: Array<{
    requirement: string;
    evidence: string;
    strength: 'strong' | 'moderate' | 'inferred' | 'transferable';
  }>;
  /** Validated strengths from the resume */
  strengths: string[];
  /** Issues raised by the critic */
  challenges: Array<{
    type: 'overclaim' | 'unsupported' | 'missing' | 'weak_evidence' | 'terminology_gap' | 'blandification';
    claim: string;
    issue: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  /** Genuine gaps that couldn't be addressed through reframing */
  genuineGaps: Array<{
    requirement: string;
    reason: string;
    isRequired: boolean;
  }>;
}

/**
 * Decision tracking for audit trail
 */
export interface OptimizationDecisionTracking {
  /** Items included in the final resume with reasons */
  includedItems: Array<{
    itemId: string;
    reason: string;
    matchedRequirements?: string[];
  }>;
  /** Items that were excluded (below relevance threshold or not selected) */
  excludedItems: Array<{
    itemId: string;
    reason: string;
  }>;
  /** Modifications made during optimization */
  modifiedItems: Array<{
    originalContent: string;
    modifiedContent: string;
    keywordsAdded: string[];
    rationale: string;
  }>;
}

/**
 * Result from the full pipeline
 */
export interface PipelineResult {
  /** Final optimized resume from committee */
  finalResume: Resume;

  /** Selection result from stage 1 */
  selectionResult: SelectionResult;

  /** Committee result from stage 2 (if committee was run) */
  committeeResult?: {
    initialFit: number;
    finalFit: number;
    improvement: number;
    rounds: number;
    terminationReason: string;
  };

  /** Overall metrics */
  metrics: {
    /** Number of vault items considered */
    vaultItemsConsidered: number;
    /** Number of items selected */
    itemsSelected: number;
    /** Coverage of job requirements */
    requirementsCoverage: number;
    /** Initial fit score (from selection) */
    initialFitEstimate: number;
    /** Final fit score (from committee or selection if skipped) */
    finalFit: number;
    /** Total processing time in ms */
    processingTimeMs: number;
  };

  // === Enhanced Output for Knowledge Base (Option A) ===

  /** Full committee analysis for audit trail */
  enhancedCommitteeOutput?: EnhancedCommitteeOutput;

  /** Decision tracking for transparency */
  decisions?: OptimizationDecisionTracking;

  /** Parsed job requirements for structured storage */
  parsedRequirements?: {
    required: string[];
    preferred: string[];
    skills: string[];
    experience: string | null;
    education: string | null;
    themes?: string[];
  };
}

// ============================================================================
// LLM Response Types (for structured output)
// ============================================================================

/**
 * LLM response for requirement parsing
 */
export interface RequirementParseResponse {
  requirements: Array<{
    text: string;
    type: JobRequirement['type'];
    importance: JobRequirement['importance'];
    keywords: string[];
  }>;
  themes: string[];
  domain?: string;
  seniorityLevel?: ParsedJobRequirements['seniorityLevel'];
}

/**
 * LLM response for content selection
 */
export interface ContentSelectionResponse {
  selections: Array<{
    itemId: string;
    relevanceScore: number;
    matchedRequirements: string[];
    rationale: string;
    suggestedUsage?: string;
  }>;
  unmatchedRequirements: string[];
  selectionSummary: string;
  warnings?: string[];
}
