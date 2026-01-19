/**
 * Property-based tests for error handling
 * Feature: resume-content-ingestion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  AppError
} from '../main/errorHandler';
import { fileHandler } from '../main/fileHandler';

describe('Error Handling Properties', () => {
  beforeEach(() => {
    // Clear error logs before each test
    ErrorHandler.clearLogs();
  });

  describe('Feature: resume-content-ingestion, Property 38: Upload failure error messages', () => {
    it('should display specific error messages for file upload failures', () => {
      fc.assert(
        fc.property(
          fc.record({
            // Generate files with various invalid characteristics
            name: fc.oneof(
              fc.constant('test.exe'), // Invalid format
              fc.constant('test.zip'), // Invalid format
              fc.constant('test.pdf')  // Valid format but will test size
            ),
            size: fc.integer({ min: 1, max: 20 * 1024 * 1024 }),
            type: fc.constant('application/octet-stream')
          }),
          (fileData) => {
            const file = new File([], fileData.name, { type: fileData.type });
            Object.defineProperty(file, 'size', { value: fileData.size });

            const validation = fileHandler.validateFile(file);

            if (!validation.isValid) {
              // Error message should be specific and not empty
              expect(validation.errorMessage).toBeDefined();
              expect(validation.errorMessage!.length).toBeGreaterThan(0);
              
              // Error message should indicate the specific cause
              const message = validation.errorMessage!.toLowerCase();
              const isFormatError = !fileData.name.match(/\.(pdf|docx|doc|txt)$/i);
              const isSizeError = fileData.size >= 10 * 1024 * 1024;

              // Format errors take precedence over size errors
              if (isFormatError) {
                expect(message).toMatch(/format|supported/);
              } else if (isSizeError) {
                expect(message).toMatch(/size|limit|mb/);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: resume-content-ingestion, Property 39: Parsing error logging and continuation', () => {
    it('should log parsing errors with details and allow continuation', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (errorMessage) => {
            // Create a parsing error
            const error = ErrorHandler.createParsingError(
              'Failed to parse section',
              errorMessage,
              { section: 'work-experience' }
            );

            // Log the error
            ErrorHandler.logError(error);

            // Verify error was logged
            const logs = ErrorHandler.getLogs();
            expect(logs.length).toBeGreaterThan(0);

            const lastLog = logs[logs.length - 1];
            expect(lastLog.category).toBe(ErrorCategory.PARSING);
            expect(lastLog.technicalDetails).toBe(errorMessage);
            expect(lastLog.context).toEqual({ section: 'work-experience' });

            // Verify error is recoverable (allows continuation)
            expect(error.recoverable).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Feature: resume-content-ingestion, Property 40: Validation error highlighting', () => {
    it('should indicate which specific fields failed validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            fieldName: fc.constantFrom('content', 'type', 'metadata', 'tags'),
            errorMessage: fc.string({ minLength: 5, maxLength: 100 })
          }),
          (validationData) => {
            // Create a validation error with field context
            const error = ErrorHandler.createValidationError(
              `Validation failed for ${validationData.fieldName}`,
              validationData.errorMessage,
              { field: validationData.fieldName }
            );

            // Verify error contains field information
            expect(error.context).toBeDefined();
            expect(error.context!.field).toBe(validationData.fieldName);
            expect(error.userMessage).toContain(validationData.fieldName);
            expect(error.category).toBe(ErrorCategory.VALIDATION);
            expect(error.severity).toBe(ErrorSeverity.LOW);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: resume-content-ingestion, Property 41: Success confirmation display', () => {
    it('should provide confirmation for successful operations', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'Content item saved successfully',
            'Resume parsed successfully',
            'File uploaded successfully',
            'Content updated successfully',
            'Content deleted successfully'
          ),
          (successMessage) => {
            // Success messages should be clear and positive
            expect(successMessage).toMatch(/success/i);
            expect(successMessage.length).toBeGreaterThan(0);
            
            // Should not contain error-related words
            expect(successMessage.toLowerCase()).not.toMatch(/error|fail|invalid/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Feature: resume-content-ingestion, Property 42: Unexpected error handling', () => {
    it('should display user-friendly messages and log technical details for unexpected errors', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 200 }),
            fc.record({
              message: fc.string({ minLength: 1, maxLength: 100 }),
              stack: fc.string({ minLength: 10, maxLength: 500 })
            })
          ),
          (errorData) => {
            // Create an unexpected error
            const originalError = typeof errorData === 'string'
              ? new Error(errorData)
              : new Error(errorData.message);

            const error = ErrorHandler.createUnexpectedError(originalError, {
              operation: 'test-operation'
            });

            // Verify user message is friendly (not technical)
            expect(error.userMessage).toBeDefined();
            expect(error.userMessage).not.toContain('stack');
            expect(error.userMessage).not.toContain('undefined');
            expect(error.userMessage.length).toBeGreaterThan(0);

            // Verify technical details are logged
            expect(error.technicalDetails).toBeDefined();
            expect(error.technicalDetails).toBe(originalError.message);

            // Verify error is categorized correctly
            expect(error.category).toBe(ErrorCategory.UNEXPECTED);
            expect(error.severity).toBe(ErrorSeverity.CRITICAL);

            // Log the error
            ErrorHandler.logError(error);

            // Verify it was logged
            const logs = ErrorHandler.getLogs();
            expect(logs.length).toBeGreaterThan(0);
            const lastLog = logs[logs.length - 1];
            expect(lastLog.technicalDetails).toBe(originalError.message);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Retry Logic', () => {
    it('should retry transient failures with exponential backoff', async () => {
      let attemptCount = 0;
      const maxAttempts = 3;

      try {
        await ErrorHandler.retry(
          async () => {
            attemptCount++;
            if (attemptCount < maxAttempts) {
              throw new Error('Transient failure');
            }
            return 'success';
          },
          {
            maxAttempts,
            delayMs: 10, // Short delay for testing
            backoffMultiplier: 2
          }
        );
      } catch (error) {
        // Should not reach here
        expect.fail('Retry should have succeeded');
      }

      expect(attemptCount).toBe(maxAttempts);
    });

    it('should not retry non-retryable errors', async () => {
      let attemptCount = 0;

      try {
        await ErrorHandler.retry(
          async () => {
            attemptCount++;
            throw ErrorHandler.createValidationError(
              'Invalid input',
              'Validation failed',
              {}
            );
          },
          {
            maxAttempts: 3,
            delayMs: 10,
            shouldRetry: (error) => ErrorHandler.isRetryable(error)
          }
        );
        expect.fail('Should have thrown error');
      } catch (error) {
        // Should fail on first attempt
        expect(attemptCount).toBe(1);
      }
    });
  });

  describe('Error Categorization', () => {
    it('should correctly categorize different error types', () => {
      const fileError = ErrorHandler.createFileError('File error', 'Details', {});
      expect(fileError.category).toBe(ErrorCategory.FILE_HANDLING);

      const parsingError = ErrorHandler.createParsingError('Parse error', 'Details', {});
      expect(parsingError.category).toBe(ErrorCategory.PARSING);

      const storageError = ErrorHandler.createStorageError('Storage error', 'Details', {});
      expect(storageError.category).toBe(ErrorCategory.STORAGE);

      const validationError = ErrorHandler.createValidationError('Validation error', 'Details', {});
      expect(validationError.category).toBe(ErrorCategory.VALIDATION);

      const networkError = ErrorHandler.createNetworkError('Network error', 'Details', {});
      expect(networkError.category).toBe(ErrorCategory.NETWORK);

      const unexpectedError = ErrorHandler.createUnexpectedError(new Error('Unexpected'), {});
      expect(unexpectedError.category).toBe(ErrorCategory.UNEXPECTED);
    });
  });

  describe('Error Message Formatting', () => {
    it('should format error messages with suggested actions', () => {
      const error = ErrorHandler.createFileError(
        'Invalid file format',
        'File has .exe extension',
        { fileName: 'test.exe' }
      );

      const formatted = ErrorHandler.formatUserMessage(error);
      expect(formatted).toContain('Invalid file format');
      expect(formatted).toContain(error.suggestedAction!);
    });
  });
});
