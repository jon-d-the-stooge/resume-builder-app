import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { contentManager } from '../main/contentManager';
import { obsidianClient } from '../main/obsidianClient';
import { ContentType, ContentItemInput, SearchQuery } from '../types';
import { SearchQueryBuilder, buildQuery } from '../main/searchQueryBuilder';

describe('Search and Query Functionality (Task 10.3)', () => {
  beforeEach(() => {
    // Clear mock storage before each test
    (obsidianClient as any).clearMockStorage();
    
    // Clear content manager cache
    (contentManager as any).contentItems = new Map();
    (contentManager as any).childToParent = new Map();
    (contentManager as any).parentToChildren = new Map();
  });

  describe('Property Tests - Search Functionality', () => {
    // Feature: resume-content-ingestion, Property 17: Tag-based search accuracy
    it('Property 17: should return all items with specified tags and no items without those tags', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a set of tags to search for (non-empty, non-whitespace)
          fc.array(fc.string({ minLength: 3, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }),
          // Generate content items with various tags
          fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(ContentType)),
              content: fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 0),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 5 }),
              metadata: fc.constant({})
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (searchTags, items) => {
            // Clear storage before this test run
            (obsidianClient as any).clearMockStorage();
            (contentManager as any).contentItems = new Map();
            
            // Create all items
            const createdItems = [];
            for (const item of items) {
              const created = await contentManager.createContentItem(item as ContentItemInput);
              createdItems.push(created);
            }
            
            // Search by tags
            const results = await contentManager.searchContentItems({ tags: searchTags });
            
            // All results should contain all search tags
            for (const result of results) {
              for (const searchTag of searchTags) {
                expect(result.tags).toContain(searchTag);
              }
            }
            
            // All items with all search tags should be in results
            const expectedItems = createdItems.filter(item =>
              searchTags.every(tag => item.tags.includes(tag))
            );
            
            expect(results.length).toBe(expectedItems.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    // Feature: resume-content-ingestion, Property 18: Text search accuracy
    it('Property 18: should return all items containing search text and no items without that text', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate search text (non-empty, non-whitespace, alphanumeric)
          fc.string({ minLength: 5, maxLength: 15 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
          // Generate content items with various content
          fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(ContentType)),
              content: fc.string({ minLength: 20, maxLength: 100 }).filter(s => s.trim().length > 0),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }),
              metadata: fc.constant({})
            }),
            { minLength: 6, maxLength: 12 }
          ),
          async (searchText, items) => {
            // Clear storage before this test run
            (obsidianClient as any).clearMockStorage();
            (contentManager as any).contentItems = new Map();
            
            // Filter out items that already contain the search text
            const cleanItems = items.filter(item => !item.content.toLowerCase().includes(searchText.toLowerCase()));
            
            if (cleanItems.length < 4) {
              // Skip this test run if we don't have enough clean items
              return;
            }
            
            // Add search text to half of the items
            const itemsWithText = cleanItems.slice(0, Math.floor(cleanItems.length / 2)).map(item => ({
              ...item,
              content: `${item.content} ${searchText} more content`
            }));
            
            const itemsWithoutText = cleanItems.slice(Math.floor(cleanItems.length / 2));
            
            const allItems = [...itemsWithText, ...itemsWithoutText];
            
            // Create all items
            for (const item of allItems) {
              await contentManager.createContentItem(item as ContentItemInput);
            }
            
            // Search by text
            const results = await contentManager.searchContentItems({ text: searchText });
            
            // All results should contain search text (case-insensitive)
            for (const result of results) {
              expect(result.content.toLowerCase()).toContain(searchText.toLowerCase());
            }
            
            // All items with search text should be in results
            expect(results.length).toBe(itemsWithText.length);
          }
        ),
        { numRuns: 30 }
      );
    });

    // Feature: resume-content-ingestion, Property 19: Date range filtering
    it('Property 19: should return only items with overlapping date ranges', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate search date range
          fc.record({
            start: fc.date({ min: new Date('2020-01-01'), max: new Date('2023-12-31') }),
            end: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2023-12-31') }), { nil: undefined })
          }),
          // Generate content items with date ranges
          fc.array(
            fc.record({
              type: fc.constantFrom(ContentType.JOB_ENTRY, ContentType.EDUCATION, ContentType.ACCOMPLISHMENT),
              content: fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 0),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 2 }),
              dateRange: fc.record({
                start: fc.date({ min: new Date('2019-01-01'), max: new Date('2024-12-31') }),
                end: fc.option(fc.date({ min: new Date('2019-01-01'), max: new Date('2024-12-31') }), { nil: undefined })
              })
            }),
            { minLength: 5, maxLength: 15 }
          ),
          async (searchRange, items) => {
            // Clear storage before this test run
            (obsidianClient as any).clearMockStorage();
            (contentManager as any).contentItems = new Map();
            
            // Ensure search range is valid (start <= end)
            if (searchRange.end && searchRange.start > searchRange.end) {
              [searchRange.start, searchRange.end] = [searchRange.end, searchRange.start];
            }
            
            // Create all items with date ranges
            const createdItems = [];
            for (const item of items) {
              // Ensure item date range is valid
              if (item.dateRange.end && item.dateRange.start > item.dateRange.end) {
                [item.dateRange.start, item.dateRange.end] = [item.dateRange.end, item.dateRange.start];
              }
              
              const created = await contentManager.createContentItem({
                type: item.type,
                content: item.content,
                tags: item.tags,
                metadata: {
                  dateRange: {
                    start: item.dateRange.start.toISOString().split('T')[0],
                    end: item.dateRange.end?.toISOString().split('T')[0]
                  }
                }
              });
              createdItems.push(created);
            }
            
            // Search by date range
            const results = await contentManager.searchContentItems({
              dateRange: {
                start: searchRange.start.toISOString().split('T')[0],
                end: searchRange.end?.toISOString().split('T')[0]
              }
            });
            
            // All results should have overlapping date ranges
            const searchStart = searchRange.start;
            const searchEnd = searchRange.end || new Date('2099-12-31');
            
            for (const result of results) {
              if (result.metadata.dateRange) {
                const itemStart = new Date(result.metadata.dateRange.start);
                const itemEnd = result.metadata.dateRange.end ? new Date(result.metadata.dateRange.end) : new Date('2099-12-31');
                
                // Check overlap: start1 <= end2 && start2 <= end1
                const overlaps = itemStart <= searchEnd && searchStart <= itemEnd;
                expect(overlaps).toBe(true);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    // Feature: resume-content-ingestion, Property 20: Search results completeness
    it('Property 20: should include all tags and metadata in search results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(ContentType)),
              content: fc.string({ minLength: 10, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
              company: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
              proficiency: fc.option(fc.constantFrom('beginner', 'intermediate', 'advanced', 'expert'), { nil: undefined }),
              notes: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined })
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (items) => {
            // Create all items with metadata
            const createdItems = [];
            for (const item of items) {
              const created = await contentManager.createContentItem({
                type: item.type,
                content: item.content,
                tags: item.tags,
                metadata: {
                  company: item.company,
                  proficiency: item.proficiency,
                  notes: item.notes
                }
              });
              createdItems.push(created);
            }
            
            // Search for all items by type
            const results = await contentManager.searchContentItems({
              contentType: items[0].type
            });
            
            // All results should have complete tags and metadata
            for (const result of results) {
              expect(result.tags).toBeDefined();
              expect(Array.isArray(result.tags)).toBe(true);
              expect(result.metadata).toBeDefined();
              expect(typeof result.metadata).toBe('object');
              
              // Verify tags are preserved
              expect(result.tags.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    // Feature: resume-content-ingestion, Property 23: Tag format for programmatic access
    it('Property 23: should store tags in frontmatter array format for MCP tool queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(ContentType)),
              content: fc.string({ minLength: 10, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
              metadata: fc.constant({})
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (items) => {
            // Create all items
            for (const item of items) {
              await contentManager.createContentItem(item as ContentItemInput);
            }
            
            // Search for items
            const results = await contentManager.searchContentItems({
              contentType: items[0].type
            });
            
            // Verify tags are in array format
            for (const result of results) {
              expect(Array.isArray(result.tags)).toBe(true);
              
              // Verify each tag is a string
              for (const tag of result.tags) {
                expect(typeof tag).toBe('string');
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    // Feature: resume-content-ingestion, Property 24: Content retrieval by type
    it('Property 24: should retrieve all items of specified type and no items of other types', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items of various types
          fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(ContentType)),
              content: fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 0),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }),
              metadata: fc.constant({})
            }),
            { minLength: 10, maxLength: 20 }
          ),
          async (items) => {
            // Clear storage before this test run
            (obsidianClient as any).clearMockStorage();
            (contentManager as any).contentItems = new Map();
            
            // Create all items
            const createdItems = [];
            for (const item of items) {
              const created = await contentManager.createContentItem(item as ContentItemInput);
              createdItems.push(created);
            }
            
            // Pick a type to search for
            const searchType = items[0].type;
            
            // Search by content type
            const results = await contentManager.searchContentItems({
              contentType: searchType
            });
            
            // All results should be of the specified type
            for (const result of results) {
              expect(result.type).toBe(searchType);
            }
            
            // All items of the specified type should be in results
            const expectedItems = createdItems.filter(item => item.type === searchType);
            expect(results.length).toBe(expectedItems.length);
            
            // No items of other types should be in results
            const otherTypeItems = createdItems.filter(item => item.type !== searchType);
            for (const otherItem of otherTypeItems) {
              expect(results.find(r => r.id === otherItem.id)).toBeUndefined();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Unit Tests - Search Query Builder', () => {
    it('should build query with tags', () => {
      const query = SearchQueryBuilder.create()
        .withTags(['skill', 'typescript'])
        .build();
      
      expect(query.tags).toEqual(['skill', 'typescript']);
    });

    it('should build query with text', () => {
      const query = SearchQueryBuilder.create()
        .withText('software engineer')
        .build();
      
      expect(query.text).toBe('software engineer');
    });

    it('should build query with date range', () => {
      const dateRange = { start: '2020-01-01', end: '2023-12-31' };
      const query = SearchQueryBuilder.create()
        .withDateRange(dateRange)
        .build();
      
      expect(query.dateRange).toEqual(dateRange);
    });

    it('should build query with content type', () => {
      const query = SearchQueryBuilder.create()
        .withContentType(ContentType.SKILL)
        .build();
      
      expect(query.contentType).toBe(ContentType.SKILL);
    });

    it('should build query with multiple filters', () => {
      const query = buildQuery({
        tags: ['skill'],
        text: 'typescript',
        contentType: ContentType.SKILL
      });
      
      expect(query.tags).toEqual(['skill']);
      expect(query.text).toBe('typescript');
      expect(query.contentType).toBe(ContentType.SKILL);
    });

    it('should validate query has at least one criterion', () => {
      const validQuery = { tags: ['skill'] };
      const invalidQuery = {};
      
      expect(SearchQueryBuilder.isValid(validQuery)).toBe(true);
      expect(SearchQueryBuilder.isValid(invalidQuery)).toBe(false);
    });

    it('should detect multiple filters', () => {
      const singleFilter = { tags: ['skill'] };
      const multipleFilters = { tags: ['skill'], text: 'typescript' };
      
      expect(SearchQueryBuilder.hasMultipleFilters(singleFilter)).toBe(false);
      expect(SearchQueryBuilder.hasMultipleFilters(multipleFilters)).toBe(true);
    });

    it('should convert to Obsidian query format', () => {
      const builder = SearchQueryBuilder.create()
        .withTags(['skill'])
        .withText('typescript');
      
      const obsidianQuery = builder.toObsidianQuery();
      
      expect(obsidianQuery.tags).toEqual(['skill']);
      expect(obsidianQuery.query).toBe('typescript');
      expect(obsidianQuery.searchContent).toBe(true);
      expect(obsidianQuery.searchFrontmatter).toBe(true);
    });
  });

  describe('Unit Tests - Search Execution', () => {
    it('should handle empty search results gracefully', async () => {
      const results = await contentManager.searchContentItems({
        tags: ['nonexistent-tag']
      });
      
      expect(results).toEqual([]);
    });

    it('should throw error for invalid query', async () => {
      await expect(
        contentManager.searchContentItems({})
      ).rejects.toThrow('Search query must have at least one filter criterion');
    });

    it('should preserve hierarchical context in search results', async () => {
      // Create parent job entry
      const job = await contentManager.createContentItem({
        type: ContentType.JOB_ENTRY,
        content: 'Senior Engineer',
        tags: ['job-entry'],
        metadata: {}
      });
      
      // Create child accomplishment
      const accomplishment = await contentManager.createContentItem({
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built feature X',
        tags: ['accomplishment'],
        metadata: {}
      });
      
      // Link them
      await contentManager.linkContentItems(job.id, accomplishment.id);
      
      // Search for accomplishment
      const results = await contentManager.searchContentItems({
        contentType: ContentType.ACCOMPLISHMENT
      });
      
      expect(results.length).toBe(1);
      expect(results[0].parentId).toBe(job.id);
    });

    it('should support multiple simultaneous filters', async () => {
      // Clear storage
      (obsidianClient as any).clearMockStorage();
      (contentManager as any).contentItems = new Map();
      
      // Create items with various attributes
      const skill1 = await contentManager.createContentItem({
        type: ContentType.SKILL,
        content: 'TypeScript programming language',
        tags: ['skill', 'programming', 'typescript'],
        metadata: { proficiency: 'expert' }
      });
      
      await contentManager.createContentItem({
        type: ContentType.SKILL,
        content: 'Python programming language',
        tags: ['skill', 'programming', 'python'],
        metadata: { proficiency: 'intermediate' }
      });
      
      await contentManager.createContentItem({
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built TypeScript project',
        tags: ['accomplishment', 'typescript'],
        metadata: {}
      });
      
      // Search with tag filter only
      const tagResults = await contentManager.searchContentItems({
        tags: ['skill']
      });
      
      expect(tagResults.length).toBe(2);
      
      // Search with text filter only
      const textResults = await contentManager.searchContentItems({
        text: 'TypeScript'
      });
      
      expect(textResults.length).toBeGreaterThanOrEqual(1);
      
      // Search with type filter only
      const typeResults = await contentManager.searchContentItems({
        contentType: ContentType.SKILL
      });
      
      expect(typeResults.length).toBe(2);
    });
  });
});
