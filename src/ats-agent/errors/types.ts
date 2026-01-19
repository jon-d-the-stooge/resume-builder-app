/**
 * ATS Agent Error Types
 * 
 * Error codes and response structures specific to ATS Agent operations.
 * Extends shared error types from src/shared/errors/types.ts
 * 
 * Requirement 8.4: Descriptive error messages
 */

import { AppError, ErrorCategory, ErrorSeverity } from '../../shared/errors/types';

/**
 * ATS-specific error codes
 */
export enum ATSErrorCode {
  // Input validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_JOB_POSTING = 'INVALID_JOB_POSTING',
  INVALID_RESUME = 'INVALID_RESUME',
  INVALID_RECOMMENDATIONS = 'INVALID_RECOMMENDATIONS',
  
  // Parsing errors
  PARSING_FAILED = 'PARSING_FAILED',
  JOB_PARSING_FAILED = 'JOB_PARSING_FAILED',
  RESUME_PARSING_FAILED = 'RESUME_PARSING_FAILED',
  
  // Integration errors
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  OBSIDIAN_UNAVAILABLE = 'OBSIDIAN_UNAVAILABLE',
  RESUME_NOT_FOUND = 'RESUME_NOT_FOUND',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  AGENT_COMMUNICATION_FAILED = 'AGENT_COMMUNICATION_FAILED',
  
  // Semantic analysis errors
  SEMANTIC_ANALYSIS_FAILED = 'SEMANTIC_ANALYSIS_FAILED',
  TAGGING_FAILED = 'TAGGING_FAILED',
  MATCHING_FAILED = 'MATCHING_FAILED',
  
  // Scoring errors
  SCORING_ERROR = 'SCORING_ERROR',
  IMPORTANCE_SCORING_FAILED = 'IMPORTANCE_SCORING_FAILED',
  MATCH_SCORING_FAILED = 'MATCH_SCORING_FAILED',
  
  // Recommendation errors
  RECOMMENDATION_GENERATION_FAILED = 'RECOMMENDATION_GENERATION_FAILED',
  
  // Iteration errors
  ITERATION_FAILED = 'ITERATION_FAILED',
  MAX_ITERATIONS_EXCEEDED = 'MAX_ITERATIONS_EXCEEDED',
  
  // General errors
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string;
  message: string;
  received?: any;
  expected?: string;
}

/**
 * Error response structure for external communication
 */
export interface ErrorResponse {
  error: ATSErrorCode;
  message: string;
  details?: any;
  timestamp: string;
  request_id?: string;
  validation_errors?: ValidationError[];
  retryable?: boolean;
  suggested_action?: string;
}

/**
 * ATS-specific error class
 */
export class ATSError extends AppError {
  public readonly code: ATSErrorCode;
  public readonly validationErrors?: ValidationError[];
  public readonly retryable: boolean;

  constructor(
    code: ATSErrorCode,
    userMessage: string,
    technicalDetails: string,
    options?: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      context?: Record<string, any>;
      validationErrors?: ValidationError[];
      retryable?: boolean;
      suggestedAction?: string;
    }
  ) {
    super({
      category: options?.category || ErrorCategory.UNEXPECTED,
      severity: options?.severity || ErrorSeverity.MEDIUM,
      userMessage,
      technicalDetails,
      timestamp: new Date(),
      context: options?.context,
      recoverable: options?.retryable ?? false,
      suggestedAction: options?.suggestedAction
    });

    this.name = 'ATSError';
    this.code = code;
    this.validationErrors = options?.validationErrors;
    this.retryable = options?.retryable ?? false;
  }

  /**
   * Convert to error response format
   */
  toErrorResponse(requestId?: string): ErrorResponse {
    return {
      error: this.code,
      message: this.userMessage,
      details: this.technicalDetails,
      timestamp: this.timestamp.toISOString(),
      request_id: requestId,
      validation_errors: this.validationErrors,
      retryable: this.retryable,
      suggested_action: this.suggestedAction
    };
  }
}

/**
 * Factory functions for common error types
 */
export class ATSErrorFactory {
  /**
   * Create invalid input error
   */
  static invalidInput(
    field: string,
    message: string,
    received?: any
  ): ATSError {
    return new ATSError(
      ATSErrorCode.INVALID_INPUT,
      `Invalid input: ${field}`,
      message,
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        validationErrors: [{ field, message, received }],
        retryable: false,
        suggestedAction: 'Check input format and required fields'
      }
    );
  }

  /**
   * Create job posting validation error
   */
  static invalidJobPosting(
    validationErrors: ValidationError[]
  ): ATSError {
    return new ATSError(
      ATSErrorCode.INVALID_JOB_POSTING,
      'Job posting validation failed',
      `Job posting is missing required fields or has invalid data`,
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        validationErrors,
        retryable: false,
        suggestedAction: 'Ensure job posting has id, title, and description fields'
      }
    );
  }

  /**
   * Create resume validation error
   */
  static invalidResume(
    validationErrors: ValidationError[]
  ): ATSError {
    return new ATSError(
      ATSErrorCode.INVALID_RESUME,
      'Resume validation failed',
      `Resume is missing required fields or has invalid data`,
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        validationErrors,
        retryable: false,
        suggestedAction: 'Ensure resume has id and content fields'
      }
    );
  }

  /**
   * Create parsing error
   */
  static parsingFailed(
    type: 'job' | 'resume',
    reason: string,
    context?: Record<string, any>
  ): ATSError {
    return new ATSError(
      type === 'job' ? ATSErrorCode.JOB_PARSING_FAILED : ATSErrorCode.RESUME_PARSING_FAILED,
      `Failed to parse ${type}`,
      reason,
      {
        category: ErrorCategory.PARSING,
        severity: ErrorSeverity.HIGH,
        context,
        retryable: false,
        suggestedAction: 'Check text format and encoding'
      }
    );
  }

  /**
   * Create Obsidian unavailable error
   */
  static obsidianUnavailable(
    details: string
  ): ATSError {
    return new ATSError(
      ATSErrorCode.OBSIDIAN_UNAVAILABLE,
      'Obsidian vault is unavailable',
      details,
      {
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        suggestedAction: 'Check Obsidian connection and try again'
      }
    );
  }

  /**
   * Create resume not found error
   */
  static resumeNotFound(
    resumeId: string
  ): ATSError {
    return new ATSError(
      ATSErrorCode.RESUME_NOT_FOUND,
      'Resume not found in Obsidian vault',
      `Resume with id ${resumeId} does not exist`,
      {
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.MEDIUM,
        context: { resumeId },
        retryable: false,
        suggestedAction: 'Verify resume ID and ensure resume exists in vault'
      }
    );
  }

  /**
   * Create semantic analysis error
   */
  static semanticAnalysisFailed(
    reason: string,
    context?: Record<string, any>
  ): ATSError {
    return new ATSError(
      ATSErrorCode.SEMANTIC_ANALYSIS_FAILED,
      'Semantic analysis failed',
      reason,
      {
        category: ErrorCategory.PARSING,
        severity: ErrorSeverity.MEDIUM,
        context,
        retryable: true,
        suggestedAction: 'Will fall back to basic keyword matching'
      }
    );
  }

  /**
   * Create scoring error
   */
  static scoringFailed(
    reason: string,
    context?: Record<string, any>
  ): ATSError {
    return new ATSError(
      ATSErrorCode.SCORING_ERROR,
      'Match score calculation failed',
      reason,
      {
        category: ErrorCategory.PARSING,
        severity: ErrorSeverity.HIGH,
        context,
        retryable: false,
        suggestedAction: 'Check that resume and job have valid elements'
      }
    );
  }

  /**
   * Create agent timeout error
   */
  static agentTimeout(
    agentName: string,
    timeoutMs: number
  ): ATSError {
    return new ATSError(
      ATSErrorCode.AGENT_TIMEOUT,
      `Communication with ${agentName} timed out`,
      `No response received within ${timeoutMs}ms`,
      {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        context: { agentName, timeoutMs },
        retryable: true,
        suggestedAction: 'Retry the operation or increase timeout'
      }
    );
  }

  /**
   * Create rate limit error
   */
  static rateLimitExceeded(
    details: string
  ): ATSError {
    return new ATSError(
      ATSErrorCode.RATE_LIMIT,
      'Rate limit exceeded',
      details,
      {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        suggestedAction: 'Wait before retrying'
      }
    );
  }

  /**
   * Create configuration error
   */
  static configurationError(
    field: string,
    reason: string
  ): ATSError {
    return new ATSError(
      ATSErrorCode.CONFIGURATION_ERROR,
      'Configuration error',
      `Invalid configuration for ${field}: ${reason}`,
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.CRITICAL,
        context: { field },
        retryable: false,
        suggestedAction: 'Check configuration settings'
      }
    );
  }
}
