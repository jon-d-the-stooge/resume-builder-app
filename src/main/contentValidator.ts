import { ContentItemInput } from '../types';
import { 
  contentValidator as sharedValidator,
  ValidationResult as SharedValidationResult,
  ValidationError as SharedValidationError
} from '../shared/validation';

/**
 * Validation error for a specific field
 * @deprecated Use ValidationError from '../shared/validation' instead
 */
export interface ValidationError extends SharedValidationError {}

/**
 * Result of content item validation
 * @deprecated Use ValidationResult from '../shared/validation' instead
 */
export interface ContentValidationResult extends SharedValidationResult {}

/**
 * Content Validator
 * Validates content items for required fields, date formats, and metadata structure
 * 
 * @deprecated Use contentValidator from '../shared/validation' instead
 * This class now delegates to the shared validator for consistency across features.
 */
export class ContentValidator {
  /**
   * Validates a content item input
   * @param item - The content item to validate
   * @returns Validation result with specific errors for each invalid field
   */
  validate(item: ContentItemInput): ContentValidationResult {
    return sharedValidator.validate(item);
  }

  /**
   * Checks if a string is a valid ISO 8601 date (YYYY-MM-DD)
   * @param dateString - The date string to validate
   * @returns True if valid ISO date
   */
  isValidISODate(dateString: string): boolean {
    return sharedValidator.isValidISODate(dateString);
  }
}

// Export singleton instance
export const contentValidator = new ContentValidator();
