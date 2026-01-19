/**
 * Error Types
 * 
 * Type definitions for error codes and error structures.
 * Shared across resume-content-ingestion and ats-agent features.
 */

/**
 * Error categories for different types of failures
 */
export enum ErrorCategory {
  FILE_HANDLING = 'FILE_HANDLING',
  PARSING = 'PARSING',
  STORAGE = 'STORAGE',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  UNEXPECTED = 'UNEXPECTED'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  category: ErrorCategory;
  severity: ErrorSeverity;
  userMessage: string;
  technicalDetails: string;
  timestamp: Date;
  context?: Record<string, any>;
  recoverable: boolean;
  suggestedAction?: string;
}

/**
 * Custom error class with additional context
 */
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly userMessage: string;
  public readonly technicalDetails: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;
  public readonly recoverable: boolean;
  public readonly suggestedAction?: string;

  constructor(info: ErrorInfo) {
    super(info.userMessage);
    this.name = 'AppError';
    this.category = info.category;
    this.severity = info.severity;
    this.userMessage = info.userMessage;
    this.technicalDetails = info.technicalDetails;
    this.timestamp = info.timestamp;
    this.context = info.context;
    this.recoverable = info.recoverable;
    this.suggestedAction = info.suggestedAction;
  }
}
