/**
 * Unit Tests for Error Handling
 * 
 * Tests error response structures, graceful degradation, and error logging.
 * Requirement 8.4: Descriptive error messages
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ATSError,
  ATSErrorFactory,
  ATSErrorCode,
  ValidationError
} from '../../ats-agent/errors/types';
import { GracefulDegradation, DEFAULT_IMPORTANCE } from '../../ats-agent/errors/gracefulDegradation';
import { ATSLogger } from '../../ats-agent/logging/logger';
import type { Element, TaggedElement } from '../../ats-agent/types';

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  // Clear logs before each test
  ATSLogger.clearLogs();
});

// ============================================================================
// Error Response Structure Tests
// ============================================================================

describe('Error Response Structures', () => {
  it('should create invalid input error with validation details', () => {
    const error = ATSErrorFactory.invalidInput('title', 'Title is required', undefined);

    expect(error.code).toBe(ATSErrorCode.INVALID_INPUT);
    expect(error.userMessage).toContain('title');
    expect(error.validationErrors).toBeDefined();
    expect(error.validationErrors?.length).toBe(1);
    expect(error.validationErrors?.[0].field).toBe('title');
    expect(error.retryable).toBe(false);
  });

  it('should create job posting validation error', () => {
    const validationErrors: ValidationError[] = [
      { field: 'id', message: 'ID is required' },
      { field: 'description', message: 'Description is required' }
    ];

    const error = ATSErrorFactory.invalidJobPosting(validationErrors);

    expect(error.code).toBe(ATSErrorCode.INVALID_JOB_POSTING);
    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.suggestedAction).toBeDefined();
  });

  it('should create resume validation error', () => {
    const validationErrors: ValidationError[] = [
      { field: 'content', message: 'Content is required' }
    ];

    const error = ATSErrorFactory.invalidResume(validationErrors);

    expect(error.code).toBe(ATSErrorCode.INVALID_RESUME);
    expect(error.validationErrors).toEqual(validationErrors);
  });

  it('should create parsing error with context', () => {
    const error = ATSErrorFactory.parsingFailed(
      'job',
      'Invalid text encoding',
      { encoding: 'ISO-8859-1' }
    );

    expect(error.code).toBe(ATSErrorCode.JOB_PARSING_FAILED);
    expect(error.context).toBeDefined();
    expect(error.context?.encoding).toBe('ISO-8859-1');
    expect(error.retryable).toBe(false);
  });

  it('should create Obsidian unavailable error as retryable', () => {
    const error = ATSErrorFactory.obsidianUnavailable('Connection timeout');

    expect(error.code).toBe(ATSErrorCode.OBSIDIAN_UNAVAILABLE);
    expect(error.retryable).toBe(true);
    expect(error.suggestedAction).toBeDefined();
  });

  it('should create resume not found error', () => {
    const error = ATSErrorFactory.resumeNotFound('resume-123');

    expect(error.code).toBe(ATSErrorCode.RESUME_NOT_FOUND);
    expect(error.context?.resumeId).toBe('resume-123');
    expect(error.retryable).toBe(false);
  });

  it('should create semantic analysis error as retryable', () => {
    const error = ATSErrorFactory.semanticAnalysisFailed(
      'LLM timeout',
      { timeout: 30000 }
    );

    expect(error.code).toBe(ATSErrorCode.SEMANTIC_ANALYSIS_FAILED);
    expect(error.retryable).toBe(true);
    expect(error.suggestedAction).toContain('fall back');
  });

  it('should create scoring error', () => {
    const error = ATSErrorFactory.scoringFailed(
      'No valid elements found',
      { elementCount: 0 }
    );

    expect(error.code).toBe(ATSErrorCode.SCORING_ERROR);
    expect(error.context?.elementCount).toBe(0);
  });

  it('should create agent timeout error', () => {
    const error = ATSErrorFactory.agentTimeout('Resume Writer Agent', 30000);

    expect(error.code).toBe(ATSErrorCode.AGENT_TIMEOUT);
    expect(error.context?.agentName).toBe('Resume Writer Agent');
    expect(error.context?.timeoutMs).toBe(30000);
    expect(error.retryable).toBe(true);
  });

  it('should convert error to response format', () => {
    const error = ATSErrorFactory.invalidInput('field', 'message', 'value');
    const response = error.toErrorResponse('req-123');

    expect(response.error).toBe(ATSErrorCode.INVALID_INPUT);
    expect(response.message).toBeDefined();
    expect(response.timestamp).toBeDefined();
    expect(response.request_id).toBe('req-123');
    expect(response.validation_errors).toBeDefined();
    expect(response.retryable).toBe(false);
    expect(response.suggested_action).toBeDefined();
  });
});

// ============================================================================
// Graceful Degradation Tests
// ============================================================================

describe('Graceful Degradation', () => {
  it('should fall back to basic keyword matching on semantic analysis failure', () => {
    const element: Element = {
      text: 'Python',
      normalizedText: 'python',
      tags: [],
      context: 'Experience with Python',
      position: { start: 0, end: 6 }
    };

    const error = new Error('Semantic analysis failed');
    const result = GracefulDegradation.handleSemanticAnalysisFailure(element, error);

    expect(result.text).toBe('Python');
    expect(result.importance).toBe(DEFAULT_IMPORTANCE);
    expect(result.semanticTags).toContain('generic');
    expect(result.category).toBe('keyword');

    // Should log the error
    const logs = ATSLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should use default importance on scoring failure', () => {
    const element: Element = {
      text: 'JavaScript',
      normalizedText: 'javascript',
      tags: [],
      context: 'JavaScript required',
      position: { start: 0, end: 10 }
    };

    const error = new Error('Importance scoring failed');
    const result = GracefulDegradation.handleImportanceScoringFailure(element, error);

    expect(result).toBe(DEFAULT_IMPORTANCE);

    // Should log the error
    const logs = ATSLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should return empty matches on semantic matching failure', () => {
    const error = new Error('Matching failed');
    const result = GracefulDegradation.handleSemanticMatchingFailure(error);

    expect(result).toEqual([]);

    // Should log the error
    const logs = ATSLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should calculate score from remaining dimensions on dimension failure', () => {
    const partialBreakdown = {
      keywordScore: 0.8,
      skillsScore: 0.9,
      attributesScore: 0.7,
      // experienceScore missing (failed)
      levelScore: 0.6,
      weights: {
        keywords: 0.20,
        skills: 0.35,
        attributes: 0.20,
        experience: 0.15,
        level: 0.10
      }
    };

    const error = new Error('Experience scoring failed');
    const result = GracefulDegradation.handleDimensionScoringFailure(
      partialBreakdown,
      'experience',
      error
    );

    // Should have all dimension scores
    expect(result.keywordScore).toBe(0.8);
    expect(result.skillsScore).toBe(0.9);
    expect(result.attributesScore).toBe(0.7);
    expect(result.experienceScore).toBe(0); // Failed dimension set to 0
    expect(result.levelScore).toBe(0.6);

    // Weights should be recalculated
    expect(result.weights.experience).toBe(0);
    
    // Remaining weights should sum to 1.0
    const weightSum =
      result.weights.keywords +
      result.weights.skills +
      result.weights.attributes +
      result.weights.level;
    expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.01);
  });

  it('should return minimal structure on parsing failure', () => {
    const error = new Error('Parsing failed');
    const result = GracefulDegradation.handleParsingFailure('job', 'raw text', error);

    expect(result.elements).toEqual([]);
    expect(result.rawText).toBe('raw text');
    expect(result.metadata.parsingFailed).toBe(true);
    expect(result.metadata.error).toBeDefined();
  });

  it('should return minimal recommendations on generation failure', () => {
    const error = new Error('Recommendation generation failed');
    const result = GracefulDegradation.handleRecommendationGenerationFailure(
      error,
      1,
      0.6,
      0.8
    );

    expect(result.summary).toBeDefined();
    expect(result.priority).toEqual([]);
    expect(result.optional).toEqual([]);
    expect(result.rewording).toEqual([]);
    expect(result.metadata.generationFailed).toBe(true);
  });

  it('should wrap async operation with graceful degradation', async () => {
    const operation = async () => {
      throw new Error('Operation failed');
    };

    const fallback = () => 'fallback value';

    const result = await GracefulDegradation.withGracefulDegradation(
      operation,
      fallback,
      'test_operation'
    );

    expect(result).toBe('fallback value');

    // Should log the error
    const logs = ATSLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should wrap sync operation with graceful degradation', () => {
    const operation = () => {
      throw new Error('Operation failed');
    };

    const fallback = () => 42;

    const result = GracefulDegradation.withGracefulDegradationSync(
      operation,
      fallback,
      'test_operation'
    );

    expect(result).toBe(42);

    // Should log the error
    const logs = ATSLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Error Message Generation Tests
// ============================================================================

describe('Error Message Generation', () => {
  it('should generate descriptive error messages', () => {
    const error = ATSErrorFactory.invalidJobPosting([
      { field: 'title', message: 'Title is required' }
    ]);

    expect(error.userMessage).toContain('validation failed');
    expect(error.technicalDetails).toContain('required fields');
  });

  it('should include suggested actions in errors', () => {
    const errors = [
      ATSErrorFactory.invalidInput('field', 'message'),
      ATSErrorFactory.obsidianUnavailable('details'),
      ATSErrorFactory.parsingFailed('job', 'reason'),
      ATSErrorFactory.agentTimeout('agent', 30000)
    ];

    for (const error of errors) {
      expect(error.suggestedAction).toBeDefined();
      expect(error.suggestedAction!.length).toBeGreaterThan(0);
    }
  });

  it('should mark appropriate errors as retryable', () => {
    const retryableErrors = [
      ATSErrorFactory.obsidianUnavailable('details'),
      ATSErrorFactory.semanticAnalysisFailed('reason'),
      ATSErrorFactory.agentTimeout('agent', 30000),
      ATSErrorFactory.rateLimitExceeded('details')
    ];

    for (const error of retryableErrors) {
      expect(error.retryable).toBe(true);
    }
  });

  it('should mark appropriate errors as non-retryable', () => {
    const nonRetryableErrors = [
      ATSErrorFactory.invalidInput('field', 'message'),
      ATSErrorFactory.invalidJobPosting([]),
      ATSErrorFactory.parsingFailed('job', 'reason'),
      ATSErrorFactory.resumeNotFound('id')
    ];

    for (const error of nonRetryableErrors) {
      expect(error.retryable).toBe(false);
    }
  });
});
