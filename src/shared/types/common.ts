/**
 * Common Types
 * 
 * Shared type definitions used across features.
 * Includes DateRange, Location, ContentMetadata, and other common types.
 */

/**
 * Date range with start and optional end date
 */
export interface DateRange {
  start: string; // ISO 8601 format (YYYY-MM-DD)
  end?: string;  // ISO 8601 format (YYYY-MM-DD)
}

/**
 * Location with optional city, state, and country
 */
export interface Location {
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Content metadata with optional fields
 */
export interface ContentMetadata {
  dateRange?: DateRange;
  location?: Location;
  company?: string;
  proficiency?: string;
  notes?: string;
  customFields?: Record<string, any>;
}
