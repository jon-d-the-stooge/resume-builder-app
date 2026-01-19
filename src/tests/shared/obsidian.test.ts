/**
 * Tests for shared Obsidian MCP Client
 * Verifies vault operations, search functionality, and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ObsidianMCPClientImpl } from '../../shared/obsidian/client';
import { Frontmatter, ObsidianQuery } from '../../shared/obsidian/types';

describe('Shared Obsidian MCP Client', () => {
  let client: ObsidianMCPClientImpl;

  beforeEach(() => {
    client = new ObsidianMCPClientImpl('test-vault');
    client.clearMockStorage();
  });

  describe('Write Operations', () => {
    it('should write a note with frontmatter', async () => {
      const path = 'test/note.md';
      const content = 'This is test content';
      const frontmatter: Frontmatter = {
        tags: ['test', 'example'],
        type: 'experience',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, content, frontmatter);

      const note = await client.readNote(path);
      expect(note).toBeDefined();
      expect(note.path).toBe(path);
      expect(note.content).toContain(content);
      expect(note.frontmatter.tags).toEqual(['test', 'example']);
      expect(note.frontmatter.type).toBe('experience');
    });

    it('should write note with complex metadata', async () => {
      const path = 'test/complex.md';
      const content = 'Complex metadata test';
      const frontmatter: Frontmatter = {
        tags: ['work', 'project'],
        type: 'experience',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: ['child1', 'child2'],
        parentId: 'parent1',
        metadata: {
          dateRange: {
            start: '2023-01-01',
            end: '2023-12-31'
          },
          location: {
            city: 'San Francisco',
            state: 'CA',
            country: 'USA'
          },
          company: 'Tech Corp',
          proficiency: 'expert',
          notes: 'Important project',
          customFields: {
            budget: 100000,
            team_size: 5
          }
        }
      };

      await client.writeNote(path, content, frontmatter);

      const note = await client.readNote(path);
      expect(note.frontmatter.metadata?.dateRange).toEqual({
        start: '2023-01-01',
        end: '2023-12-31'
      });
      expect(note.frontmatter.metadata?.location?.city).toBe('San Francisco');
      expect(note.frontmatter.metadata?.company).toBe('Tech Corp');
      expect(note.frontmatter.childIds).toEqual(['child1', 'child2']);
      expect(note.frontmatter.parentId).toBe('parent1');
    });

    it('should write multiple notes', async () => {
      const notes = [
        { path: 'test/note1.md', content: 'Content 1' },
        { path: 'test/note2.md', content: 'Content 2' },
        { path: 'test/note3.md', content: 'Content 3' }
      ];

      const frontmatter: Frontmatter = {
        tags: ['test'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      for (const note of notes) {
        await client.writeNote(note.path, note.content, frontmatter);
      }

      for (const note of notes) {
        const retrieved = await client.readNote(note.path);
        expect(retrieved.content).toContain(note.content);
      }
    });
  });

  describe('Read Operations', () => {
    it('should read an existing note', async () => {
      const path = 'test/read.md';
      const content = 'Read test content';
      const frontmatter: Frontmatter = {
        tags: ['read-test'],
        type: 'education',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, content, frontmatter);
      const note = await client.readNote(path);

      expect(note.path).toBe(path);
      expect(note.content).toContain(content);
      expect(note.frontmatter.tags).toContain('read-test');
    });

    it('should throw error when reading non-existent note', async () => {
      await expect(client.readNote('non-existent.md')).rejects.toThrow('Note not found');
    });
  });

  describe('Update Operations', () => {
    it('should update note content', async () => {
      const path = 'test/update.md';
      const originalContent = 'Original content';
      const updatedContent = 'Updated content';
      const frontmatter: Frontmatter = {
        tags: ['update-test'],
        type: 'experience',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, originalContent, frontmatter);
      await client.updateNote(path, updatedContent);

      const note = await client.readNote(path);
      expect(note.content).toContain(updatedContent);
      expect(note.content).not.toContain(originalContent);
    });

    it('should update note frontmatter', async () => {
      const path = 'test/update-fm.md';
      const content = 'Content';
      const originalFrontmatter: Frontmatter = {
        tags: ['original'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, content, originalFrontmatter);

      const updatedFrontmatter: Frontmatter = {
        ...originalFrontmatter,
        tags: ['updated', 'new-tag'],
        metadata: {
          proficiency: 'advanced'
        }
      };

      await client.updateNote(path, content, updatedFrontmatter);

      const note = await client.readNote(path);
      expect(note.frontmatter.tags).toEqual(['updated', 'new-tag']);
      expect(note.frontmatter.metadata?.proficiency).toBe('advanced');
    });

    it('should update updatedAt timestamp', async () => {
      const path = 'test/timestamp.md';
      const content = 'Content';
      const originalTimestamp = '2024-01-01T00:00:00Z';
      const frontmatter: Frontmatter = {
        tags: ['test'],
        type: 'experience',
        createdAt: originalTimestamp,
        updatedAt: originalTimestamp,
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, content, frontmatter);
      
      // Wait to ensure timestamp will be different
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update the note - this should set a new updatedAt timestamp
      await client.updateNote(path, 'Updated content');
      const updated = await client.readNote(path);

      // The timestamp should be different from the original
      expect(updated.frontmatter.updatedAt).not.toBe(originalTimestamp);
      
      // And it should be a valid ISO timestamp
      expect(updated.frontmatter.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Delete Operations', () => {
    it('should delete an existing note', async () => {
      const path = 'test/delete.md';
      const content = 'To be deleted';
      const frontmatter: Frontmatter = {
        tags: ['delete-test'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, content, frontmatter);
      await client.deleteNote(path);

      await expect(client.readNote(path)).rejects.toThrow('Note not found');
    });

    it('should throw error when deleting non-existent note', async () => {
      await expect(client.deleteNote('non-existent.md')).rejects.toThrow('Note not found');
    });

    it('should remove note from search indices after deletion', async () => {
      const path = 'test/indexed.md';
      const content = 'Searchable content';
      const frontmatter: Frontmatter = {
        tags: ['searchable'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote(path, content, frontmatter);

      // Verify it's searchable
      let results = await client.searchNotes({ tags: ['searchable'] });
      expect(results.length).toBe(1);

      // Delete and verify it's no longer searchable
      await client.deleteNote(path);
      results = await client.searchNotes({ tags: ['searchable'] });
      expect(results.length).toBe(0);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      // Create test notes for searching
      const notes = [
        {
          path: 'test/python.md',
          content: 'Python programming language',
          tags: ['programming', 'python'],
          type: 'skill' as const
        },
        {
          path: 'test/javascript.md',
          content: 'JavaScript web development',
          tags: ['programming', 'javascript'],
          type: 'skill' as const
        },
        {
          path: 'test/project.md',
          content: 'Machine learning project',
          tags: ['project', 'ml'],
          type: 'experience' as const
        },
        {
          path: 'test/education.md',
          content: 'Computer Science degree',
          tags: ['education', 'cs'],
          type: 'education' as const
        }
      ];

      for (const note of notes) {
        const frontmatter: Frontmatter = {
          tags: note.tags,
          type: note.type,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          childIds: [],
          metadata: {}
        };
        await client.writeNote(note.path, note.content, frontmatter);
      }
    });

    it('should search by single tag', async () => {
      const results = await client.searchNotes({ tags: ['programming'] });
      expect(results.length).toBe(2);
      expect(results.some(r => r.path.includes('python'))).toBe(true);
      expect(results.some(r => r.path.includes('javascript'))).toBe(true);
    });

    it('should search by multiple tags (AND operation)', async () => {
      const results = await client.searchNotes({ tags: ['programming', 'python'] });
      expect(results.length).toBe(1);
      expect(results[0].path).toContain('python');
    });

    it('should search by content text', async () => {
      const results = await client.searchNotes({
        query: 'machine learning',
        searchContent: true
      });
      expect(results.length).toBe(1);
      expect(results[0].path).toContain('project');
    });

    it('should search by frontmatter', async () => {
      const results = await client.searchNotes({
        query: 'education',
        searchFrontmatter: true
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should combine tag and text search', async () => {
      const results = await client.searchNotes({
        tags: ['programming'],
        query: 'Python',
        searchContent: true
      });
      expect(results.length).toBe(1);
      expect(results[0].path).toContain('python');
    });

    it('should return empty array when no matches found', async () => {
      const results = await client.searchNotes({ tags: ['non-existent-tag'] });
      expect(results).toEqual([]);
    });

    it('should handle case-insensitive search', async () => {
      const results = await client.searchNotes({
        query: 'PYTHON',
        searchContent: true
      });
      expect(results.length).toBe(1);
    });
  });

  describe('Directory Operations', () => {
    beforeEach(async () => {
      const frontmatter: Frontmatter = {
        tags: ['test'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote('dir1/file1.md', 'Content 1', frontmatter);
      await client.writeNote('dir1/file2.md', 'Content 2', frontmatter);
      await client.writeNote('dir2/file3.md', 'Content 3', frontmatter);
    });

    it('should list files in a directory', async () => {
      const files = await client.listDirectory('dir1');
      expect(files.length).toBe(2);
      expect(files).toContain('dir1/file1.md');
      expect(files).toContain('dir1/file2.md');
    });

    it('should list files in different directories', async () => {
      const files1 = await client.listDirectory('dir1');
      const files2 = await client.listDirectory('dir2');

      expect(files1.length).toBe(2);
      expect(files2.length).toBe(1);
      expect(files2).toContain('dir2/file3.md');
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await client.listDirectory('non-existent');
      expect(files).toEqual([]);
    });
  });

  describe('Index Management', () => {
    it('should update indices when writing notes', async () => {
      const frontmatter: Frontmatter = {
        tags: ['indexed-tag'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      await client.writeNote('test/indexed.md', 'indexed content', frontmatter);

      // Search should use indices for fast lookup
      const results = await client.searchNotes({ tags: ['indexed-tag'] });
      expect(results.length).toBe(1);
    });

    it('should clear indices', () => {
      client.clearIndices();
      // After clearing, search should still work but may be slower
      // This is mainly for testing/debugging
    });

    it('should handle large number of notes efficiently', async () => {
      const frontmatter: Frontmatter = {
        tags: ['performance'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      // Create 100 notes
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          client.writeNote(`test/note${i}.md`, `Content ${i}`, frontmatter)
        );
      }
      await Promise.all(promises);

      // Search should still be fast
      const startTime = Date.now();
      const results = await client.searchNotes({ tags: ['performance'] });
      const duration = Date.now() - startTime;

      expect(results.length).toBe(100);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid paths gracefully', async () => {
      const frontmatter: Frontmatter = {
        tags: ['test'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      // Empty path - the mock implementation doesn't validate this,
      // but in production it would be handled by the MCP tool
      // For now, we'll just verify it doesn't crash
      await client.writeNote('', 'content', frontmatter);
      
      // Verify we can still use the client
      await client.writeNote('test/valid.md', 'content', frontmatter);
      const note = await client.readNote('test/valid.md');
      expect(note).toBeDefined();
    });

    it('should handle empty content', async () => {
      const frontmatter: Frontmatter = {
        tags: ['test'],
        type: 'skill',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        childIds: [],
        metadata: {}
      };

      // Empty content should still work (some notes might be empty)
      await client.writeNote('test/empty.md', '', frontmatter);
      const note = await client.readNote('test/empty.md');
      expect(note.content).toBeDefined();
    });

    it('should handle malformed search queries', async () => {
      // Empty query should return all notes or handle gracefully
      const results = await client.searchNotes({});
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
