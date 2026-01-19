/**
 * Error Formatter
 * 
 * Formats validation errors into descriptive error messages.
 */

import type { ValidationResult, ValidationError } from '../../shared/validation/types';
import type { ErrorResponse } from '../types';

/**
 * Formats validation errors into a descriptive error response
 * @param validationResult - The validation result with errors
 * @param context - Context about what was being validated
 * @returns Formatted error response
 */
export function formatValidationError(
  validationResult: ValidationResult,
  context: string
): ErrorResponse {
  if (validationResult.isValid) {
    throw new Error('Cannot format validation error for valid result');
  }

  const errorMessages = validationResult.errors.map(err => 
    `${err.field}: ${err.message}`
  ).join('; ');

  return {
    error: 'INVALID_INPUT',
    message: `${context} validation failed: ${errorMessages}`,
    details: validationResult.errors,
    timestamp: new Date().toISOString()
  };
}

/**
 * Formats a single validation error into a descriptive message
 * @param error - The validation error
 * @returns Formatted error message
 */
export function formatSingleError(error: ValidationError): string {
  return `Field '${error.field}': ${error.message}`;
}

/**
 * Creates a descriptive error message for missing required fields
 * @param field - The missing field name
 * @returns Formatted error response
 */
export function createMissingFieldError(field: string): ErrorResponse {
  return {
    error: 'INVALID_INPUT',
    message: `Required field missing: ${field}`,
    details: { field, message: `${field} is required` },
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a descriptive error message for invalid field values
 * @param field - The invalid field name
 * @param received - The received value
 * @param expected - Description of expected value
 * @returns Formatted error response
 */
export function createInvalidFieldError(
  field: string,
  received: any,
  expected: string
): ErrorResponse {
  return {
    error: 'INVALID_INPUT',
    message: `Invalid value for field '${field}': expected ${expected}`,
    details: { field, received, expected },
    timestamp: new Date().toISOString()
  };
}

