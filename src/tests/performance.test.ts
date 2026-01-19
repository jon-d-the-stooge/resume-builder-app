import { describe, it, expect, beforeEach } from 'vitest';
import { fileHandler } from '../main/fileHandler';
import { ParserAgent as ParserAgentImpl } from '../main/parserAgent';
import { contentManager } from '../main/contentManager';
import { obsidianClient } from '../main/obsidianClient';
import { ContentType } from '../types';

// Create parser agent instance for tests
const parserAgent = new ParserAgentImpl();

/**
 * Performance tests for Resume Content Ingestion system
 * Tests file upload, parsing, save, and search performance
 */

describe('Performance Tests', () => {
  beforeEach(() => {
    // Clear caches and storage before each test
    obsidianClient.clearMockStorage();
    if ('clearCache' in parserAgent) {
      (parserAgent as any).clearCache();
    }
  });

  describe('File Upload Performance', () => {
    it('should validate large files in under 1 second', async () => {
      // Create a mock large file (close to 10MB limit)
      const largeContent = 'A'.repeat(9 * 1024 * 1024); // 9MB
      const file = new File([largeContent], 'large-resume.txt', { type: 'text/plain' });

      const startTime = performance.now();
      const result = fileHandler.validateFile(file);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result.isValid).toBe(true);
      expect(duration).toBeLessThan(1000); // < 1 second
    });

    it('should extract text from large files efficiently', async () => {
      // Create a mock text file with substantial content
      const content = 'Sample resume content. '.repeat(10000); // ~230KB
      const file = new File([content], 'resume.txt', { type: 'text/plain' });

      const startTime = performance.now();
      const extractedText = await fileHandler.extractText(file);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(extractedText).toBeTruthy();
      expect(extractedText.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // < 1 second for text extraction
    });
  });

  describe('Parsing Performance', () => {
    it('should parse typical resume in under 30 seconds', async () => {
      // Mock resume text (typical 2-3 page resume)
      const resumeText = `
John Doe
Software Engineer

EXPERIENCE

Senior Software Engineer at Google
Mountain View, CA | Jan 2020 - Present
- Led team of 5 engineers in developing cloud infrastructure
- Reduced API latency by 40% through caching optimization
- Implemented CI/CD pipeline using Jenkins and Docker

Software Engineer at Microsoft
Redmond, WA | Jun 2017 - Dec 2019
- Developed features for Azure cloud platform
- Improved system reliability to 99.9% uptime
- Mentored junior engineers

EDUCATION

Bachelor of Science in Computer Science
Stanford University | 2013 - 2017

SKILLS

Programming: Python, JavaScript, TypeScript, Java
Cloud: AWS, Azure, Google Cloud
Tools: Docker, Kubernetes, Jenkins, Git
      `.trim();

      const startTime = performance.now();
      
      // Note: This will make an actual API call in real tests
      // For CI/CD, you may want to mock the API response
      try {
        const parsed = await parserAgent.parseResume(resumeText);
        const endTime = performance.now();
        
        const duration = endTime - startTime;
        
        expect(parsed).toBeTruthy();
        expect(duration).toBeLessThan(30000); // < 30 seconds
      } catch (error) {
        // If API key is not set, skip this test
        if (error instanceof Error && (
          error.message.includes('API') || 
          error.message.includes('LLM client not initialized') ||
          (error as any).technicalDetails?.includes('API key')
        )) {
          console.log('Skipping parsing test - API key not configured');
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    }, 35000); // Set test timeout to 35 seconds

    it('should use cache for repeated parsing', async () => {
      const resumeText = 'Simple resume content for caching test';

      try {
        // First parse
        const start1 = performance.now();
        await parserAgent.parseResume(resumeText);
        const end1 = performance.now();
        const firstDuration = end1 - start1;

        // Second parse (should use cache)
        const start2 = performance.now();
        await parserAgent.parseResume(resumeText);
        const end2 = performance.now();
        const secondDuration = end2 - start2;

        // Cached parse should be significantly faster
        expect(secondDuration).toBeLessThan(firstDuration * 0.1); // At least 10x faster
      } catch (error) {
        // If API key is not set, skip this test
        if (error instanceof Error && (
          error.message.includes('API') || 
          error.message.includes('LLM client not initialized') ||
          (error as any).technicalDetails?.includes('API key')
        )) {
          console.log('Skipping cache test - API key not configured');
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    }, 35000);
  });

  describe('Save Performance', () => {
    it('should save content item in under 500ms', async () => {
      const contentItem = {
        type: ContentType.SKILL,
        content: 'TypeScript',
        tags: ['programming-language'],
        metadata: {
          proficiency: 'expert'
        }
      };

      const startTime = performance.now();
      const saved = await contentManager.createContentItem(contentItem);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(saved).toBeTruthy();
      expect(saved.id).toBeTruthy();
      expect(duration).toBeLessThan(500); // < 500ms
    });

    it('should save multiple items efficiently', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        type: ContentType.SKILL,
        content: `Skill ${i}`,
        tags: ['skill'],
        metadata: {}
      }));

      const startTime = performance.now();
      
      for (const item of items) {
        await contentManager.createContentItem(item);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should save 10 items in under 5 seconds (500ms each)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Search Performance', () => {
    beforeEach(async () => {
      // Create a large dataset for search testing
      const items = Array.from({ length: 100 }, (_, i) => ({
        type: i % 3 === 0 ? ContentType.SKILL : 
              i % 3 === 1 ? ContentType.ACCOMPLISHMENT : 
              ContentType.JOB_ENTRY,
        content: `Content item ${i} with searchable text`,
        tags: [`tag-${i % 10}`, 'common-tag'],
        metadata: {
          company: `Company ${i % 5}`
        }
      }));

      for (const item of items) {
        await contentManager.createContentItem(item);
      }
    });

    it('should search by tags in under 2 seconds for 100+ items', async () => {
      const startTime = performance.now();
      
      const results = await contentManager.searchContentItems({
        tags: ['common-tag']
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // < 2 seconds
    });

    it('should search by text in under 2 seconds for 100+ items', async () => {
      const startTime = performance.now();
      
      const results = await contentManager.searchContentItems({
        text: 'searchable'
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // < 2 seconds
    });

    it('should search with multiple filters efficiently', async () => {
      const startTime = performance.now();
      
      const results = await contentManager.searchContentItems({
        tags: ['tag-1'],
        text: 'searchable',
        contentType: ContentType.SKILL
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000); // < 2 seconds even with multiple filters
    });

    it('should handle large vault searches efficiently', async () => {
      // Add more items to simulate a large vault (1000+ items)
      const additionalItems = Array.from({ length: 900 }, (_, i) => ({
        type: ContentType.SKILL,
        content: `Additional skill ${i}`,
        tags: [`skill-${i % 20}`],
        metadata: {}
      }));

      for (const item of additionalItems) {
        await contentManager.createContentItem(item);
      }

      const startTime = performance.now();
      
      const results = await contentManager.searchContentItems({
        tags: ['skill-5']
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // < 2 seconds even with 1000+ items
    });
  });

  describe('Index Performance', () => {
    it('should build search indices efficiently during writes', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        type: ContentType.SKILL,
        content: `Skill ${i} with various keywords`,
        tags: [`tag-${i % 5}`],
        metadata: {}
      }));

      const startTime = performance.now();
      
      for (const item of items) {
        await contentManager.createContentItem(item);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Index building should not significantly slow down writes
      // 50 items should still complete in reasonable time
      expect(duration).toBeLessThan(10000); // < 10 seconds for 50 items with indexing
    });

    it('should benefit from indices in repeated searches', async () => {
      // Create dataset
      const items = Array.from({ length: 100 }, (_, i) => ({
        type: ContentType.SKILL,
        content: `Skill ${i}`,
        tags: [`tag-${i % 10}`],
        metadata: {}
      }));

      for (const item of items) {
        await contentManager.createContentItem(item);
      }

      // First search (builds/uses index)
      const start1 = performance.now();
      await contentManager.searchContentItems({ tags: ['tag-5'] });
      const end1 = performance.now();
      const firstDuration = end1 - start1;

      // Second search (uses existing index)
      const start2 = performance.now();
      await contentManager.searchContentItems({ tags: ['tag-5'] });
      const end2 = performance.now();
      const secondDuration = end2 - start2;

      // Both should be fast, second should not be slower
      expect(firstDuration).toBeLessThan(2000);
      expect(secondDuration).toBeLessThan(2000);
      expect(secondDuration).toBeLessThanOrEqual(firstDuration * 1.5); // Allow some variance
    });
  });
});
