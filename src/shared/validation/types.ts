/**
 * Validation Types
 * 
 * Type definitions for validation results and errors.
 */

/**
 * Validation error for a specific field
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Result of validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
