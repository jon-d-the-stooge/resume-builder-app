/**
 * ATS Agent Validation Schemas
 * 
 * Zod schemas for validating ATS Agent inputs and outputs.
 * Extends shared validation schemas for consistency.
 */

import { z } from 'zod';

// ============================================================================
// Job Posting Schemas
// ============================================================================

/**
 * Job posting schema - validates input from Job Search Agent
 */
export const JobPostingSchema = z.object({
  id: z.string().trim().min(1, 'Job ID is required'),
  title: z.string().trim().min(1, 'Job title is required'),
  description: z.string().trim().min(1, 'Job description is required'),
  requirements: z.string().default(''),
  qualifications: z.string().default(''),
  metadata: z.record(z.any()).optional()
});

/**
 * Job search payload schema - full payload from Job Search Agent
 */
export const JobSearchPayloadSchema = z.object({
  job: z.object({
    id: z.string().trim().min(1, 'Job ID is required'),
    title: z.string().trim().min(1, 'Job title is required'),
    company: z.string().trim().min(1, 'Company name is required'),
    description: z.string().trim().min(1, 'Job description is required'),
    requirements: z.string().default(''),
    qualifications: z.string().default(''),
    posted_date: z.string().trim().min(1, 'Posted date is required'),
    location: z.string().optional(),
    salary_range: z.string().optional()
  }),
  metadata: z.object({
    source: z.string().trim().min(1, 'Source is required'),
    url: z.string().url().optional(),
    retrieved_at: z.string().trim().min(1, 'Retrieved timestamp is required')
  })
});

// ============================================================================
// Resume Schemas
// ============================================================================

/**
 * Resume format enum
 */
export const ResumeFormatSchema = z.enum(['text', 'markdown', 'obsidian']);

/**
 * Resume schema - validates resume input
 */
export const ResumeSchema = z.object({
  id: z.string().trim().min(1, 'Resume ID is required'),
  content: z.string().trim().min(1, 'Resume content is required'),
  format: ResumeFormatSchema,
  metadata: z.record(z.any()).optional()
});

/**
 * Resume writer response schema - validates response from Resume Writer Agent
 */
export const ResumeWriterResponseSchema = z.object({
  response_id: z.string().trim().min(1, 'Response ID is required'),
  request_id: z.string().trim().min(1, 'Request ID is required'),
  resume_id: z.string().trim().min(1, 'Resume ID is required'),
  resume: z.object({
    id: z.string().trim().min(1, 'Resume ID is required'),
    content: z.string().trim().min(1, 'Resume content is required'),
    format: z.enum(['text', 'markdown']),
    version: z.number().int().positive('Version must be a positive integer')
  }),
  changes_made: z.array(z.string()),
  metadata: z.object({
    timestamp: z.string().trim().min(1, 'Timestamp is required'),
    processing_time_ms: z.number().nonnegative('Processing time must be non-negative')
  })
});

// ============================================================================
// Recommendation Schemas
// ============================================================================

/**
 * Recommendation type enum
 */
export const RecommendationTypeSchema = z.enum([
  'add_skill',
  'add_experience',
  'reword',
  'reframe',
  'emphasize',
  'deemphasize',
  'quantify'
]);

/**
 * Single recommendation schema
 */
export const RecommendationSchema = z.object({
  type: RecommendationTypeSchema,
  element: z.string().trim().min(1, 'Element is required'),
  importance: z.number().finite('Importance must be a valid number').min(0).max(1, 'Importance must be between 0 and 1'),
  suggestion: z.string().trim().min(1, 'Suggestion is required'),
  example: z.string().optional()
});

/**
 * Recommendation item schema (for external communication)
 */
export const RecommendationItemSchema = z.object({
  type: RecommendationTypeSchema,
  element: z.string().trim().min(1, 'Element is required'),
  importance: z.number().finite('Importance must be a valid number').min(0).max(1, 'Importance must be between 0 and 1'),
  suggestion: z.string().trim().min(1, 'Suggestion is required'),
  example: z.string().optional(),
  job_requirement_reference: z.string().trim().min(1, 'Job requirement reference is required')
});

/**
 * Recommendations metadata schema
 */
export const RecommendationsMetadataSchema = z.object({
  iterationRound: z.number().int().nonnegative('Iteration round must be non-negative'),
  currentScore: z.number().finite('Current score must be a valid number').min(0).max(1, 'Current score must be between 0 and 1'),
  targetScore: z.number().finite('Target score must be a valid number').min(0).max(1, 'Target score must be between 0 and 1')
});

/**
 * Full recommendations schema
 */
export const RecommendationsSchema = z.object({
  summary: z.string().trim().min(1, 'Summary is required'),
  priority: z.array(RecommendationSchema),
  optional: z.array(RecommendationSchema),
  rewording: z.array(RecommendationSchema),
  metadata: RecommendationsMetadataSchema
});

/**
 * Gap item schema (for external communication)
 */
export const GapItemSchema = z.object({
  element: z.string().trim().min(1, 'Element is required'),
  importance: z.number().finite('Importance must be a valid number').min(0).max(1, 'Importance must be between 0 and 1'),
  category: z.string().trim().min(1, 'Category is required'),
  impact: z.number().finite('Impact must be a valid number').min(0).max(1, 'Impact must be between 0 and 1')
});

/**
 * Strength item schema (for external communication)
 */
export const StrengthItemSchema = z.object({
  element: z.string().trim().min(1, 'Element is required'),
  match_type: z.string().trim().min(1, 'Match type is required'),
  contribution: z.number().finite('Contribution must be a valid number').min(0).max(1, 'Contribution must be between 0 and 1')
});

/**
 * Resume writer request schema - validates request to Resume Writer Agent
 */
export const ResumeWriterRequestSchema = z.object({
  request_id: z.string().trim().min(1, 'Request ID is required'),
  job_id: z.string().trim().min(1, 'Job ID is required'),
  resume_id: z.string().trim().min(1, 'Resume ID is required'),
  iteration_round: z.number().int().nonnegative('Iteration round must be non-negative'),
  current_score: z.number().finite('Current score must be a valid number').min(0).max(1, 'Current score must be between 0 and 1'),
  target_score: z.number().finite('Target score must be a valid number').min(0).max(1, 'Target score must be between 0 and 1'),
  recommendations: z.object({
    summary: z.string().trim().min(1, 'Summary is required'),
    priority: z.array(RecommendationItemSchema),
    optional: z.array(RecommendationItemSchema),
    rewording: z.array(RecommendationItemSchema)
  }),
  gaps: z.array(GapItemSchema),
  strengths: z.array(StrengthItemSchema),
  metadata: z.object({
    timestamp: z.string().trim().min(1, 'Timestamp is required'),
    previous_scores: z.array(z.number().finite('Score must be a valid number').min(0).max(1))
  })
});

// ============================================================================
// Element and Parsing Schemas
// ============================================================================

/**
 * Element position schema
 */
export const ElementPositionSchema = z.object({
  start: z.number().int().nonnegative('Start position must be non-negative'),
  end: z.number().int().nonnegative('End position must be non-negative')
}).refine((data) => data.end >= data.start, {
  message: 'End position must be greater than or equal to start position'
});

/**
 * Element schema
 */
export const ElementSchema = z.object({
  text: z.string().trim().min(1, 'Element text is required'),
  normalizedText: z.string().trim().min(1, 'Normalized text is required'),
  tags: z.array(z.string()),
  context: z.string(),
  position: ElementPositionSchema
});

/**
 * Element category enum
 */
export const ElementCategorySchema = z.enum([
  'keyword',
  'skill',
  'attribute',
  'experience',
  'concept'
]);

/**
 * Tagged element schema
 */
export const TaggedElementSchema = ElementSchema.extend({
  importance: z.number().finite('Importance must be a valid number').min(0).max(1, 'Importance must be between 0 and 1'),
  semanticTags: z.array(z.string()),
  category: ElementCategorySchema
});

/**
 * Parsed job schema
 */
export const ParsedJobSchema = z.object({
  elements: z.array(ElementSchema),
  rawText: z.string(),
  metadata: z.record(z.any())
});

/**
 * Parsed resume schema
 */
export const ParsedResumeSchema = z.object({
  elements: z.array(ElementSchema),
  rawText: z.string(),
  metadata: z.record(z.any())
});

// ============================================================================
// Configuration Schemas
// ============================================================================

/**
 * Optimization config schema
 */
export const OptimizationConfigSchema = z.object({
  targetScore: z.number().finite('Target score must be a valid number').min(0).max(1, 'Target score must be between 0 and 1').default(0.8),
  maxIterations: z.number().int().positive('Max iterations must be positive').default(10),
  earlyStoppingRounds: z.number().int().positive('Early stopping rounds must be positive').default(2),
  minImprovement: z.number().finite('Min improvement must be a valid number').positive('Min improvement must be positive').default(0.01)
});
