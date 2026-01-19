/**
 * Tests for shared error handling utilities
 * Verifies that shared error handler works correctly for both features
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ErrorHandler,
  ErrorLogger,
  ErrorCategory,
  ErrorSeverity,
  AppError
} from '../../shared/errors';

describe('Shared Error Handler', () => {
  beforeEach(() => {
    ErrorLogger.clearLogs();
  });

  describe('Error Creation', () => {
    it('should create file handling errors', () => {
      const error = ErrorHandler.createFileError(
        'Invalid file',
        'File format not supported',
        { fileName: 'test.exe' }
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error.category).toBe(ErrorCategory.FILE_HANDLING);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(true);
      expect(error.suggestedAction).toBeDefined();
    });

    it('should create parsing errors', () => {
      const error = ErrorHandler.createParsingError(
        'Parse failed',
        'Invalid JSON',
        { line: 42 }
      );

      expect(error.category).toBe(ErrorCategory.PARSING);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(true);
    });

    it('should create storage errors', () => {
      const error = ErrorHandler.createStorageError(
        'Storage failed',
        'Vault unavailable',
        { vault: 'test-vault' }
      );

      expect(error.category).toBe(ErrorCategory.STORAGE);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(false);
    });

    it('should create validation errors', () => {
      const error = ErrorHandler.createValidationError(
        'Validation failed',
        'Missing required field',
        { field: 'email' }
      );

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.recoverable).toBe(true);
    });

    it('should create network errors', () => {
      const error = ErrorHandler.createNetworkError(
        'Network failed',
        'Connection timeout',
        { url: 'https://api.example.com' }
      );

      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(true);
    });

    it('should create unexpected errors', () => {
      const originalError = new Error('Something went wrong');
      const error = ErrorHandler.createUnexpectedError(
        originalError,
        { operation: 'test' }
      );

      expect(error.category).toBe(ErrorCategory.UNEXPECTED);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.recoverable).toBe(false);
      expect(error.technicalDetails).toBe('Something went wrong');
    });
  });

  describe('Error Logging', () => {
    it('should log errors', () => {
      const error = ErrorHandler.createValidationError(
        'Test error',
        'Details',
        { test: true }
      );

      ErrorHandler.logError(error);

      const logs = ErrorLogger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].category).toBe(ErrorCategory.VALIDATION);
      expect(logs[0].userMessage).toBe('Test error');
    });

    it('should get logs by category', () => {
      ErrorHandler.logError(
        ErrorHandler.createValidationError('Val error', 'Details')
      );
      ErrorHandler.logError(
        ErrorHandler.createParsingError('Parse error', 'Details')
      );
      ErrorHandler.logError(
        ErrorHandler.createValidationError('Val error 2', 'Details')
      );

      const validationLogs = ErrorLogger.getLogsByCategory(ErrorCategory.VALIDATION);
      expect(validationLogs.length).toBe(2);
    });

    it('should get logs by severity', () => {
      ErrorHandler.logError(
        ErrorHandler.createValidationError('Low', 'Details')
      );
      ErrorHandler.logError(
        ErrorHandler.createStorageError('High', 'Details')
      );

      const highSeverityLogs = ErrorLogger.getLogsBySeverity(ErrorSeverity.HIGH);
      expect(highSeverityLogs.length).toBe(1);
    });

    it('should get recent logs', () => {
      for (let i = 0; i < 10; i++) {
        ErrorHandler.logError(
          ErrorHandler.createValidationError(`Error ${i}`, 'Details')
        );
      }

      const recentLogs = ErrorLogger.getRecentLogs(3);
      expect(recentLogs.length).toBe(3);
      expect(recentLogs[2].userMessage).toBe('Error 9');
    });

    it('should clear logs', () => {
      ErrorHandler.logError(
        ErrorHandler.createValidationError('Test', 'Details')
      );
      expect(ErrorLogger.getLogs().length).toBe(1);

      ErrorLogger.clearLogs();
      expect(ErrorLogger.getLogs().length).toBe(0);
    });
  });

  describe('Error Formatting', () => {
    it('should format error messages with suggested actions', () => {
      const error = ErrorHandler.createFileError(
        'Invalid file',
        'File format not supported'
      );

      const formatted = ErrorHandler.formatUserMessage(error);
      expect(formatted).toContain('Invalid file');
      expect(formatted).toContain(error.suggestedAction!);
    });

    it('should format regular errors', () => {
      const error = new Error('Regular error');
      const formatted = ErrorHandler.formatUserMessage(error);
      expect(formatted).toBe('Regular error');
    });
  });

  describe('Retry Logic', () => {
    it('should retry operations', async () => {
      let attempts = 0;
      const result = await ErrorHandler.retry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Transient failure');
          }
          return 'success';
        },
        { maxAttempts: 3, delayMs: 10 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should respect shouldRetry predicate', async () => {
      let attempts = 0;
      
      try {
        await ErrorHandler.retry(
          async () => {
            attempts++;
            throw ErrorHandler.createValidationError('Invalid', 'Details');
          },
          {
            maxAttempts: 3,
            delayMs: 10,
            shouldRetry: (error) => ErrorHandler.isRetryable(error)
          }
        );
        expect.fail('Should have thrown');
      } catch (error) {
        expect(attempts).toBe(1); // Should not retry validation errors
      }
    });
  });

  describe('Retryable Detection', () => {
    it('should identify retryable errors', () => {
      const networkError = ErrorHandler.createNetworkError('Network', 'Details');
      expect(ErrorHandler.isRetryable(networkError)).toBe(true);

      const parsingError = ErrorHandler.createParsingError('Parse', 'Details');
      expect(ErrorHandler.isRetryable(parsingError)).toBe(true);

      const validationError = ErrorHandler.createValidationError('Val', 'Details');
      expect(ErrorHandler.isRetryable(validationError)).toBe(false);

      const storageError = ErrorHandler.createStorageError('Storage', 'Details');
      expect(ErrorHandler.isRetryable(storageError)).toBe(false);
    });

    it('should identify retryable error messages', () => {
      const timeoutError = new Error('Request timeout');
      expect(ErrorHandler.isRetryable(timeoutError)).toBe(true);

      const rateLimitError = new Error('Rate limit exceeded');
      expect(ErrorHandler.isRetryable(rateLimitError)).toBe(true);

      const validationError = new Error('Invalid input');
      expect(ErrorHandler.isRetryable(validationError)).toBe(false);
    });
  });

  describe('Error Wrapping', () => {
    it('should wrap async operations', async () => {
      const errorFactory = (error: unknown) =>
        ErrorHandler.createParsingError('Parse failed', String(error));

      try {
        await ErrorHandler.handleAsync(
          async () => {
            throw new Error('Test error');
          },
          errorFactory
        );
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).category).toBe(ErrorCategory.PARSING);
      }

      const logs = ErrorLogger.getLogs();
      expect(logs.length).toBe(1);
    });

    it('should wrap sync operations', () => {
      const errorFactory = (error: unknown) =>
        ErrorHandler.createValidationError('Validation failed', String(error));

      try {
        ErrorHandler.handle(
          () => {
            throw new Error('Test error');
          },
          errorFactory
        );
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).category).toBe(ErrorCategory.VALIDATION);
      }

      const logs = ErrorLogger.getLogs();
      expect(logs.length).toBe(1);
    });
  });
});
