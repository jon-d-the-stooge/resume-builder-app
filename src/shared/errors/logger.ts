/**
 * Error Logger
 * 
 * Error logging utilities for tracking and debugging errors.
 * Shared across resume-content-ingestion and ats-agent features.
 */

import { ErrorInfo, AppError, ErrorCategory, ErrorSeverity } from './types';

/**
 * Error logger class for managing error logs
 */
export class ErrorLogger {
  private static logs: ErrorInfo[] = [];
  private static maxLogs = 1000;

  /**
   * Log an error with technical details
   */
  static logError(error: AppError | Error): void {
    const errorInfo: ErrorInfo = error instanceof AppError
      ? {
          category: error.category,
          severity: error.severity,
          userMessage: error.userMessage,
          technicalDetails: error.technicalDetails,
          timestamp: error.timestamp,
          context: error.context,
          recoverable: error.recoverable,
          suggestedAction: error.suggestedAction
        }
      : {
          category: ErrorCategory.UNEXPECTED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'An unexpected error occurred',
          technicalDetails: error.message,
          timestamp: new Date(),
          recoverable: false
        };

    this.logs.push(errorInfo);
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Error]', {
        category: errorInfo.category,
        severity: errorInfo.severity,
        message: errorInfo.userMessage,
        details: errorInfo.technicalDetails,
        context: errorInfo.context
      });
    }
  }

  /**
   * Get all logged errors
   */
  static getLogs(): ErrorInfo[] {
    return [...this.logs];
  }

  /**
   * Clear error logs
   */
  static clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get logs by category
   */
  static getLogsByCategory(category: ErrorCategory): ErrorInfo[] {
    return this.logs.filter(log => log.category === category);
  }

  /**
   * Get logs by severity
   */
  static getLogsBySeverity(severity: ErrorSeverity): ErrorInfo[] {
    return this.logs.filter(log => log.severity === severity);
  }

  /**
   * Get recent logs (last N entries)
   */
  static getRecentLogs(count: number): ErrorInfo[] {
    return this.logs.slice(-count);
  }
}
