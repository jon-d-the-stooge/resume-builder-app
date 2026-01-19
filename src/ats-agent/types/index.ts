/**
 * ATS Agent Core Type Definitions
 * 
 * This file contains all TypeScript interfaces and types for the ATS Agent feature.
 * These types define the data models for parsing, semantic analysis, scoring, and
 * recommendations as specified in the design document.
 */

// Import shared types
import type { LLMConfig } from '../../shared/llm/types';
import type { ContentMetadata, DateRange, Location } from '../../shared/types/common';

// Re-export shared types for convenience
export type { LLMConfig, ContentMetadata, DateRange, Location };

// ============================================================================
// Input Types (from external agents)
// ============================================================================

export interface JobPosting {
  id: string;
  title: string;
  description: string;
  requirements: string;
  qualifications: string;
  metadata?: Record<string, any>;
}

export interface Resume {
  id: string;
  content: string;
  format: 'text' | 'markdown' | 'obsidian';
  metadata?: Record<string, any>;
}

// ============================================================================
// Parser Types
// ============================================================================

export interface Element {
  text: string;
  normalizedText: string;
  tags: string[];
  context: string;
  position: { start: number; end: number };
}

export interface ParsedJob {
  elements: Element[];
  rawText: string;
  metadata: Record<string, any>;
}

export interface ParsedResume {
  elements: Element[];
  rawText: string;
  metadata: Record<string, any>;
}

// ============================================================================
// Semantic Analysis Types
// ============================================================================

export type MatchType = 'exact' | 'synonym' | 'related' | 'semantic';

export interface SemanticMatch {
  resumeElement: Element;
  jobElement: Element;
  matchType: MatchType;
  confidence: number; // 0.0 to 1.0
}

export type ElementCategory = 'keyword' | 'skill' | 'attribute' | 'experience' | 'concept';

export interface TaggedElement extends Element {
  importance: number;
  semanticTags: string[];
  category: ElementCategory;
}

export interface WeightedJob {
  id: string;
  elements: TaggedElement[];
  totalImportance: number;
  criticalElements: TaggedElement[];
  metadata: Record<string, any>;
}

export type ResumeSectionType = 'summary' | 'experience' | 'skills' | 'education' | 'other';

export interface ResumeSection {
  type: ResumeSectionType;
  content: string;
  elements: TaggedElement[];
}

export interface TaggedResume {
  id: string;
  elements: TaggedElement[];
  sections: ResumeSection[];
  metadata: Record<string, any>;
}

// ============================================================================
// Scoring Types
// ============================================================================

/**
 * Contribution from a single matched element
 */
export interface ElementContribution {
  element: Element;
  importance: number;
  matchQuality: number;
  contribution: number;
  category: ElementCategory;
  matchType?: string;
}

/**
 * Detailed breakdown for a scoring dimension
 */
export interface DimensionBreakdown {
  score: number;
  weight: number;
  weightedScore: number;
  contributions: ElementContribution[];
}

/**
 * Enhanced score breakdown with detailed contribution tracking
 */
export interface ScoreBreakdown {
  keywordScore: number;
  skillsScore: number;
  attributesScore: number;
  experienceScore: number;
  levelScore: number;
  weights: {
    keywords: number;
    skills: number;
    attributes: number;
    experience: number;
    level: number;
  };
  // Enhanced: detailed breakdown by dimension
  dimensions?: {
    keywords: DimensionBreakdown;
    skills: DimensionBreakdown;
    attributes: DimensionBreakdown;
    experience: DimensionBreakdown;
    level: DimensionBreakdown;
  };
}

/**
 * Represents a gap between resume and job requirements
 * 
 * A gap indicates a job requirement that is missing or weakly matched
 * in the resume. Each gap includes an importance score to help prioritize
 * which missing requirements are most critical to address.
 * 
 * Requirements: 5.5, 6.2, 10.4
 */
export interface Gap {
  /** The job requirement element that is missing or weakly matched */
  element: Element;
  
  /** 
   * Importance score of the missing requirement (0.0 to 1.0)
   * 
   * Higher scores indicate more critical requirements:
   * - >= 0.9: Required/essential (must-have)
   * - 0.8-0.9: Strongly preferred (high priority)
   * - 0.5-0.8: Preferred (medium priority)
   * - < 0.5: Nice to have (low priority)
   * 
   * This score helps prioritize which gaps to address first.
   * Requirement: 10.4 (Gap Importance Transparency)
   */
  importance: number;
  
  /** Category of the missing element (skill, experience, attribute, etc.) */
  category: string;
  
  /** 
   * Impact on overall match score
   * 
   * Calculated as: importance × (1 - match_quality)
   * Higher impact means this gap reduces the score more significantly.
   */
  impact: number;
}

/**
 * Represents a strength in the resume-job match
 * 
 * A strength indicates a high-quality match between a resume element
 * and an important job requirement. Strengths show what the candidate
 * does well and should be highlighted.
 * 
 * Requirements: 5.3, 10.1
 */
export interface Strength {
  /** The matched element from the resume */
  element: Element;
  
  /** Type of match (exact, synonym, related, semantic) */
  matchType: string;
  
  /** 
   * Contribution to overall match score
   * 
   * Calculated as: importance × match_quality
   * Higher contribution means this match adds more to the score.
   */
  contribution: number;
}

export interface MatchResult {
  overallScore: number;
  breakdown: ScoreBreakdown;
  gaps: Gap[];
  strengths: Strength[];
}

// ============================================================================
// Recommendation Types
// ============================================================================

export type RecommendationType = 'add_skill' | 'add_experience' | 'reword' | 'reframe' | 'emphasize' | 'deemphasize' | 'quantify';

export interface JobTheme {
  name: string;
  importance: number; // 0.0 to 1.0
  keywords: string[];
  rationale: string;
}

export interface Recommendation {
  type: RecommendationType;
  element: string;
  importance: number;
  suggestion: string;
  example?: string;
  jobRequirementReference: string; // Reference to specific job requirement that triggered this recommendation
  explanation: string; // Explanation of why this recommendation is being made
}

export interface Recommendations {
  summary: string;
  priority: Recommendation[];
  optional: Recommendation[];
  rewording: Recommendation[];
  metadata: {
    iterationRound: number;
    currentScore: number;
    targetScore: number;
    themes?: JobTheme[];
  };
}

// ============================================================================
// Iteration Control Types
// ============================================================================

export interface OptimizationConfig {
  targetScore: number;
  maxIterations: number;
  earlyStoppingRounds: number;
  minImprovement: number;
}

export interface IterationHistory {
  round: number;
  score: number;
  recommendations: Recommendations;
  resumeVersion: string;
}

export type TerminationReason = 'target_reached' | 'early_stopping' | 'max_iterations';

export interface OptimizationResult {
  finalResume: Resume;
  finalScore: number;
  iterations: IterationHistory[];
  terminationReason: TerminationReason;
  metrics: {
    initialScore: number;
    finalScore: number;
    improvement: number;
    iterationCount: number;
  };
}

export interface IterationDecision {
  shouldContinue: boolean;
  reason: string;
  recommendations?: Recommendations;
}

export type OptimizationStatus = 'running' | 'completed' | 'failed';

export interface OptimizationState {
  jobPosting: WeightedJob;
  currentResume: TaggedResume;
  history: IterationHistory[];
  config: OptimizationConfig;
  status: OptimizationStatus;
}

// ============================================================================
// Match Analysis Types
// ============================================================================

export interface MatchAnalysis {
  score: MatchResult;
  matches: SemanticMatch[];
  gaps: Gap[];
  strengths: Strength[];
  recommendations: Recommendations;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ScoringConfig {
  dimensionWeights: {
    keywords: number;
    skills: number;
    attributes: number;
    experience: number;
    level: number;
  };
  targetScore: number;
  minImprovement: number;
}

export interface IterationConfig {
  maxIterations: number;
  earlyStoppingRounds: number;
}

export interface RetryConfig {
  obsidianMaxRetries: number;
  obsidianBackoffMs: number[];
  agentTimeoutMs: number;
  llmMaxRetries: number;
  llmBackoffMs: number[];
}

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
}

export interface ATSAgentConfig {
  scoring: ScoringConfig;
  iteration: IterationConfig;
  retry: RetryConfig;
  cache: CacheConfig;
}

// ============================================================================
// External Communication Types
// ============================================================================

export interface JobSearchPayload {
  job: {
    id: string;
    title: string;
    company: string;
    description: string;
    requirements: string;
    qualifications: string;
    posted_date: string;
    location?: string;
    salary_range?: string;
  };
  metadata: {
    source: string;
    url?: string;
    retrieved_at: string;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  received?: any;
}

export type JobSearchStatus = 'accepted' | 'rejected';

export interface JobSearchResponse {
  status: JobSearchStatus;
  job_id: string;
  message?: string;
  errors?: ValidationError[];
}

export interface RecommendationItem {
  type: RecommendationType;
  element: string;
  importance: number;
  suggestion: string;
  example?: string;
  job_requirement_reference: string;
}

export interface GapItem {
  element: string;
  importance: number;
  category: string;
  impact: number;
}

export interface StrengthItem {
  element: string;
  match_type: string;
  contribution: number;
}

export interface ResumeWriterRequest {
  request_id: string;
  job_id: string;
  resume_id: string;
  iteration_round: number;
  current_score: number;
  target_score: number;
  recommendations: {
    summary: string;
    priority: RecommendationItem[];
    optional: RecommendationItem[];
    rewording: RecommendationItem[];
  };
  gaps: GapItem[];
  strengths: StrengthItem[];
  metadata: {
    timestamp: string;
    previous_scores: number[];
  };
}

export interface ResumeWriterResponse {
  response_id: string;
  request_id: string;
  resume_id: string;
  resume: {
    id: string;
    content: string;
    format: 'text' | 'markdown';
    version: number;
  };
  changes_made: string[];
  metadata: {
    timestamp: string;
    processing_time_ms: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export type ErrorCode = 
  | 'INVALID_INPUT'
  | 'PARSING_FAILED'
  | 'INTEGRATION_ERROR'
  | 'SEMANTIC_ANALYSIS_FAILED'
  | 'SCORING_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMIT';

export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: any;
  timestamp: string;
  request_id?: string;
}

// ============================================================================
// Component Interfaces
// ============================================================================

export interface ParserEngine {
  parseJobDescription(jobPosting: JobPosting): ParsedJob;
  parseResume(resume: Resume): ParsedResume;
}

export interface SemanticAnalyzer {
  analyzeTags(element: Element, context: string): string[];
  findSemanticMatches(
    resumeElement: Element,
    jobElements: Element[]
  ): SemanticMatch[];
  findSemanticMatchesBatch(
    resumeElements: Element[],
    jobElements: Element[]
  ): SemanticMatch[];
}

export interface ScorerEngine {
  assignImportance(element: Element, context: string): number;
  calculateMatchScore(
    parsedResume: ParsedResume,
    parsedJob: ParsedJob,
    matches: SemanticMatch[]
  ): MatchResult;
}

export interface RecommendationGenerator {
  generateRecommendations(matchResult: MatchResult): Recommendations;
}

export interface IterationController {
  startOptimization(
    jobPosting: JobPosting,
    initialResume: Resume,
    config: OptimizationConfig
  ): Promise<OptimizationResult>;
  
  processIteration(
    resumeDraft: Resume,
    previousScore: number
  ): IterationDecision;
}

export interface ObsidianClient {
  getResumeContent(resumeId: string): Promise<Resume>;
  saveAnalysisResult(
    jobId: string,
    resumeId: string,
    result: OptimizationResult
  ): Promise<void>;
}

// ============================================================================
// Tag Taxonomy
// ============================================================================

export const TAG_TAXONOMY = {
  technical_skills: [
    'programming',
    'databases',
    'frameworks',
    'tools',
    'platforms',
    'languages'
  ],
  soft_skills: [
    'leadership',
    'communication',
    'teamwork',
    'problem_solving',
    'time_management'
  ],
  attributes: [
    'experience_level',
    'education',
    'certifications',
    'domain_knowledge'
  ],
  concepts: [
    'methodologies',
    'practices',
    'principles'
  ]
} as const;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: ATSAgentConfig = {
  scoring: {
    dimensionWeights: {
      keywords: 0.20,
      skills: 0.35,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10
    },
    targetScore: 0.8,
    minImprovement: 0.01
  },
  iteration: {
    maxIterations: 10,
    earlyStoppingRounds: 2
  },
  retry: {
    obsidianMaxRetries: 3,
    obsidianBackoffMs: [1000, 2000, 4000],
    agentTimeoutMs: 30000,
    llmMaxRetries: 3,
    llmBackoffMs: [1000, 2000, 4000]
  },
  cache: {
    enabled: true,
    ttlSeconds: 3600,
    maxEntries: 1000
  }
};
