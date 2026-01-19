/**
 * Error Handler
 * 
 * Standardized error handling utilities for consistent error management.
 * Shared across resume-content-ingestion and ats-agent features.
 */

import { AppError, ErrorCategory, ErrorSeverity } from './types';
import { ErrorLogger } from './logger';

/**
 * Error handler class for managing errors throughout the application
 */
export class ErrorHandler {
  /**
   * Create a file handling error
   */
  static createFileError(
    message: string,
    technicalDetails: string,
    context?: Record<string, any>
  ): AppError {
    return new AppError({
      category: ErrorCategory.FILE_HANDLING,
      severity: ErrorSeverity.MEDIUM,
      userMessage: message,
      technicalDetails,
      timestamp: new Date(),
      context,
      recoverable: true,
      suggestedAction: this.getFileErrorSuggestion(technicalDetails)
    });
  }

  /**
   * Create a parsing error
   */
  static createParsingError(
    message: string,
    technicalDetails: string,
    context?: Record<string, any>
  ): AppError {
    return new AppError({
      category: ErrorCategory.PARSING,
      severity: ErrorSeverity.MEDIUM,
      userMessage: message,
      technicalDetails,
      timestamp: new Date(),
      context,
      recoverable: true,
      suggestedAction: 'You can manually enter the content or try uploading a different format.'
    });
  }

  /**
   * Create a storage error
   */
  static createStorageError(
    message: string,
    technicalDetails: string,
    context?: Record<string, any>
  ): AppError {
    return new AppError({
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.HIGH,
      userMessage: message,
      technicalDetails,
      timestamp: new Date(),
      context,
      recoverable: false,
      suggestedAction: 'Please check your Obsidian vault connection and try again.'
    });
  }

  /**
   * Create a validation error
   */
  static createValidationError(
    message: string,
    technicalDetails: string,
    context?: Record<string, any>
  ): AppError {
    return new AppError({
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      userMessage: message,
      technicalDetails,
      timestamp: new Date(),
      context,
      recoverable: true,
      suggestedAction: 'Please correct the highlighted fields and try again.'
    });
  }

  /**
   * Create a network error
   */
  static createNetworkError(
    message: string,
    technicalDetails: string,
    context?: Record<string, any>
  ): AppError {
    return new AppError({
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      userMessage: message,
      technicalDetails,
      timestamp: new Date(),
      context,
      recoverable: true,
      suggestedAction: 'Please check your internet connection and try again.'
    });
  }

  /**
   * Create an unexpected error
   */
  static createUnexpectedError(
    error: unknown,
    context?: Record<string, any>
  ): AppError {
    const message = error instanceof Error ? error.message : String(error);
    return new AppError({
      category: ErrorCategory.UNEXPECTED,
      severity: ErrorSeverity.CRITICAL,
      userMessage: 'An unexpected error occurred. Please try again.',
      technicalDetails: message,
      timestamp: new Date(),
      context,
      recoverable: false,
      suggestedAction: 'If the problem persists, please contact support.'
    });
  }

  /**
   * Log an error with technical details
   */
  static logError(error: AppError | Error): void {
    ErrorLogger.logError(error);
  }

  /**
   * Get all logged errors
   */
  static getLogs() {
    return ErrorLogger.getLogs();
  }

  /**
   * Clear error logs
   */
  static clearLogs(): void {
    ErrorLogger.clearLogs();
  }

  /**
   * Format error message for display to user
   */
  static formatUserMessage(error: AppError | Error): string {
    if (error instanceof AppError) {
      let message = error.userMessage;
      if (error.suggestedAction) {
        message += `\n\n${error.suggestedAction}`;
      }
      return message;
    }
    return error.message;
  }

  /**
   * Get suggested action for file errors
   */
  private static getFileErrorSuggestion(technicalDetails: string): string {
    if (technicalDetails.includes('format')) {
      return 'Please upload a PDF, DOCX, or TXT file.';
    }
    if (technicalDetails.includes('size')) {
      return 'Please upload a file smaller than 10MB.';
    }
    if (technicalDetails.includes('corrupted') || technicalDetails.includes('read')) {
      return 'The file may be corrupted. Please try re-uploading or use a different file.';
    }
    if (technicalDetails.includes('permission')) {
      return 'Please check file permissions and try again.';
    }
    return 'Please check the file and try again.';
  }

  /**
   * Retry logic for transient failures
   */
  static async retry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      delayMs?: number;
      backoffMultiplier?: number;
      shouldRetry?: (error: Error) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      delayMs = 1000,
      backoffMultiplier = 2,
      shouldRetry = () => true
    } = options;

    let lastError: Error;
    let currentDelay = delayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry if we've exhausted attempts or if error is not retryable
        if (attempt === maxAttempts || !shouldRetry(lastError)) {
          throw lastError;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= backoffMultiplier;
      }
    }

    throw lastError!;
  }

  /**
   * Determine if an error is retryable
   */
  static isRetryable(error: Error | AppError): boolean {
    if (error instanceof AppError) {
      return error.recoverable && (
        error.category === ErrorCategory.NETWORK ||
        error.category === ErrorCategory.PARSING
      );
    }
    
    // Check for common retryable error patterns
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('rate limit') ||
      message.includes('temporary')
    );
  }

  /**
   * Wrap an operation with error handling
   */
  static async handleAsync<T>(
    operation: () => Promise<T>,
    errorFactory: (error: unknown) => AppError
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = errorFactory(error);
      this.logError(appError);
      throw appError;
    }
  }

  /**
   * Wrap a synchronous operation with error handling
   */
  static handle<T>(
    operation: () => T,
    errorFactory: (error: unknown) => AppError
  ): T {
    try {
      return operation();
    } catch (error) {
      const appError = errorFactory(error);
      this.logError(appError);
      throw appError;
    }
  }
}
