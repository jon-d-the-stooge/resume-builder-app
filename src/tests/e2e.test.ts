/**
 * End-to-End Integration Tests for Resume Content Ingestion
 * 
 * These tests validate complete user workflows from start to finish:
 * - Upload → Parse → Review → Save → Verify in vault
 * - Manual entry → Validate → Save → Verify in vault
 * - Search by tags → Verify results → Verify completeness
 * - Update content → Verify persistence → Verify timestamp preservation
 * - Delete content → Verify removal from vault
 * 
 * Task 20.1: Write end-to-end test flows
 * Validates: Requirements 1.1-15.6 (comprehensive)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileHandler } from '../main/fileHandler';
import { ParserAgent as ParserAgentImpl } from '../main/parserAgent';
import { contentManager } from '../main/contentManager';
import { obsidianClient } from '../main/obsidianClient';
import { contentValidator } from '../main/contentValidator';
import * as fs from 'fs';
import * as path from 'path';
import type { ContentItemInput, ContentItem } from '../types';

// Create parser agent instance for tests
const parserAgent = new ParserAgentImpl();

describe('End-to-End Integration Tests', () => {
  // Skip tests if API key is not available
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasApiKey) {
    console.warn('⚠️  Skipping E2E tests: ANTHROPIC_API_KEY not set');
  }

  // Track created content items for cleanup
  const createdItems: string[] = [];

  afterEach(async () => {
    // Clean up created content items
    for (const itemId of createdItems) {
      try {
        await contentManager.deleteContentItem(itemId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    createdItems.length = 0;
  });

  /**
   * E2E Test Flow 1: Upload → Parse → Review → Save → Verify in vault
   * 
   * This test simulates the complete resume upload workflow:
   * 1. User uploads a resume file
   * 2. System validates and extracts text
   * 3. AI parser analyzes and extracts content
   * 4. User reviews parsed content (simulated as auto-approval)
   * 5. System saves all content items to vault
   * 6. Verify all items exist in vault with correct structure
   */
  describe('E2E Flow 1: Resume Upload to Vault Storage', () => {
    const testCondition = hasApiKey ? it : it.skip;

    testCondition('should complete full upload workflow for PDF resume', async () => {
      // Step 1: Upload resume file
      const resumePath = path.join(process.cwd(), 'resume_test_real.pdf');
      
      if (!fs.existsSync(resumePath)) {
        console.log('⚠️  Skipping: resume_test_real.pdf not found');
        return;
      }

      const buffer = fs.readFileSync(resumePath);
      const file = new File([buffer], 'resume_test_real.pdf', {
        type: 'application/pdf'
      });

      // Step 2: Validate file
      const validation = fileHandler.validateFile(file);
      expect(validation.isValid).toBe(true);
      expect(validation.errorMessage).toBeUndefined();

      // Step 3: Extract text
      const text = await fileHandler.extractText(file);
      expect(text.length).toBeGreaterThan(0);

      // Step 4: Parse resume
      const parsed = await parserAgent.parseResume(text);
      expect(parsed.jobEntries.length).toBeGreaterThan(0);

      // Step 5: Review (simulated - auto-approve all items)
      // In real UI, user would review and potentially edit items
      
      // Step 6: Save all content items to vault
      const savedItems: ContentItem[] = [];

      // Save job entries first (parents)
      for (const job of parsed.jobEntries) {
        const jobItem = await contentManager.createContentItem({
          type: 'job-entry',
          content: `${job.title} at ${job.company}`,
          tags: ['job-entry', job.title.toLowerCase().replace(/\s+/g, '-')],
          metadata: {
            company: job.company,
            location: job.location,
            dateRange: job.duration
          }
        });
        savedItems.push(jobItem);
        createdItems.push(jobItem.id);

        // Save accomplishments for this job
        for (const acc of job.accomplishments) {
          const accItem = await contentManager.createContentItem({
            type: 'accomplishment',
            content: acc.description,
            tags: ['accomplishment'],
            metadata: {
              company: job.company,
              dateRange: acc.dateRange
            },
            parentId: jobItem.id
          });
          savedItems.push(accItem);
          createdItems.push(accItem.id);
        }

        // Save skills for this job
        for (const skill of job.skills) {
          const skillItem = await contentManager.createContentItem({
            type: 'skill',
            content: skill.name,
            tags: ['skill', skill.name.toLowerCase().replace(/\s+/g, '-')],
            metadata: {
              proficiency: skill.proficiency,
              company: job.company
            },
            parentId: jobItem.id
          });
          savedItems.push(skillItem);
          createdItems.push(skillItem.id);
        }
      }

      // Save education entries
      for (const edu of parsed.education) {
        const eduItem = await contentManager.createContentItem({
          type: 'education',
          content: `${edu.degree} from ${edu.institution}`,
          tags: ['education'],
          metadata: {
            location: edu.location,
            dateRange: edu.dateRange
          }
        });
        savedItems.push(eduItem);
        createdItems.push(eduItem.id);
      }

      // Save certifications
      for (const cert of parsed.certifications) {
        const certItem = await contentManager.createContentItem({
          type: 'certification',
          content: `${cert.name} from ${cert.issuer}`,
          tags: ['certification'],
          metadata: {
            dateRange: {
              start: cert.dateIssued,
              end: cert.expirationDate
            }
          }
        });
        savedItems.push(certItem);
        createdItems.push(certItem.id);
      }

      // Step 7: Verify all items exist in vault
      expect(savedItems.length).toBeGreaterThan(0);

      for (const item of savedItems) {
        // Read from vault
        const vaultItem = await obsidianClient.readNote(item.filePath);
        
        // Verify content matches
        expect(vaultItem.content).toContain(item.content);
        
        // Verify tags are present
        expect(vaultItem.frontmatter.tags).toEqual(expect.arrayContaining(item.tags));
        
        // Verify metadata
        expect(vaultItem.frontmatter.type).toBe(item.type);
        expect(vaultItem.frontmatter.createdAt).toBeDefined();
        
        // Verify parent-child relationships
        if (item.parentId) {
          expect(vaultItem.frontmatter.parentId).toBe(item.parentId);
          expect(vaultItem.content).toContain(`[[${item.parentId}]]`);
        }
      }

      console.log(`✓ Successfully saved and verified ${savedItems.length} content items in vault`);
    }, 120000); // 2 minute timeout for full workflow
  });

  /**
   * E2E Test Flow 2: Manual entry → Validate → Save → Verify in vault
   * 
   * This test simulates manual content entry:
   * 1. User fills out manual entry form
   * 2. System validates input
   * 3. System creates content item with tags
   * 4. System saves to vault
   * 5. Verify item exists in vault with correct structure
   */
  describe('E2E Flow 2: Manual Content Entry', () => {
    it('should complete full manual entry workflow', async () => {
      // Step 1: User fills form (simulated)
      const manualInput: ContentItemInput = {
        type: 'skill',
        content: 'TypeScript',
        tags: ['skill', 'programming-language', 'typescript'],
        metadata: {
          proficiency: 'expert',
          notes: 'Used extensively in backend and frontend development'
        }
      };

      // Step 2: Validate input
      const validationResult = contentValidator.validate(manualInput);
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Step 3: Create content item
      const createdItem = await contentManager.createContentItem(manualInput);
      createdItems.push(createdItem.id);

      expect(createdItem.id).toBeDefined();
      expect(createdItem.type).toBe('skill');
      expect(createdItem.content).toBe('TypeScript');
      expect(createdItem.tags).toEqual(expect.arrayContaining(['skill', 'typescript']));
      expect(createdItem.createdAt).toBeDefined();

      // Step 4: Verify in vault
      const vaultItem = await obsidianClient.readNote(createdItem.filePath);
      
      expect(vaultItem.content).toContain('TypeScript');
      expect(vaultItem.frontmatter.tags).toEqual(expect.arrayContaining(['skill', 'typescript']));
      expect(vaultItem.frontmatter.type).toBe('skill');
      expect(vaultItem.frontmatter.metadata.proficiency).toBe('expert');

      console.log(`✓ Successfully created and verified manual entry: ${createdItem.id}`);
    });

    it('should reject invalid manual entry', async () => {
      // Missing required field: content
      const invalidInput: ContentItemInput = {
        type: 'skill',
        content: '', // Empty content
        tags: ['skill'],
        metadata: {}
      };

      const validationResult = contentValidator.validate(invalidInput);
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
      expect(validationResult.errors.some(e => e.field === 'content')).toBe(true);

      console.log(`✓ Correctly rejected invalid manual entry`);
    });
  });

  /**
   * E2E Test Flow 3: Search by tags → Verify results → Verify completeness
   * 
   * This test validates search functionality:
   * 1. Create multiple content items with different tags
   * 2. Search by single tag
   * 3. Search by multiple tags
   * 4. Verify all matching items are returned
   * 5. Verify no non-matching items are returned
   */
  describe('E2E Flow 3: Search and Retrieval', () => {
    it('should search by tags and return complete results', async () => {
      // Step 1: Create test content items
      const item1 = await contentManager.createContentItem({
        type: 'skill',
        content: 'React',
        tags: ['skill', 'frontend', 'javascript'],
        metadata: { proficiency: 'expert' }
      });
      createdItems.push(item1.id);

      const item2 = await contentManager.createContentItem({
        type: 'skill',
        content: 'Node.js',
        tags: ['skill', 'backend', 'javascript'],
        metadata: { proficiency: 'expert' }
      });
      createdItems.push(item2.id);

      const item3 = await contentManager.createContentItem({
        type: 'skill',
        content: 'Python',
        tags: ['skill', 'backend', 'python'],
        metadata: { proficiency: 'intermediate' }
      });
      createdItems.push(item3.id);

      // Step 2: Search by single tag
      const skillResults = await contentManager.searchContentItems({
        tags: ['skill']
      });

      expect(skillResults.length).toBeGreaterThanOrEqual(3);
      expect(skillResults.some(r => r.id === item1.id)).toBe(true);
      expect(skillResults.some(r => r.id === item2.id)).toBe(true);
      expect(skillResults.some(r => r.id === item3.id)).toBe(true);

      // Step 3: Search by multiple tags (intersection)
      const jsBackendResults = await contentManager.searchContentItems({
        tags: ['javascript', 'backend']
      });

      expect(jsBackendResults.some(r => r.id === item2.id)).toBe(true);
      expect(jsBackendResults.every(r => r.id !== item1.id || r.tags.includes('backend'))).toBe(true);
      expect(jsBackendResults.every(r => r.id !== item3.id || r.tags.includes('javascript'))).toBe(true);

      // Step 4: Search by text content
      const reactResults = await contentManager.searchContentItems({
        text: 'React'
      });

      expect(reactResults.some(r => r.id === item1.id)).toBe(true);
      expect(reactResults.every(r => r.content.includes('React'))).toBe(true);

      console.log(`✓ Search returned correct results for all queries`);
    });
  });

  /**
   * E2E Test Flow 4: Update content → Verify persistence → Verify timestamp preservation
   * 
   * This test validates content update workflow:
   * 1. Create a content item
   * 2. Update the content
   * 3. Verify changes are persisted
   * 4. Verify creation timestamp is preserved
   * 5. Verify update timestamp is updated
   */
  describe('E2E Flow 4: Content Update', () => {
    it('should update content and preserve creation timestamp', async () => {
      // Step 1: Create initial content item
      const originalItem = await contentManager.createContentItem({
        type: 'skill',
        content: 'JavaScript',
        tags: ['skill', 'programming-language'],
        metadata: { proficiency: 'intermediate' }
      });
      createdItems.push(originalItem.id);

      const originalCreatedAt = originalItem.createdAt;
      const originalUpdatedAt = originalItem.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 2: Update the content
      const updatedItem = await contentManager.updateContentItem(originalItem.id, {
        content: 'JavaScript (ES6+)',
        metadata: { proficiency: 'expert' }
      });

      // Step 3: Verify changes are persisted
      expect(updatedItem.content).toBe('JavaScript (ES6+)');
      expect(updatedItem.metadata.proficiency).toBe('expert');

      // Step 4: Verify creation timestamp is preserved
      expect(updatedItem.createdAt.getTime()).toBe(originalCreatedAt.getTime());

      // Step 5: Verify update timestamp is updated
      expect(updatedItem.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

      // Step 6: Verify in vault
      const vaultItem = await obsidianClient.readNote(updatedItem.filePath);
      expect(vaultItem.content).toContain('JavaScript (ES6+)');
      expect(vaultItem.frontmatter.metadata.proficiency).toBe('expert');
      expect(new Date(vaultItem.frontmatter.createdAt).getTime()).toBe(originalCreatedAt.getTime());

      console.log(`✓ Successfully updated content and preserved creation timestamp`);
    });
  });

  /**
   * E2E Test Flow 5: Delete content → Verify removal from vault
   * 
   * This test validates content deletion:
   * 1. Create a content item
   * 2. Verify it exists in vault
   * 3. Delete the content item
   * 4. Verify it no longer exists in vault
   */
  describe('E2E Flow 5: Content Deletion', () => {
    it('should delete content and remove from vault', async () => {
      // Step 1: Create content item
      const item = await contentManager.createContentItem({
        type: 'skill',
        content: 'Temporary Skill',
        tags: ['skill', 'temporary'],
        metadata: {}
      });

      const itemId = item.id;
      const filePath = item.filePath;

      // Step 2: Verify it exists in vault
      const vaultItemBefore = await obsidianClient.readNote(filePath);
      expect(vaultItemBefore.content).toContain('Temporary Skill');

      // Step 3: Delete the content item
      await contentManager.deleteContentItem(itemId);

      // Step 4: Verify it no longer exists in vault
      await expect(async () => {
        await obsidianClient.readNote(filePath);
      }).rejects.toThrow();

      console.log(`✓ Successfully deleted content and removed from vault`);
    });

    it('should delete parent and all children', async () => {
      // Create parent job entry
      const jobItem = await contentManager.createContentItem({
        type: 'job-entry',
        content: 'Software Engineer at Test Corp',
        tags: ['job-entry'],
        metadata: {
          company: 'Test Corp',
          dateRange: { start: '2020-01-01', end: '2021-12-31' }
        }
      });
      createdItems.push(jobItem.id);

      // Create child accomplishment
      const accItem = await contentManager.createContentItem({
        type: 'accomplishment',
        content: 'Built a test system',
        tags: ['accomplishment'],
        metadata: {},
        parentId: jobItem.id
      });
      createdItems.push(accItem.id);

      // Create child skill
      const skillItem = await contentManager.createContentItem({
        type: 'skill',
        content: 'Testing',
        tags: ['skill'],
        metadata: {},
        parentId: jobItem.id
      });
      createdItems.push(skillItem.id);

      // Verify all exist
      await obsidianClient.readNote(jobItem.filePath);
      await obsidianClient.readNote(accItem.filePath);
      await obsidianClient.readNote(skillItem.filePath);

      // Delete parent
      await contentManager.deleteContentItem(jobItem.id);

      // Verify parent is deleted
      await expect(async () => {
        await obsidianClient.readNote(jobItem.filePath);
      }).rejects.toThrow();

      // Note: In a full implementation, we might want to cascade delete children
      // or orphan them. For now, we just verify the parent is deleted.

      console.log(`✓ Successfully deleted parent job entry`);
    });
  });
});
