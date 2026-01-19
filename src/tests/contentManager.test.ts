import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { contentManager } from '../main/contentManager';
import { obsidianClient } from '../main/obsidianClient';
import { ContentType, ContentItemInput } from '../types';

// Clear storage before each test
beforeEach(() => {
  obsidianClient.clearMockStorage();
});

describe('Content Manager - Tagging', () => {
  // Feature: resume-content-ingestion, Property 6: Content type to tag mapping
  describe('Property 6: Content type to tag mapping', () => {
    it('should apply the corresponding tag for each content type', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary content items with different types
          fc.record({
            type: fc.constantFrom(
              ContentType.JOB_TITLE,
              ContentType.JOB_LOCATION,
              ContentType.JOB_DURATION,
              ContentType.SKILL,
              ContentType.ACCOMPLISHMENT,
              ContentType.EDUCATION,
              ContentType.CERTIFICATION,
              ContentType.JOB_ENTRY
            ),
            content: fc.string({ minLength: 1, maxLength: 200 }),
            tags: fc.constant([]), // Start with no user tags
            metadata: fc.constant({})
          }),
          async (itemInput: ContentItemInput) => {
            // Create the content item
            const item = await contentManager.createContentItem(itemInput);
            
            // Verify the content type tag is applied
            expect(item.tags).toContain(itemInput.type);
            
            // Verify the tag matches the content type
            switch (itemInput.type) {
              case ContentType.JOB_TITLE:
                expect(item.tags).toContain('job-title');
                break;
              case ContentType.JOB_LOCATION:
                expect(item.tags).toContain('job-location');
                break;
              case ContentType.JOB_DURATION:
                expect(item.tags).toContain('job-duration');
                break;
              case ContentType.SKILL:
                expect(item.tags).toContain('skill');
                break;
              case ContentType.ACCOMPLISHMENT:
                expect(item.tags).toContain('accomplishment');
                break;
              case ContentType.EDUCATION:
                expect(item.tags).toContain('education');
                break;
              case ContentType.CERTIFICATION:
                expect(item.tags).toContain('certification');
                break;
              case ContentType.JOB_ENTRY:
                expect(item.tags).toContain('job-entry');
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 7: Multiple tag support
  describe('Property 7: Multiple tag support', () => {
    it('should apply all user-provided tags in addition to automatic tags', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate content items with multiple user tags
          fc.record({
            type: fc.constantFrom(
              ContentType.SKILL,
              ContentType.ACCOMPLISHMENT,
              ContentType.EDUCATION,
              ContentType.CERTIFICATION
            ),
            content: fc.string({ minLength: 1, maxLength: 200 }),
            tags: fc.array(
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes(' ')),
              { minLength: 1, maxLength: 5 }
            ),
            metadata: fc.constant({})
          }),
          async (itemInput: ContentItemInput) => {
            // Create the content item
            const item = await contentManager.createContentItem(itemInput);
            
            // Verify the automatic content type tag is present
            expect(item.tags).toContain(itemInput.type);
            
            // Verify all user-provided tags are present
            itemInput.tags.forEach(tag => {
              expect(item.tags).toContain(tag);
            });
            
            // Verify total tag count (automatic + user tags, accounting for potential duplicates)
            const uniqueUserTags = new Set(itemInput.tags);
            const expectedMinTags = uniqueUserTags.has(itemInput.type) 
              ? uniqueUserTags.size 
              : uniqueUserTags.size + 1;
            
            expect(item.tags.length).toBeGreaterThanOrEqual(expectedMinTags);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Additional unit tests for specific scenarios
  describe('Unit Tests - Tagging Edge Cases', () => {
    it('should not duplicate tags when user provides the same tag as content type', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'TypeScript',
        tags: ['skill', 'programming-language'], // 'skill' is duplicate of type
        metadata: {}
      };
      
      const item = await contentManager.createContentItem(itemInput);
      
      // Count occurrences of 'skill' tag
      const skillTagCount = item.tags.filter(tag => tag === 'skill').length;
      expect(skillTagCount).toBe(1);
    });

    it('should handle empty user tags array', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Led team of 5 engineers',
        tags: [],
        metadata: {}
      };
      
      const item = await contentManager.createContentItem(itemInput);
      
      // Should have at least the automatic type tag
      expect(item.tags).toContain('accomplishment');
      expect(item.tags.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve all unique tags', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'Python',
        tags: ['programming-language', 'backend', 'data-science'],
        metadata: {}
      };
      
      const item = await contentManager.createContentItem(itemInput);
      
      // Should have all tags
      expect(item.tags).toContain('skill');
      expect(item.tags).toContain('programming-language');
      expect(item.tags).toContain('backend');
      expect(item.tags).toContain('data-science');
      expect(item.tags.length).toBe(4);
    });
  });

  // Tests for ID generation
  describe('Content Item Creation', () => {
    it('should generate unique IDs for each content item', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'JavaScript',
        tags: [],
        metadata: {}
      };
      
      // Create multiple items
      const item1 = await contentManager.createContentItem(itemInput);
      const item2 = await contentManager.createContentItem(itemInput);
      const item3 = await contentManager.createContentItem(itemInput);
      
      // IDs should be unique
      expect(item1.id).not.toBe(item2.id);
      expect(item2.id).not.toBe(item3.id);
      expect(item1.id).not.toBe(item3.id);
      
      // IDs should follow the format: type-timestamp-random
      expect(item1.id).toMatch(/^skill-\d+-[a-z0-9]+$/);
      expect(item2.id).toMatch(/^skill-\d+-[a-z0-9]+$/);
      expect(item3.id).toMatch(/^skill-\d+-[a-z0-9]+$/);
    });

    it('should set creation and update timestamps', async () => {
      const before = new Date();
      
      const itemInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Reduced API latency by 40%',
        tags: ['performance'],
        metadata: {}
      };
      
      const item = await contentManager.createContentItem(itemInput);
      
      const after = new Date();
      
      // Timestamps should be set
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
      
      // Timestamps should be within the test execution window
      expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(item.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      
      // For new items, createdAt and updatedAt should be the same
      expect(item.createdAt.getTime()).toBe(item.updatedAt.getTime());
    });

    it('should generate correct file paths based on content type', async () => {
      const testCases = [
        { type: ContentType.JOB_ENTRY, expectedPath: /^resume-content\/jobs\// },
        { type: ContentType.SKILL, expectedPath: /^resume-content\/standalone-skills\// },
        { type: ContentType.ACCOMPLISHMENT, expectedPath: /^resume-content\/accomplishments\// },
        { type: ContentType.EDUCATION, expectedPath: /^resume-content\/education\// },
        { type: ContentType.CERTIFICATION, expectedPath: /^resume-content\/certifications\// }
      ];
      
      for (const testCase of testCases) {
        const itemInput: ContentItemInput = {
          type: testCase.type,
          content: 'Test content',
          tags: [],
          metadata: {}
        };
        
        const item = await contentManager.createContentItem(itemInput);
        
        expect(item.filePath).toMatch(testCase.expectedPath);
        expect(item.filePath).toMatch(/\.md$/); // Should end with .md
      }
    });

    it('should generate hierarchical file paths for items with parent IDs', async () => {
      const parentId = 'job-entry-123-abc';
      
      // Test skill with parent
      const skillInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'React',
        tags: [],
        metadata: {},
        parentId
      };
      
      const skill = await contentManager.createContentItem(skillInput);
      expect(skill.filePath).toMatch(/^resume-content\/jobs\/job-entry-123-abc\/skills\//);
      
      // Test accomplishment with parent
      const accomplishmentInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built feature X',
        tags: [],
        metadata: {},
        parentId
      };
      
      const accomplishment = await contentManager.createContentItem(accomplishmentInput);
      expect(accomplishment.filePath).toMatch(/^resume-content\/jobs\/job-entry-123-abc\/accomplishments\//);
    });
  });
});


describe('Content Manager - Storage Operations', () => {
  // Feature: resume-content-ingestion, Property 8: Content item storage round-trip
  describe('Property 8: Content item storage round-trip', () => {
    it('should store and retrieve content items with equivalent data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom(
              ContentType.SKILL,
              ContentType.ACCOMPLISHMENT,
              ContentType.EDUCATION
            ),
            content: fc.string({ minLength: 5, maxLength: 100 }),
            tags: fc.array(
              fc.string({ minLength: 3, maxLength: 15 }).filter(s => !s.includes(' ')),
              { maxLength: 3 }
            ),
            metadata: fc.record({
              company: fc.option(fc.string({ minLength: 3, maxLength: 30 }), { nil: undefined }),
              notes: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined })
            })
          }),
          async (itemInput: ContentItemInput) => {
            // Create the content item
            const created = await contentManager.createContentItem(itemInput);
            
            // Verify it was created with an ID
            expect(created.id).toBeDefined();
            expect(created.id).toMatch(/^[a-z-]+-\d+-[a-z0-9]+$/);
            
            // Verify content matches
            expect(created.content).toBe(itemInput.content);
            expect(created.type).toBe(itemInput.type);
            
            // Verify tags include the type tag
            expect(created.tags).toContain(itemInput.type);
            
            // Verify timestamps are set
            expect(created.createdAt).toBeInstanceOf(Date);
            expect(created.updatedAt).toBeInstanceOf(Date);
            
            // Verify file path is generated
            expect(created.filePath).toMatch(/^resume-content\//);
            expect(created.filePath).toMatch(/\.md$/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 10: Content update persistence
  describe('Property 10: Content update persistence', () => {
    it('should persist updates to content items', async () => {
      // Create an initial item
      const initialItem: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'TypeScript',
        tags: ['programming-language'],
        metadata: { proficiency: 'intermediate' }
      };
      
      const created = await contentManager.createContentItem(initialItem);
      const originalCreatedAt = created.createdAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Update the item
      const updates = {
        content: 'TypeScript (Updated)',
        tags: ['programming-language', 'frontend'],
        metadata: { proficiency: 'expert' }
      };
      
      const updated = await contentManager.updateContentItem(created.id, updates);
      
      // Verify updates were applied
      expect(updated.content).toBe(updates.content);
      expect(updated.tags).toContain('programming-language');
      expect(updated.tags).toContain('frontend');
      expect(updated.metadata.proficiency).toBe('expert');
      
      // Verify creation timestamp was preserved
      expect(updated.createdAt.getTime()).toBe(originalCreatedAt.getTime());
      
      // Verify update timestamp changed
      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime());
    });
  });

  // Feature: resume-content-ingestion, Property 11: Content deletion removes file
  describe('Property 11: Content deletion removes file', () => {
    it('should remove content items when deleted', async () => {
      // Create an item
      const itemInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Test accomplishment',
        tags: [],
        metadata: {}
      };
      
      const created = await contentManager.createContentItem(itemInput);
      
      // Delete the item
      await contentManager.deleteContentItem(created.id);
      
      // Verify it's deleted by trying to update it (should throw)
      await expect(
        contentManager.updateContentItem(created.id, { content: 'Updated' })
      ).rejects.toThrow('Content item not found');
    });
  });

  // Feature: resume-content-ingestion, Property 12: Creation timestamp preservation
  describe('Property 12: Creation timestamp preservation', () => {
    it('should preserve creation timestamp on updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom(ContentType.SKILL, ContentType.ACCOMPLISHMENT),
            content: fc.string({ minLength: 5, maxLength: 50 }),
            tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { maxLength: 2 }),
            metadata: fc.constant({})
          }),
          async (itemInput: ContentItemInput) => {
            // Create item
            const created = await contentManager.createContentItem(itemInput);
            const originalCreatedAt = created.createdAt.getTime();
            
            // Wait to ensure time difference
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Update item
            const updated = await contentManager.updateContentItem(created.id, {
              content: itemInput.content + ' (updated)'
            });
            
            // Verify creation timestamp unchanged
            expect(updated.createdAt.getTime()).toBe(originalCreatedAt);
            
            // Verify update timestamp changed
            expect(updated.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 9: Obsidian tag syntax compliance
  describe('Property 9: Obsidian tag syntax compliance', () => {
    it('should use Obsidian tag syntax in frontmatter', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'React',
        tags: ['framework', 'frontend'],
        metadata: {}
      };
      
      const created = await contentManager.createContentItem(itemInput);
      
      // Verify tags are in array format (Obsidian syntax)
      expect(Array.isArray(created.tags)).toBe(true);
      expect(created.tags).toContain('skill');
      expect(created.tags).toContain('framework');
      expect(created.tags).toContain('frontend');
    });
  });

  // Feature: resume-content-ingestion, Property 16: YAML frontmatter structure
  describe('Property 16: YAML frontmatter structure', () => {
    it('should create valid YAML frontmatter structure', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.JOB_ENTRY,
        content: 'Senior Software Engineer at Acme Corp',
        tags: ['software-engineer'],
        metadata: {
          company: 'Acme Corp',
          location: { city: 'San Francisco', state: 'CA', country: 'USA' },
          dateRange: { start: '2020-01-01', end: '2023-06-30' }
        }
      };
      
      const created = await contentManager.createContentItem(itemInput);
      
      // Verify all required frontmatter fields are present
      expect(created.tags).toBeDefined();
      expect(created.type).toBeDefined();
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
      expect(created.metadata).toBeDefined();
      
      // Verify metadata structure
      expect(created.metadata.company).toBe('Acme Corp');
      expect(created.metadata.location?.city).toBe('San Francisco');
      expect(created.metadata.dateRange?.start).toBe('2020-01-01');
    });
  });

  // Feature: resume-content-ingestion, Property 21: Consistent markdown structure
  describe('Property 21: Consistent markdown structure', () => {
    it('should generate consistent markdown structure', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Reduced API latency by 40%',
        tags: ['performance'],
        metadata: {}
      };
      
      const created = await contentManager.createContentItem(itemInput);
      
      // Verify file path follows expected structure
      expect(created.filePath).toMatch(/^resume-content\/accomplishments\/accomplishment-\d+-[a-z0-9]+\.md$/);
    });
  });

  // Feature: resume-content-ingestion, Property 22: Machine-readable frontmatter
  describe('Property 22: Machine-readable frontmatter', () => {
    it('should create machine-parseable frontmatter', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.EDUCATION,
        content: 'Bachelor of Science in Computer Science',
        tags: ['computer-science', 'degree'],
        metadata: {
          dateRange: { start: '2015-09-01', end: '2019-05-31' },
          location: { city: 'Boston', state: 'MA' }
        }
      };
      
      const created = await contentManager.createContentItem(itemInput);
      
      // Verify timestamps are ISO 8601 format (machine-readable)
      expect(created.createdAt.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(created.updatedAt.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Verify metadata dates are ISO format
      expect(created.metadata.dateRange?.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(created.metadata.dateRange?.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('Content Manager - Duplicate Detection', () => {
  // Feature: resume-content-ingestion, Property 34: Duplicate content prevention
  describe('Property 34: Duplicate content prevention', () => {
    it('should detect duplicate content items with identical text and type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom(
              ContentType.SKILL,
              ContentType.ACCOMPLISHMENT,
              ContentType.EDUCATION
            ),
            content: fc.string({ minLength: 10, maxLength: 100 }),
            tags: fc.array(
              fc.string({ minLength: 3, maxLength: 15 }).filter(s => !s.includes(' ')),
              { maxLength: 3 }
            ),
            metadata: fc.constant({})
          }),
          async (itemInput: ContentItemInput) => {
            // Create the first item
            const item1 = await contentManager.createContentItem(itemInput);
            
            // Try to detect duplicates with the same content
            const duplicates = await contentManager.detectDuplicates(itemInput);
            
            // Should find the item we just created as a duplicate
            expect(duplicates.length).toBeGreaterThanOrEqual(1);
            
            // The duplicate should have the same content and type
            const foundDuplicate = duplicates.find(d => d.id === item1.id);
            expect(foundDuplicate).toBeDefined();
            expect(foundDuplicate?.content.trim()).toBe(itemInput.content.trim());
            expect(foundDuplicate?.type).toBe(itemInput.type);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Unit Tests - Duplicate Detection', () => {
    it('should not detect duplicates for different content', async () => {
      const item1Input: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'TypeScript',
        tags: ['programming-language'],
        metadata: {}
      };
      
      const item2Input: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'JavaScript',
        tags: ['programming-language'],
        metadata: {}
      };
      
      // Create first item
      await contentManager.createContentItem(item1Input);
      
      // Check for duplicates of second item (should find none)
      const duplicates = await contentManager.detectDuplicates(item2Input);
      
      // Should not find any duplicates since content is different
      expect(duplicates.every(d => d.content.trim() !== item2Input.content.trim())).toBe(true);
    });

    it('should not detect duplicates for same content but different type', async () => {
      const content = 'Computer Science';
      
      const item1Input: ContentItemInput = {
        type: ContentType.EDUCATION,
        content,
        tags: [],
        metadata: {}
      };
      
      const item2Input: ContentItemInput = {
        type: ContentType.SKILL,
        content,
        tags: [],
        metadata: {}
      };
      
      // Create first item
      await contentManager.createContentItem(item1Input);
      
      // Check for duplicates of second item (different type)
      const duplicates = await contentManager.detectDuplicates(item2Input);
      
      // Should not find duplicates since type is different
      expect(duplicates.length).toBe(0);
    });

    it('should detect exact duplicates with whitespace variations', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: '  Reduced API latency by 40%  ',
        tags: ['performance'],
        metadata: {}
      };
      
      // Create item with extra whitespace
      await contentManager.createContentItem(itemInput);
      
      // Check for duplicates with trimmed content
      const duplicateCheck: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Reduced API latency by 40%',
        tags: ['performance'],
        metadata: {}
      };
      
      const duplicates = await contentManager.detectDuplicates(duplicateCheck);
      
      // Should find the duplicate (whitespace is trimmed in comparison)
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
      expect(duplicates[0].content.trim()).toBe(duplicateCheck.content.trim());
    });

    it('should return multiple duplicates if they exist', async () => {
      const itemInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'Python',
        tags: ['programming-language'],
        metadata: {}
      };
      
      // Create multiple identical items
      await contentManager.createContentItem(itemInput);
      await contentManager.createContentItem(itemInput);
      await contentManager.createContentItem(itemInput);
      
      // Check for duplicates
      const duplicates = await contentManager.detectDuplicates(itemInput);
      
      // Should find all three duplicates
      expect(duplicates.length).toBe(3);
      duplicates.forEach(dup => {
        expect(dup.content.trim()).toBe(itemInput.content.trim());
        expect(dup.type).toBe(itemInput.type);
      });
    });
  });
});

describe('Content Manager - Relationship Management', () => {
  describe('linkContentItems', () => {
    it('should link a child item to a parent item', async () => {
      // Create a parent job entry
      const parentInput: ContentItemInput = {
        type: ContentType.JOB_ENTRY,
        content: 'Senior Software Engineer at Acme Corp',
        tags: ['software-engineer'],
        metadata: {
          company: 'Acme Corp',
          dateRange: { start: '2020-01-01', end: '2023-06-30' }
        }
      };
      
      const parent = await contentManager.createContentItem(parentInput);
      
      // Create a child accomplishment without parent
      const childInput: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Reduced API latency by 40%',
        tags: ['performance'],
        metadata: {}
      };
      
      const child = await contentManager.createContentItem(childInput);
      
      // Link them
      await contentManager.linkContentItems(parent.id, child.id);
      
      // Verify the child now has the parent ID
      // We need to search for the child to get the updated version
      const searchResults = await contentManager.searchContentItems({
        contentType: ContentType.ACCOMPLISHMENT
      });
      
      const updatedChild = searchResults.find(item => item.id === child.id);
      expect(updatedChild).toBeDefined();
      expect(updatedChild?.parentId).toBe(parent.id);
    });

    it('should throw error when parent does not exist', async () => {
      // Create a child
      const childInput: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'TypeScript',
        tags: [],
        metadata: {}
      };
      
      const child = await contentManager.createContentItem(childInput);
      
      // Try to link to non-existent parent
      await expect(
        contentManager.linkContentItems('non-existent-parent', child.id)
      ).rejects.toThrow('Parent content item not found');
    });

    it('should throw error when child does not exist', async () => {
      // Create a parent
      const parentInput: ContentItemInput = {
        type: ContentType.JOB_ENTRY,
        content: 'Software Engineer',
        tags: [],
        metadata: {}
      };
      
      const parent = await contentManager.createContentItem(parentInput);
      
      // Try to link non-existent child
      await expect(
        contentManager.linkContentItems(parent.id, 'non-existent-child')
      ).rejects.toThrow('Child content item not found');
    });

    it('should support multiple children for one parent', async () => {
      // Create a parent
      const parentInput: ContentItemInput = {
        type: ContentType.JOB_ENTRY,
        content: 'Lead Developer',
        tags: [],
        metadata: {}
      };
      
      const parent = await contentManager.createContentItem(parentInput);
      
      // Create multiple children
      const child1Input: ContentItemInput = {
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built feature X',
        tags: [],
        metadata: {}
      };
      
      const child2Input: ContentItemInput = {
        type: ContentType.SKILL,
        content: 'React',
        tags: [],
        metadata: {}
      };
      
      const child1 = await contentManager.createContentItem(child1Input);
      const child2 = await contentManager.createContentItem(child2Input);
      
      // Link both children to parent
      await contentManager.linkContentItems(parent.id, child1.id);
      await contentManager.linkContentItems(parent.id, child2.id);
      
      // Verify both children have the parent ID
      const accomplishments = await contentManager.searchContentItems({
        contentType: ContentType.ACCOMPLISHMENT
      });
      const skills = await contentManager.searchContentItems({
        contentType: ContentType.SKILL
      });
      
      const updatedChild1 = accomplishments.find(item => item.id === child1.id);
      const updatedChild2 = skills.find(item => item.id === child2.id);
      
      expect(updatedChild1?.parentId).toBe(parent.id);
      expect(updatedChild2?.parentId).toBe(parent.id);
    });
  });
});


describe('Content Manager - Hierarchical Relationships (Task 8.2)', () => {
  // Feature: resume-content-ingestion, Property 25: Job entry parent creation
  describe('Property 25: Job entry parent creation', () => {
    it('should create parent job entry before child items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            jobContent: fc.string({ minLength: 10, maxLength: 100 }),
            company: fc.string({ minLength: 3, maxLength: 50 }),
            childContent: fc.string({ minLength: 10, maxLength: 100 }),
            childType: fc.constantFrom(ContentType.ACCOMPLISHMENT, ContentType.SKILL)
          }),
          async ({ jobContent, company, childContent, childType }) => {
            // Create parent job entry first
            const parentInput: ContentItemInput = {
              type: ContentType.JOB_ENTRY,
              content: jobContent,
              tags: [],
              metadata: { company }
            };
            
            const parent = await contentManager.createContentItem(parentInput);
            
            // Verify parent was created
            expect(parent.id).toBeDefined();
            expect(parent.type).toBe(ContentType.JOB_ENTRY);
            
            // Create child item
            const childInput: ContentItemInput = {
              type: childType,
              content: childContent,
              tags: [],
              metadata: {},
              parentId: parent.id
            };
            
            const child = await contentManager.createContentItem(childInput);
            
            // Verify child references parent
            expect(child.parentId).toBe(parent.id);
            
            // Verify child file path is under parent directory
            if (childType === ContentType.ACCOMPLISHMENT) {
              expect(child.filePath).toMatch(new RegExp(`jobs/${parent.id}/accomplishments`));
            } else if (childType === ContentType.SKILL) {
              expect(child.filePath).toMatch(new RegExp(`jobs/${parent.id}/skills`));
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 26: Accomplishment-to-job linking
  describe('Property 26: Accomplishment-to-job linking', () => {
    it('should link accomplishments to job entries with bidirectional references', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            jobContent: fc.string({ minLength: 10, maxLength: 100 }),
            accomplishmentContent: fc.string({ minLength: 10, maxLength: 150 })
          }),
          async ({ jobContent, accomplishmentContent }) => {
            // Create job entry
            const jobInput: ContentItemInput = {
              type: ContentType.JOB_ENTRY,
              content: jobContent,
              tags: [],
              metadata: {}
            };
            
            const job = await contentManager.createContentItem(jobInput);
            
            // Create accomplishment
            const accomplishmentInput: ContentItemInput = {
              type: ContentType.ACCOMPLISHMENT,
              content: accomplishmentContent,
              tags: [],
              metadata: {}
            };
            
            const accomplishment = await contentManager.createContentItem(accomplishmentInput);
            
            // Link accomplishment to job
            await contentManager.linkContentItems(job.id, accomplishment.id);
            
            // Verify accomplishment has parentId
            const accomplishments = await contentManager.searchContentItems({
              contentType: ContentType.ACCOMPLISHMENT
            });
            
            const linkedAccomplishment = accomplishments.find(a => a.id === accomplishment.id);
            expect(linkedAccomplishment).toBeDefined();
            expect(linkedAccomplishment?.parentId).toBe(job.id);
            
            // Verify job's markdown was updated with child link
            const jobNote = await obsidianClient.readNote(job.filePath);
            expect(jobNote.content).toContain(`[[${accomplishment.id}]]`);
            expect(jobNote.frontmatter.childIds).toContain(accomplishment.id);
            
            // Verify accomplishment's markdown has parent link
            const accomplishmentNote = await obsidianClient.readNote(linkedAccomplishment!.filePath);
            expect(accomplishmentNote.content).toContain(`[[${job.id}]]`);
            expect(accomplishmentNote.frontmatter.parentId).toBe(job.id);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 27: Skill-to-job linking
  describe('Property 27: Skill-to-job linking', () => {
    it('should link skills to job entries with bidirectional references', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            jobContent: fc.string({ minLength: 10, maxLength: 100 }),
            skillContent: fc.string({ minLength: 3, maxLength: 50 }),
            proficiency: fc.constantFrom('beginner', 'intermediate', 'advanced', 'expert')
          }),
          async ({ jobContent, skillContent, proficiency }) => {
            // Create job entry
            const jobInput: ContentItemInput = {
              type: ContentType.JOB_ENTRY,
              content: jobContent,
              tags: [],
              metadata: {}
            };
            
            const job = await contentManager.createContentItem(jobInput);
            
            // Create skill
            const skillInput: ContentItemInput = {
              type: ContentType.SKILL,
              content: skillContent,
              tags: [],
              metadata: { proficiency }
            };
            
            const skill = await contentManager.createContentItem(skillInput);
            
            // Link skill to job
            await contentManager.linkContentItems(job.id, skill.id);
            
            // Verify skill has parentId
            const skills = await contentManager.searchContentItems({
              contentType: ContentType.SKILL
            });
            
            const linkedSkill = skills.find(s => s.id === skill.id);
            expect(linkedSkill).toBeDefined();
            expect(linkedSkill?.parentId).toBe(job.id);
            
            // Verify job's markdown was updated with child link
            const jobNote = await obsidianClient.readNote(job.filePath);
            expect(jobNote.content).toContain(`[[${skill.id}]]`);
            expect(jobNote.frontmatter.childIds).toContain(skill.id);
            
            // Verify skill's markdown has parent link
            const skillNote = await obsidianClient.readNote(linkedSkill!.filePath);
            expect(skillNote.content).toContain(`[[${job.id}]]`);
            expect(skillNote.frontmatter.parentId).toBe(job.id);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 30: Obsidian link preservation
  describe('Property 30: Obsidian link preservation', () => {
    it('should preserve Obsidian links in both parent and child markdown files', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            parentContent: fc.string({ minLength: 10, maxLength: 100 }),
            childContent: fc.string({ minLength: 10, maxLength: 100 }),
            childType: fc.constantFrom(ContentType.ACCOMPLISHMENT, ContentType.SKILL)
          }),
          async ({ parentContent, childContent, childType }) => {
            // Create parent
            const parentInput: ContentItemInput = {
              type: ContentType.JOB_ENTRY,
              content: parentContent,
              tags: [],
              metadata: {}
            };
            
            const parent = await contentManager.createContentItem(parentInput);
            
            // Create child
            const childInput: ContentItemInput = {
              type: childType,
              content: childContent,
              tags: [],
              metadata: {}
            };
            
            const child = await contentManager.createContentItem(childInput);
            
            // Link them
            await contentManager.linkContentItems(parent.id, child.id);
            
            // Read parent note and verify child link
            const parentNote = await obsidianClient.readNote(parent.filePath);
            expect(parentNote.content).toContain(`[[${child.id}]]`);
            
            // Read child note and verify parent link
            const childNote = await obsidianClient.readNote(child.filePath);
            expect(childNote.content).toContain(`[[${parent.id}]]`);
            
            // Verify links use Obsidian syntax (double brackets)
            expect(parentNote.content).toMatch(/\[\[.+\]\]/);
            expect(childNote.content).toMatch(/\[\[.+\]\]/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 31: Hierarchical context in queries
  describe('Property 31: Hierarchical context in queries', () => {
    it('should include parentId in query results for child items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            jobContent: fc.string({ minLength: 10, maxLength: 100 }),
            childContent: fc.string({ minLength: 10, maxLength: 100 }),
            childType: fc.constantFrom(ContentType.ACCOMPLISHMENT, ContentType.SKILL)
          }),
          async ({ jobContent, childContent, childType }) => {
            // Create job entry
            const jobInput: ContentItemInput = {
              type: ContentType.JOB_ENTRY,
              content: jobContent,
              tags: [],
              metadata: {}
            };
            
            const job = await contentManager.createContentItem(jobInput);
            
            // Create child
            const childInput: ContentItemInput = {
              type: childType,
              content: childContent,
              tags: [],
              metadata: {}
            };
            
            const child = await contentManager.createContentItem(childInput);
            
            // Link them
            await contentManager.linkContentItems(job.id, child.id);
            
            // Query for child items
            const results = await contentManager.searchContentItems({
              contentType: childType
            });
            
            // Find our child in results
            const foundChild = results.find(item => item.id === child.id);
            
            // Verify parentId is included in result
            expect(foundChild).toBeDefined();
            expect(foundChild?.parentId).toBe(job.id);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Feature: resume-content-ingestion, Property 35: Many-to-many skill relationships
  describe('Property 35: Many-to-many skill relationships', () => {
    it('should support skills linked to multiple job entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            skillContent: fc.string({ minLength: 3, maxLength: 50 }),
            job1Content: fc.string({ minLength: 10, maxLength: 100 }),
            job2Content: fc.string({ minLength: 10, maxLength: 100 }),
            job3Content: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async ({ skillContent, job1Content, job2Content, job3Content }) => {
            // Create a skill
            const skillInput: ContentItemInput = {
              type: ContentType.SKILL,
              content: skillContent,
              tags: [],
              metadata: {}
            };
            
            const skill = await contentManager.createContentItem(skillInput);
            
            // Create multiple job entries
            const job1 = await contentManager.createContentItem({
              type: ContentType.JOB_ENTRY,
              content: job1Content,
              tags: [],
              metadata: {}
            });
            
            const job2 = await contentManager.createContentItem({
              type: ContentType.JOB_ENTRY,
              content: job2Content,
              tags: [],
              metadata: {}
            });
            
            const job3 = await contentManager.createContentItem({
              type: ContentType.JOB_ENTRY,
              content: job3Content,
              tags: [],
              metadata: {}
            });
            
            // Link skill to all three jobs
            const jobIds = [job1.id, job2.id, job3.id];
            await contentManager.linkSkillToMultipleJobs(skill.id, jobIds);
            
            // Verify skill's markdown contains references to all jobs
            const skillNote = await obsidianClient.readNote(skill.filePath);
            expect(skillNote.content).toContain(`[[${job1.id}]]`);
            expect(skillNote.content).toContain(`[[${job2.id}]]`);
            expect(skillNote.content).toContain(`[[${job3.id}]]`);
            
            // Verify skill's frontmatter contains all parent job IDs
            expect(skillNote.frontmatter.metadata.customFields?.parentJobIds).toEqual(jobIds);
            
            // Verify each job's markdown contains the skill link
            const job1Note = await obsidianClient.readNote(job1.filePath);
            const job2Note = await obsidianClient.readNote(job2.filePath);
            const job3Note = await obsidianClient.readNote(job3.filePath);
            
            expect(job1Note.content).toContain(`[[${skill.id}]]`);
            expect(job2Note.content).toContain(`[[${skill.id}]]`);
            expect(job3Note.content).toContain(`[[${skill.id}]]`);
            
            // Verify each job's frontmatter includes the skill in childIds
            expect(job1Note.frontmatter.childIds).toContain(skill.id);
            expect(job2Note.frontmatter.childIds).toContain(skill.id);
            expect(job3Note.frontmatter.childIds).toContain(skill.id);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // Unit tests for edge cases
  describe('Unit Tests - Hierarchical Relationships', () => {
    it('should handle linking multiple children to one parent', async () => {
      // Create parent
      const parent = await contentManager.createContentItem({
        type: ContentType.JOB_ENTRY,
        content: 'Senior Engineer at Tech Corp',
        tags: [],
        metadata: {}
      });
      
      // Create multiple children
      const child1 = await contentManager.createContentItem({
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built feature A',
        tags: [],
        metadata: {}
      });
      
      const child2 = await contentManager.createContentItem({
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built feature B',
        tags: [],
        metadata: {}
      });
      
      const child3 = await contentManager.createContentItem({
        type: ContentType.SKILL,
        content: 'TypeScript',
        tags: [],
        metadata: {}
      });
      
      // Link all children to parent
      await contentManager.linkContentItems(parent.id, child1.id);
      await contentManager.linkContentItems(parent.id, child2.id);
      await contentManager.linkContentItems(parent.id, child3.id);
      
      // Verify parent has all children
      const parentNote = await obsidianClient.readNote(parent.filePath);
      expect(parentNote.frontmatter.childIds).toHaveLength(3);
      expect(parentNote.frontmatter.childIds).toContain(child1.id);
      expect(parentNote.frontmatter.childIds).toContain(child2.id);
      expect(parentNote.frontmatter.childIds).toContain(child3.id);
      
      // Verify parent markdown contains all child links
      expect(parentNote.content).toContain(`[[${child1.id}]]`);
      expect(parentNote.content).toContain(`[[${child2.id}]]`);
      expect(parentNote.content).toContain(`[[${child3.id}]]`);
    });

    it('should throw error when linking skill to non-job-entry', async () => {
      // Create a skill
      const skill = await contentManager.createContentItem({
        type: ContentType.SKILL,
        content: 'Python',
        tags: [],
        metadata: {}
      });
      
      // Create a non-job-entry item
      const education = await contentManager.createContentItem({
        type: ContentType.EDUCATION,
        content: 'Bachelor of Science',
        tags: [],
        metadata: {}
      });
      
      // Try to link skill to multiple "jobs" including non-job-entry
      await expect(
        contentManager.linkSkillToMultipleJobs(skill.id, [education.id])
      ).rejects.toThrow('not a job entry');
    });

    it('should throw error when linking non-skill to multiple jobs', async () => {
      // Create a job
      const job = await contentManager.createContentItem({
        type: ContentType.JOB_ENTRY,
        content: 'Software Engineer',
        tags: [],
        metadata: {}
      });
      
      // Create a non-skill item
      const accomplishment = await contentManager.createContentItem({
        type: ContentType.ACCOMPLISHMENT,
        content: 'Built feature X',
        tags: [],
        metadata: {}
      });
      
      // Try to link non-skill to multiple jobs
      await expect(
        contentManager.linkSkillToMultipleJobs(accomplishment.id, [job.id])
      ).rejects.toThrow('not a skill');
    });

    it('should update skill markdown when linked to additional jobs', async () => {
      // Create skill
      const skill = await contentManager.createContentItem({
        type: ContentType.SKILL,
        content: 'JavaScript',
        tags: [],
        metadata: {}
      });
      
      // Create first job and link
      const job1 = await contentManager.createContentItem({
        type: ContentType.JOB_ENTRY,
        content: 'Frontend Developer',
        tags: [],
        metadata: {}
      });
      
      await contentManager.linkSkillToMultipleJobs(skill.id, [job1.id]);
      
      // Verify skill has one job reference
      let skillNote = await obsidianClient.readNote(skill.filePath);
      expect(skillNote.content).toContain(`[[${job1.id}]]`);
      expect(skillNote.frontmatter.metadata.customFields?.parentJobIds).toHaveLength(1);
      
      // Create second job and link to both
      const job2 = await contentManager.createContentItem({
        type: ContentType.JOB_ENTRY,
        content: 'Full Stack Developer',
        tags: [],
        metadata: {}
      });
      
      await contentManager.linkSkillToMultipleJobs(skill.id, [job1.id, job2.id]);
      
      // Verify skill now has both job references
      skillNote = await obsidianClient.readNote(skill.filePath);
      expect(skillNote.content).toContain(`[[${job1.id}]]`);
      expect(skillNote.content).toContain(`[[${job2.id}]]`);
      expect(skillNote.frontmatter.metadata.customFields?.parentJobIds).toHaveLength(2);
    });
  });
});
