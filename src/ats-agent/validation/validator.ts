/**
 * ATS Agent Validator Utilities
 * 
 * Validation utilities for ATS Agent inputs and outputs.
 * Uses Zod schemas and extends shared validation utilities.
 */

import { z } from 'zod';
import { ValidationResult, ValidationError } from '../../shared/validation/types';
import {
  JobPostingSchema,
  JobSearchPayloadSchema,
  ResumeSchema,
  ResumeWriterResponseSchema,
  RecommendationsSchema,
  ResumeWriterRequestSchema,
  OptimizationConfigSchema,
  ParsedJobSchema,
  ParsedResumeSchema
} from './schemas';
import type {
  JobPosting,
  Resume,
  JobSearchPayload,
  ResumeWriterResponse,
  Recommendations,
  ResumeWriterRequest,
  OptimizationConfig,
  ParsedJob,
  ParsedResume
} from '../types';

/**
 * Converts Zod validation errors to ValidationResult
 */
function zodErrorToValidationResult(error: z.ZodError): ValidationResult {
  const errors: ValidationError[] = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));

  return {
    isValid: false,
    errors
  };
}

/**
 * Job Posting Validator
 */
export class JobPostingValidator {
  /**
   * Validates a job posting
   * @param jobPosting - The job posting to validate
   * @returns Validation result with specific errors for each invalid field
   */
  validate(jobPosting: unknown): ValidationResult {
    const result = JobPostingSchema.safeParse(jobPosting);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a job posting, throwing on error
   * @param jobPosting - The job posting to validate
   * @returns Parsed and validated job posting
   * @throws Error if validation fails
   */
  validateAndParse(jobPosting: unknown): JobPosting {
    return JobPostingSchema.parse(jobPosting);
  }

  /**
   * Validates a job search payload
   * @param payload - The payload to validate
   * @returns Validation result
   */
  validateJobSearchPayload(payload: unknown): ValidationResult {
    const result = JobSearchPayloadSchema.safeParse(payload);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a job search payload, throwing on error
   * @param payload - The payload to validate
   * @returns Parsed and validated job search payload
   * @throws Error if validation fails
   */
  validateAndParseJobSearchPayload(payload: unknown): JobSearchPayload {
    return JobSearchPayloadSchema.parse(payload);
  }
}

/**
 * Resume Validator
 */
export class ResumeValidator {
  /**
   * Validates a resume
   * @param resume - The resume to validate
   * @returns Validation result with specific errors for each invalid field
   */
  validate(resume: unknown): ValidationResult {
    const result = ResumeSchema.safeParse(resume);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a resume, throwing on error
   * @param resume - The resume to validate
   * @returns Parsed and validated resume
   * @throws Error if validation fails
   */
  validateAndParse(resume: unknown): Resume {
    return ResumeSchema.parse(resume);
  }

  /**
   * Validates a resume writer response
   * @param response - The response to validate
   * @returns Validation result
   */
  validateResumeWriterResponse(response: unknown): ValidationResult {
    const result = ResumeWriterResponseSchema.safeParse(response);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a resume writer response, throwing on error
   * @param response - The response to validate
   * @returns Parsed and validated resume writer response
   * @throws Error if validation fails
   */
  validateAndParseResumeWriterResponse(response: unknown): ResumeWriterResponse {
    return ResumeWriterResponseSchema.parse(response);
  }
}

/**
 * Recommendations Validator
 */
export class RecommendationsValidator {
  /**
   * Validates recommendations before sending to Resume Writer Agent
   * @param recommendations - The recommendations to validate
   * @returns Validation result with specific errors for each invalid field
   */
  validate(recommendations: unknown): ValidationResult {
    const result = RecommendationsSchema.safeParse(recommendations);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses recommendations, throwing on error
   * @param recommendations - The recommendations to validate
   * @returns Parsed and validated recommendations
   * @throws Error if validation fails
   */
  validateAndParse(recommendations: unknown): Recommendations {
    return RecommendationsSchema.parse(recommendations);
  }

  /**
   * Validates a resume writer request (full payload with recommendations)
   * @param request - The request to validate
   * @returns Validation result
   */
  validateResumeWriterRequest(request: unknown): ValidationResult {
    const result = ResumeWriterRequestSchema.safeParse(request);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a resume writer request, throwing on error
   * @param request - The request to validate
   * @returns Parsed and validated resume writer request
   * @throws Error if validation fails
   */
  validateAndParseResumeWriterRequest(request: unknown): ResumeWriterRequest {
    return ResumeWriterRequestSchema.parse(request);
  }
}

/**
 * Configuration Validator
 */
export class ConfigValidator {
  /**
   * Validates optimization configuration
   * @param config - The configuration to validate
   * @returns Validation result
   */
  validate(config: unknown): ValidationResult {
    const result = OptimizationConfigSchema.safeParse(config);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses optimization configuration, throwing on error
   * @param config - The configuration to validate
   * @returns Parsed and validated configuration with defaults applied
   * @throws Error if validation fails
   */
  validateAndParse(config: unknown): OptimizationConfig {
    return OptimizationConfigSchema.parse(config);
  }
}

/**
 * Parsed Data Validator
 */
export class ParsedDataValidator {
  /**
   * Validates a parsed job
   * @param parsedJob - The parsed job to validate
   * @returns Validation result
   */
  validateParsedJob(parsedJob: unknown): ValidationResult {
    const result = ParsedJobSchema.safeParse(parsedJob);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a parsed job, throwing on error
   * @param parsedJob - The parsed job to validate
   * @returns Parsed and validated job
   * @throws Error if validation fails
   */
  validateAndParseParsedJob(parsedJob: unknown): ParsedJob {
    return ParsedJobSchema.parse(parsedJob);
  }

  /**
   * Validates a parsed resume
   * @param parsedResume - The parsed resume to validate
   * @returns Validation result
   */
  validateParsedResume(parsedResume: unknown): ValidationResult {
    const result = ParsedResumeSchema.safeParse(parsedResume);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return zodErrorToValidationResult(result.error);
  }

  /**
   * Validates and parses a parsed resume, throwing on error
   * @param parsedResume - The parsed resume to validate
   * @returns Parsed and validated resume
   * @throws Error if validation fails
   */
  validateAndParseParsedResume(parsedResume: unknown): ParsedResume {
    return ParsedResumeSchema.parse(parsedResume);
  }
}

// Export singleton instances
export const jobPostingValidator = new JobPostingValidator();
export const resumeValidator = new ResumeValidator();
export const recommendationsValidator = new RecommendationsValidator();
export const configValidator = new ConfigValidator();
export const parsedDataValidator = new ParsedDataValidator();

