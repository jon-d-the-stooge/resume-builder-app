/**
 * Validation Schemas
 * 
 * Zod schemas for common data structures.
 */

import { z } from 'zod';

/**
 * ISO 8601 date format (YYYY-MM-DD)
 */
export const ISODateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in ISO 8601 format (YYYY-MM-DD)'
).refine((dateString) => {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date.toISOString().startsWith(dateString);
}, 'Invalid date value');

/**
 * Date range with start and optional end date
 */
export const DateRangeSchema = z.object({
  start: ISODateSchema,
  end: ISODateSchema.optional()
}).refine((data) => {
  if (!data.end) return true;
  const startDate = new Date(data.start);
  const endDate = new Date(data.end);
  return endDate >= startDate;
}, {
  message: 'End date must be after or equal to start date'
});

/**
 * Location with optional city, state, and country
 */
export const LocationSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional()
});

/**
 * Content metadata with optional fields
 */
export const ContentMetadataSchema = z.object({
  dateRange: DateRangeSchema.optional(),
  location: LocationSchema.optional(),
  company: z.string().optional(),
  proficiency: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.any()).optional()
});

/**
 * Content type enum values
 */
export const ContentTypeSchema = z.enum([
  'job-title',
  'job-location',
  'job-duration',
  'skill',
  'accomplishment',
  'education',
  'certification',
  'job-entry'
]);

/**
 * Content item input schema
 */
export const ContentItemInputSchema = z.object({
  type: ContentTypeSchema,
  content: z.string().trim().min(1, 'Content cannot be empty or whitespace only'),
  tags: z.array(z.string()).default([]),
  metadata: ContentMetadataSchema,
  parentId: z.string().optional()
});
