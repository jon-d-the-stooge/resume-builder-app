/**
 * Validator Utilities
 * 
 * Common validation utilities using Zod for schema validation.
 * Provides reusable validators for both features.
 */

import { z } from 'zod';
import { ValidationResult, ValidationError } from './types';
import {
  ContentItemInputSchema,
  DateRangeSchema,
  LocationSchema,
  ContentMetadataSchema,
  ISODateSchema
} from './schemas';

/**
 * Content Validator
 * Validates content items for required fields, date formats, and metadata structure
 */
export class ContentValidator {
  /**
   * Validates a content item input using Zod schema
   * @param item - The content item to validate
   * @returns Validation result with specific errors for each invalid field
   */
  validate(item: unknown): ValidationResult {
    const result = ContentItemInputSchema.safeParse(item);
    
    if (result.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    const errors: ValidationError[] = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));

    return {
      isValid: false,
      errors
    };
  }

  /**
   * Validates required fields (type, content)
   * @param item - The content item to validate
   * @param errors - Array to collect validation errors
   */
  private validateRequiredFields(item: any, errors: ValidationError[]): void {
    // Validate content type
    if (!item.type) {
      errors.push({
        field: 'type',
        message: 'Content type is required'
      });
    }

    // Validate content text
    if (!item.content) {
      errors.push({
        field: 'content',
        message: 'Content text is required'
      });
    } else if (typeof item.content !== 'string') {
      errors.push({
        field: 'content',
        message: 'Content must be a string'
      });
    } else if (item.content.trim().length === 0) {
      errors.push({
        field: 'content',
        message: 'Content cannot be empty or whitespace only'
      });
    }
  }

  /**
   * Validates date formats and ranges
   * @param item - The content item to validate
   * @param errors - Array to collect validation errors
   */
  private validateDates(item: any, errors: ValidationError[]): void {
    if (!item.metadata?.dateRange) {
      return; // Date range is optional
    }

    const result = DateRangeSchema.safeParse(item.metadata.dateRange);
    if (!result.success) {
      result.error.errors.forEach(err => {
        errors.push({
          field: `metadata.dateRange.${err.path.join('.')}`,
          message: err.message
        });
      });
    }
  }

  /**
   * Validates metadata structure
   * @param item - The content item to validate
   * @param errors - Array to collect validation errors
   */
  private validateMetadata(item: any, errors: ValidationError[]): void {
    if (!item.metadata) {
      errors.push({
        field: 'metadata',
        message: 'Metadata is required'
      });
      return;
    }

    const result = ContentMetadataSchema.safeParse(item.metadata);
    if (!result.success) {
      result.error.errors.forEach(err => {
        errors.push({
          field: `metadata.${err.path.join('.')}`,
          message: err.message
        });
      });
    }
  }

  /**
   * Checks if a string is a valid ISO 8601 date (YYYY-MM-DD)
   * @param dateString - The date string to validate
   * @returns True if valid ISO date
   */
  isValidISODate(dateString: string): boolean {
    const result = ISODateSchema.safeParse(dateString);
    return result.success;
  }
}

/**
 * Validates a date range
 * @param dateRange - The date range to validate
 * @returns Validation result
 */
export function validateDateRange(dateRange: unknown): ValidationResult {
  const result = DateRangeSchema.safeParse(dateRange);
  
  if (result.success) {
    return {
      isValid: true,
      errors: []
    };
  }

  const errors: ValidationError[] = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));

  return {
    isValid: false,
    errors
  };
}

/**
 * Validates a location
 * @param location - The location to validate
 * @returns Validation result
 */
export function validateLocation(location: unknown): ValidationResult {
  const result = LocationSchema.safeParse(location);
  
  if (result.success) {
    return {
      isValid: true,
      errors: []
    };
  }

  const errors: ValidationError[] = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));

  return {
    isValid: false,
    errors
  };
}

/**
 * Validates content metadata
 * @param metadata - The metadata to validate
 * @returns Validation result
 */
export function validateContentMetadata(metadata: unknown): ValidationResult {
  const result = ContentMetadataSchema.safeParse(metadata);
  
  if (result.success) {
    return {
      isValid: true,
      errors: []
    };
  }

  const errors: ValidationError[] = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));

  return {
    isValid: false,
    errors
  };
}

// Export singleton instance
export const contentValidator = new ContentValidator();
