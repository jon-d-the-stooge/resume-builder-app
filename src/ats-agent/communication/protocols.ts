/**
 * External Agent Communication Protocols
 * 
 * Defines interfaces and message formats for communication with:
 * - Job Search Agent
 * - Resume Writer Agent
 * 
 * Requirements: 7.1, 8.2
 */

import type {
  JobPosting,
  Resume,
  Recommendations,
  OptimizationResult,
  MatchResult
} from '../types';
import { ValidationError, ErrorResponse } from '../errors/types';

// ============================================================================
// Job Search Agent Protocol
// ============================================================================

/**
 * Job posting payload from Job Search Agent
 */
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

/**
 * Response to Job Search Agent
 */
export interface JobSearchResponse {
  status: 'accepted' | 'rejected';
  job_id: string;
  message?: string;
  errors?: ValidationError[];
}

/**
 * Final result sent to Job Search Agent
 */
export interface JobSearchResultPayload {
  job_id: string;
  resume_id: string;
  final_score: number;
  initial_score: number;
  improvement: number;
  iterations: number;
  termination_reason: string;
  timestamp: string;
}

// ============================================================================
// Resume Writer Agent Protocol
// ============================================================================

/**
 * Recommendation item for Resume Writer Agent
 */
export interface RecommendationItem {
  type: 'add_skill' | 'add_experience' | 'reword' | 'reframe' | 'emphasize' | 'deemphasize' | 'quantify';
  element: string;
  importance: number;
  suggestion: string;
  example?: string;
  job_requirement_reference: string;
}

/**
 * Gap item for Resume Writer Agent
 */
export interface GapItem {
  element: string;
  importance: number;
  category: string;
  impact: number;
}

/**
 * Strength item for Resume Writer Agent
 */
export interface StrengthItem {
  element: string;
  match_type: string;
  contribution: number;
}

/**
 * Request to Resume Writer Agent
 */
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

/**
 * Response from Resume Writer Agent
 */
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
// Protocol Converters
// ============================================================================

/**
 * Convert JobSearchPayload to internal JobPosting format
 */
export function convertJobSearchPayload(payload: JobSearchPayload): JobPosting {
  return {
    id: payload.job.id,
    title: payload.job.title,
    description: payload.job.description,
    requirements: payload.job.requirements,
    qualifications: payload.job.qualifications,
    metadata: {
      company: payload.job.company,
      posted_date: payload.job.posted_date,
      location: payload.job.location,
      salary_range: payload.job.salary_range,
      source: payload.metadata.source,
      url: payload.metadata.url,
      retrieved_at: payload.metadata.retrieved_at
    }
  };
}

/**
 * Convert internal Recommendations to ResumeWriterRequest format
 */
export function convertToResumeWriterRequest(
  requestId: string,
  jobId: string,
  resumeId: string,
  iterationRound: number,
  matchResult: MatchResult,
  recommendations: Recommendations,
  previousScores: number[]
): ResumeWriterRequest {
  // Convert recommendations
  const convertRecommendation = (rec: any): RecommendationItem => ({
    type: rec.type,
    element: rec.element,
    importance: rec.importance,
    suggestion: rec.suggestion,
    example: rec.example,
    job_requirement_reference: rec.element // Use element as reference
  });

  // Convert gaps
  const gaps: GapItem[] = matchResult.gaps.map(gap => ({
    element: gap.element.text,
    importance: gap.importance,
    category: gap.category,
    impact: gap.impact
  }));

  // Convert strengths
  const strengths: StrengthItem[] = matchResult.strengths.map(strength => ({
    element: strength.element.text,
    match_type: strength.matchType,
    contribution: strength.contribution
  }));

  return {
    request_id: requestId,
    job_id: jobId,
    resume_id: resumeId,
    iteration_round: iterationRound,
    current_score: matchResult.overallScore,
    target_score: recommendations.metadata.targetScore,
    recommendations: {
      summary: recommendations.summary,
      priority: recommendations.priority.map(convertRecommendation),
      optional: recommendations.optional.map(convertRecommendation),
      rewording: recommendations.rewording.map(convertRecommendation)
    },
    gaps,
    strengths,
    metadata: {
      timestamp: new Date().toISOString(),
      previous_scores: previousScores
    }
  };
}

/**
 * Convert ResumeWriterResponse to internal Resume format
 */
export function convertResumeWriterResponse(response: ResumeWriterResponse): Resume {
  return {
    id: response.resume.id,
    content: response.resume.content,
    format: response.resume.format,
    metadata: {
      version: response.resume.version,
      changes_made: response.changes_made,
      processing_time_ms: response.metadata.processing_time_ms,
      timestamp: response.metadata.timestamp
    }
  };
}

/**
 * Convert OptimizationResult to JobSearchResultPayload
 */
export function convertToJobSearchResult(
  jobId: string,
  resumeId: string,
  result: OptimizationResult
): JobSearchResultPayload {
  return {
    job_id: jobId,
    resume_id: resumeId,
    final_score: result.finalScore,
    initial_score: result.metrics.initialScore,
    improvement: result.metrics.improvement,
    iterations: result.metrics.iterationCount,
    termination_reason: result.terminationReason,
    timestamp: new Date().toISOString()
  };
}
