import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { contentValidator } from '../main/contentValidator';
import { ContentItemInput, ContentType } from '../types';

describe('Content Validator Property Tests', () => {
  // Feature: resume-content-ingestion, Property 13: Required field validation
  describe('Property 13: Required field validation', () => {
    it('should reject submissions with missing content type', () => {
      fc.assert(
        fc.property(
          fc.record({
            content: fc.string({ minLength: 1 }),
            tags: fc.array(fc.string()),
            metadata: fc.constant({})
          }),
          (partial) => {
            const item = {
              ...partial,
              type: undefined as any // Missing type
            };
            
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'type')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject submissions with missing content text', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            tags: fc.array(fc.string()),
            metadata: fc.constant({})
          }),
          (partial) => {
            const item = {
              ...partial,
              content: undefined as any // Missing content
            };
            
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'content')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject submissions with empty content text', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.constantFrom('', '   ', '\t\n'), // Empty or whitespace
            tags: fc.array(fc.string()),
            metadata: fc.constant({})
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'content')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject submissions with missing metadata', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }),
            tags: fc.array(fc.string())
          }),
          (partial) => {
            const item = {
              ...partial,
              metadata: undefined as any // Missing metadata
            };
            
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 14: Valid manual entry creates content item
  describe('Property 14: Valid manual entry creates content item', () => {
    it('should accept valid content items with all required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              company: fc.option(fc.string(), { nil: undefined }),
              proficiency: fc.option(fc.string(), { nil: undefined }),
              notes: fc.option(fc.string(), { nil: undefined })
            })
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid content items with date ranges', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              dateRange: fc.record({
                start: fc.date({ min: new Date('2000-01-01'), max: new Date('2024-12-31') })
                  .map(d => d.toISOString().split('T')[0]),
                end: fc.option(
                  fc.date({ min: new Date('2000-01-01'), max: new Date('2024-12-31') })
                    .map(d => d.toISOString().split('T')[0]),
                  { nil: undefined }
                )
              }).filter(range => {
                // Ensure end date is after start date if both exist
                if (range.end) {
                  return new Date(range.end) >= new Date(range.start);
                }
                return true;
              })
            })
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid content items with location metadata', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              location: fc.record({
                city: fc.option(fc.string(), { nil: undefined }),
                state: fc.option(fc.string(), { nil: undefined }),
                country: fc.option(fc.string(), { nil: undefined })
              })
            })
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 15: Invalid submission prevents creation
  describe('Property 15: Invalid submission prevents creation', () => {
    it('should reject invalid content type', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.string().filter(s => !Object.values(ContentType).includes(s as ContentType)),
            content: fc.string({ minLength: 1 }),
            tags: fc.array(fc.string()),
            metadata: fc.constant({})
          }),
          (item) => {
            const result = contentValidator.validate(item as any);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'type')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid date formats', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              dateRange: fc.record({
                start: fc.constantFrom('invalid', '2024/01/01', '01-01-2024', '2024-13-01', '2024-01-32'),
                end: fc.option(fc.string(), { nil: undefined })
              })
            })
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field.includes('dateRange'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject end date before start date', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              dateRange: fc.record({
                start: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') })
                  .map(d => d.toISOString().split('T')[0]),
                end: fc.date({ min: new Date('2000-01-01'), max: new Date('2019-12-31') })
                  .map(d => d.toISOString().split('T')[0])
              })
            })
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata.dateRange')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid metadata structure', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              location: fc.oneof(
                fc.constant('invalid'), // String instead of object
                fc.constant(123), // Number instead of object
                fc.constant([]) // Array instead of object
              )
            })
          }),
          (item) => {
            const result = contentValidator.validate(item as any);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata.location')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid location field types', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom(...Object.values(ContentType)),
            content: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              location: fc.record({
                city: fc.oneof(fc.constant(123), fc.constant(true), fc.constant([])) as any
              })
            })
          }),
          (item) => {
            const result = contentValidator.validate(item);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field.includes('location'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
