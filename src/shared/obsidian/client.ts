/**
 * Obsidian MCP Client
 *
 * Client for interacting with Obsidian vault via filesystem or mock storage.
 * Supports both test mode (in-memory) and production mode (filesystem).
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErrorHandler } from '../../main/errorHandler';
import {
  ContentType,
  Frontmatter,
  NoteContent,
  ObsidianQuery,
  NoteSearchResult
} from './types';

/**
 * Client configuration options
 */
export interface ObsidianClientOptions {
  /**
   * Use mock storage instead of filesystem (for testing)
   * Defaults to true in NODE_ENV=test, false otherwise
   */
  useMock?: boolean;

  /**
   * Absolute path to the Obsidian vault root
   * Required for production mode
   */
  vaultRootPath?: string;
}

/**
 * Obsidian MCP Client interface
 */
export interface ObsidianMCPClient {
  writeNote(path: string, content: string, frontmatter: Frontmatter): Promise<void>;
  readNote(path: string): Promise<NoteContent>;
  updateNote(path: string, content: string, frontmatter?: Frontmatter): Promise<void>;
  deleteNote(path: string): Promise<void>;
  searchNotes(query: ObsidianQuery): Promise<NoteSearchResult[]>;
  listDirectory(path: string): Promise<string[]>;
}

/**
 * Obsidian MCP Client implementation
 * Wraps filesystem operations for vault management
 */
export class ObsidianMCPClientImpl implements ObsidianMCPClient {
  private vaultPath: string;
  private vaultRootPath: string;
  private useMock: boolean;
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> set of paths
  private contentIndex: Map<string, Set<string>> = new Map(); // word -> set of paths

  constructor(vaultPath: string = 'resume-content', options?: ObsidianClientOptions) {
    this.vaultPath = vaultPath;
    this.useMock = options?.useMock ?? (process.env.NODE_ENV === 'test');

    // Set vault root path - default to user's home directory Obsidian vault
    if (options?.vaultRootPath) {
      this.vaultRootPath = options.vaultRootPath;
    } else {
      // Default to a common Obsidian vault location
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      this.vaultRootPath = path.join(homeDir, 'Documents', 'ObsidianVault');
    }
  }

  /**
   * Gets the full filesystem path for a note
   */
  private getFullPath(notePath: string): string {
    return path.join(this.vaultRootPath, notePath);
  }

  /**
   * Ensures a directory exists, creating it if necessary
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!this.useMock) {
      const fullPath = path.dirname(this.getFullPath(dirPath));
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  /**
   * Updates the search indices when a note is written or updated
   */
  private updateIndices(notePath: string, content: string, frontmatter: Frontmatter): void {
    // Update tag index
    frontmatter.tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(notePath);
    });

    // Update content index (simple word-based indexing)
    const words = content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 2) { // Only index words longer than 2 chars
        if (!this.contentIndex.has(word)) {
          this.contentIndex.set(word, new Set());
        }
        this.contentIndex.get(word)!.add(notePath);
      }
    });
  }

  /**
   * Removes a path from all indices
   */
  private removeFromIndices(notePath: string): void {
    // Remove from tag index
    this.tagIndex.forEach(paths => paths.delete(notePath));

    // Remove from content index
    this.contentIndex.forEach(paths => paths.delete(notePath));
  }

  /**
   * Clears all indices (useful for testing or rebuilding)
   */
  clearIndices(): void {
    this.tagIndex.clear();
    this.contentIndex.clear();
  }

  /**
   * Parses markdown content with YAML frontmatter
   * @param fullContent - Complete markdown with frontmatter
   * @returns Parsed content and frontmatter
   */
  parseMarkdownWithFrontmatter(fullContent: string): { content: string; frontmatter: Frontmatter } {
    const frontmatterMatch = fullContent.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);

    if (!frontmatterMatch) {
      throw new Error('Invalid markdown format: missing frontmatter');
    }

    const yamlContent = frontmatterMatch[1];
    const markdownContent = frontmatterMatch[2];

    // Parse YAML frontmatter
    const frontmatter = this.parseYamlFrontmatter(yamlContent);

    return {
      content: markdownContent,
      frontmatter
    };
  }

  /**
   * Parses YAML frontmatter string into Frontmatter object
   * @param yaml - YAML string content
   * @returns Parsed Frontmatter object
   */
  private parseYamlFrontmatter(yaml: string): Frontmatter {
    const lines = yaml.split('\n');
    const result: Record<string, any> = {
      tags: [],
      type: ContentType.SKILL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {}
    };

    let currentKey = '';
    let inArray = false;
    let inObject = false;
    let objectKey = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for array items
      if (trimmed.startsWith('- ') && inArray) {
        const value = trimmed.substring(2).trim();
        if (currentKey === 'tags' || currentKey === 'childIds') {
          result[currentKey].push(value);
        }
        continue;
      }

      // Check for nested object properties
      if (line.startsWith('  ') && !line.startsWith('  -') && inObject) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();

          if (objectKey === 'metadata') {
            if (key === 'dateRange' || key === 'location') {
              result.metadata[key] = result.metadata[key] || {};
            } else if (line.startsWith('    ')) {
              // Nested within dateRange or location
              const parentKey = Object.keys(result.metadata).find(k =>
                k === 'dateRange' || k === 'location'
              );
              if (parentKey && typeof result.metadata[parentKey] === 'object') {
                result.metadata[parentKey][key] = value || undefined;
              }
            } else if (value) {
              result.metadata[key] = value;
            }
          }
        }
        continue;
      }

      // Parse top-level key-value pairs
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        currentKey = key;
        inArray = false;
        inObject = false;

        if (key === 'tags') {
          // Check if inline array format: [tag1, tag2]
          if (value.startsWith('[') && value.endsWith(']')) {
            result.tags = value
              .slice(1, -1)
              .split(',')
              .map(t => t.trim())
              .filter(t => t.length > 0);
          } else if (!value) {
            result.tags = [];
            inArray = true;
          }
        } else if (key === 'childIds') {
          if (!value) {
            result.childIds = [];
            inArray = true;
          }
        } else if (key === 'metadata') {
          inObject = true;
          objectKey = 'metadata';
        } else if (key === 'type') {
          result.type = value as ContentType;
        } else if (key === 'createdAt' || key === 'updatedAt') {
          result[key] = value;
        } else if (key === 'parentId' && value) {
          result.parentId = value;
        }
      }
    }

    return result as Frontmatter;
  }

  /**
   * Writes a note to the Obsidian vault
   * @param notePath - Relative path within the vault
   * @param content - Markdown content
   * @param frontmatter - YAML frontmatter data
   */
  async writeNote(notePath: string, content: string, frontmatter: Frontmatter): Promise<void> {
    return ErrorHandler.handleAsync(
      async () => {
        // Build the full markdown content with frontmatter
        const fullContent = this.buildMarkdownWithFrontmatter(content, frontmatter);

        if (this.useMock) {
          // Store in memory for testing
          this.mockStorage.set(notePath, { path: notePath, content: fullContent, frontmatter });
        } else {
          // Write to filesystem
          await this.ensureDirectory(notePath);
          const fullPath = this.getFullPath(notePath);
          fs.writeFileSync(fullPath, fullContent, 'utf-8');
        }

        // Update search indices for performance
        this.updateIndices(notePath, content, frontmatter);
      },
      (error) => ErrorHandler.createStorageError(
        'Failed to write note to vault',
        error instanceof Error ? error.message : 'Unknown error',
        { path: notePath }
      )
    );
  }

  /**
   * Reads a note from the Obsidian vault
   * @param notePath - Relative path within the vault
   * @returns Note content with parsed frontmatter
   */
  async readNote(notePath: string): Promise<NoteContent> {
    try {
      if (this.useMock) {
        const stored = this.mockStorage.get(notePath);

        if (!stored) {
          throw new Error(`Note not found: ${notePath}`);
        }

        return stored;
      } else {
        // Read from filesystem
        const fullPath = this.getFullPath(notePath);

        if (!fs.existsSync(fullPath)) {
          throw new Error(`Note not found: ${notePath}`);
        }

        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const { content, frontmatter } = this.parseMarkdownWithFrontmatter(fileContent);

        return {
          path: notePath,
          content: fileContent,
          frontmatter
        };
      }
    } catch (error) {
      throw new Error(`Failed to read note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates an existing note in the Obsidian vault
   * @param notePath - Relative path within the vault
   * @param content - New markdown content
   * @param frontmatter - Optional updated frontmatter
   */
  async updateNote(notePath: string, content: string, frontmatter?: Frontmatter): Promise<void> {
    try {
      // Read existing note to get current frontmatter if not provided
      const existing = await this.readNote(notePath);
      const updatedFrontmatter = frontmatter || existing.frontmatter;

      // Update the updatedAt timestamp
      updatedFrontmatter.updatedAt = new Date().toISOString();

      // Remove old indices
      this.removeFromIndices(notePath);

      // Write the updated note
      await this.writeNote(notePath, content, updatedFrontmatter);
    } catch (error) {
      throw new Error(`Failed to update note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deletes a note from the Obsidian vault
   * @param notePath - Relative path within the vault
   */
  async deleteNote(notePath: string): Promise<void> {
    try {
      if (this.useMock) {
        const deleted = this.mockStorage.delete(notePath);

        if (!deleted) {
          throw new Error(`Note not found: ${notePath}`);
        }
      } else {
        // Delete from filesystem
        const fullPath = this.getFullPath(notePath);

        if (!fs.existsSync(fullPath)) {
          throw new Error(`Note not found: ${notePath}`);
        }

        fs.unlinkSync(fullPath);
      }

      // Remove from indices
      this.removeFromIndices(notePath);
    } catch (error) {
      throw new Error(`Failed to delete note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Searches for notes in the Obsidian vault
   * Uses indexed search for improved performance with large vaults
   * @param query - Search query with filters
   * @returns Array of matching notes
   */
  async searchNotes(query: ObsidianQuery): Promise<NoteSearchResult[]> {
    try {
      // Use indexed search when possible for better performance
      let candidatePaths: Set<string> | null = null;

      // If we have tag filters, use tag index
      if (query.tags && query.tags.length > 0) {
        // Find intersection of all tag sets (AND operation)
        const tagSets = query.tags
          .map(tag => this.tagIndex.get(tag))
          .filter((set): set is Set<string> => set !== undefined);

        if (tagSets.length === 0) {
          return []; // No notes with these tags
        }

        // Start with first set
        candidatePaths = new Set(tagSets[0]);

        // Intersect with remaining sets
        for (let i = 1; i < tagSets.length; i++) {
          candidatePaths = new Set(
            [...candidatePaths].filter(notePath => tagSets[i].has(notePath))
          );
        }

        if (candidatePaths.size === 0) {
          return []; // No notes match all tags
        }
      }

      // If we have text query, use content index
      if (query.query) {
        const words = query.query.toLowerCase().split(/\s+/);
        const wordSets = words
          .filter(word => word.length > 2)
          .map(word => this.contentIndex.get(word))
          .filter((set): set is Set<string> => set !== undefined);

        if (wordSets.length > 0) {
          // Find union of all word sets (OR operation for words)
          const textCandidates = new Set<string>();
          wordSets.forEach(set => {
            set.forEach(notePath => textCandidates.add(notePath));
          });

          // Intersect with tag candidates if we have them
          if (candidatePaths) {
            candidatePaths = new Set(
              [...candidatePaths].filter(notePath => textCandidates.has(notePath))
            );
          } else {
            candidatePaths = textCandidates;
          }
        }
      }

      // Get paths to search
      let pathsToSearch: string[];

      if (this.useMock) {
        pathsToSearch = candidatePaths
          ? Array.from(candidatePaths)
          : Array.from(this.mockStorage.keys());
      } else {
        // In production mode, we need to scan the filesystem if no index hits
        if (candidatePaths) {
          pathsToSearch = Array.from(candidatePaths);
        } else {
          // Rebuild index from filesystem if empty
          if (this.tagIndex.size === 0 && this.contentIndex.size === 0) {
            await this.rebuildIndexFromFilesystem();
          }
          pathsToSearch = Array.from(new Set([
            ...Array.from(this.tagIndex.values()).flatMap(s => Array.from(s)),
            ...Array.from(this.contentIndex.values()).flatMap(s => Array.from(s))
          ]));
        }
      }

      const results: NoteSearchResult[] = [];

      for (const notePath of pathsToSearch) {
        let note: NoteContent;

        try {
          note = await this.readNote(notePath);
        } catch {
          continue; // Skip notes that can't be read
        }

        let matches = true;

        // Verify tag match (already filtered by index, but double-check)
        if (query.tags && query.tags.length > 0) {
          const hasAllTags = query.tags.every(tag =>
            note.frontmatter.tags.includes(tag)
          );
          if (!hasAllTags) {
            matches = false;
          }
        }

        // Verify text match if needed
        if (matches && query.query) {
          let textMatches = false;

          if (query.searchContent) {
            if (note.content.toLowerCase().includes(query.query.toLowerCase())) {
              textMatches = true;
            }
          }

          if (query.searchFrontmatter && !textMatches) {
            const frontmatterStr = JSON.stringify(note.frontmatter).toLowerCase();
            if (frontmatterStr.includes(query.query.toLowerCase())) {
              textMatches = true;
            }
          }

          if (!textMatches) {
            matches = false;
          }
        }

        if (matches) {
          results.push({
            path: note.path,
            content: note.content,
            frontmatter: note.frontmatter
          });
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to search notes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rebuilds the search index from filesystem
   * Used in production mode when index is empty (cold start)
   */
  private async rebuildIndexFromFilesystem(): Promise<void> {
    if (this.useMock) return;

    // Scan from the vault root to include all subdirectories (resume-content, resume-vaults, etc.)
    const vaultRoot = this.vaultRootPath;
    if (!fs.existsSync(vaultRoot)) return;

    const scanDirectory = (dirPath: string, relativePath: string = '') => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          scanDirectory(entryPath, relPath);
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
          try {
            const content = fs.readFileSync(entryPath, 'utf-8');
            const { frontmatter } = this.parseMarkdownWithFrontmatter(content);
            this.updateIndices(relPath, content, frontmatter);
          } catch {
            // Skip files that can't be parsed
          }
        }
      }
    };

    scanDirectory(vaultRoot);
  }

  /**
   * Lists all files in a directory
   * @param dirPath - Directory path within the vault
   * @returns Array of file paths
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    try {
      if (this.useMock) {
        const files: string[] = [];

        for (const filePath of this.mockStorage.keys()) {
          if (filePath.startsWith(dirPath)) {
            files.push(filePath);
          }
        }

        return files;
      } else {
        // List from filesystem
        const fullPath = this.getFullPath(dirPath);

        if (!fs.existsSync(fullPath)) {
          return [];
        }

        const files: string[] = [];
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
            files.push(path.join(dirPath, entry.name));
          } else if (entry.isDirectory()) {
            // Recursively list subdirectories
            const subFiles = await this.listDirectory(path.join(dirPath, entry.name));
            files.push(...subFiles);
          }
        }

        return files;
      }
    } catch (error) {
      throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Builds markdown content with YAML frontmatter
   * @param content - Markdown content
   * @param frontmatter - Frontmatter data
   * @returns Complete markdown with frontmatter
   */
  private buildMarkdownWithFrontmatter(content: string, frontmatter: Frontmatter): string {
    const yaml = this.frontmatterToYaml(frontmatter);
    return `---\n${yaml}---\n\n${content}`;
  }

  /**
   * Converts frontmatter object to YAML string
   * @param frontmatter - Frontmatter data
   * @returns YAML string
   */
  private frontmatterToYaml(frontmatter: Frontmatter): string {
    const lines: string[] = [];

    // Tags
    if (frontmatter.tags && frontmatter.tags.length > 0) {
      lines.push(`tags: [${frontmatter.tags.join(', ')}]`);
    } else {
      lines.push('tags: []');
    }

    // Type
    lines.push(`type: ${frontmatter.type}`);

    // Timestamps
    lines.push(`createdAt: ${frontmatter.createdAt}`);
    lines.push(`updatedAt: ${frontmatter.updatedAt}`);

    // Parent ID
    if (frontmatter.parentId) {
      lines.push(`parentId: ${frontmatter.parentId}`);
    }

    // Child IDs
    if (frontmatter.childIds && frontmatter.childIds.length > 0) {
      lines.push('childIds:');
      frontmatter.childIds.forEach(id => {
        lines.push(`  - ${id}`);
      });
    }

    // Metadata
    if (frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0) {
      lines.push('metadata:');

      // Date range
      if (frontmatter.metadata.dateRange) {
        lines.push('  dateRange:');
        lines.push(`    start: ${frontmatter.metadata.dateRange.start}`);
        if (frontmatter.metadata.dateRange.end) {
          lines.push(`    end: ${frontmatter.metadata.dateRange.end}`);
        }
      }

      // Location
      if (frontmatter.metadata.location) {
        lines.push('  location:');
        if (frontmatter.metadata.location.city) {
          lines.push(`    city: ${frontmatter.metadata.location.city}`);
        }
        if (frontmatter.metadata.location.state) {
          lines.push(`    state: ${frontmatter.metadata.location.state}`);
        }
        if (frontmatter.metadata.location.country) {
          lines.push(`    country: ${frontmatter.metadata.location.country}`);
        }
      }

      // Company
      if (frontmatter.metadata.company) {
        lines.push(`  company: ${frontmatter.metadata.company}`);
      }

      // Proficiency
      if (frontmatter.metadata.proficiency) {
        lines.push(`  proficiency: ${frontmatter.metadata.proficiency}`);
      }

      // Notes
      if (frontmatter.metadata.notes) {
        lines.push(`  notes: ${frontmatter.metadata.notes}`);
      }

      // Custom fields
      if (frontmatter.metadata.customFields) {
        Object.entries(frontmatter.metadata.customFields).forEach(([key, value]) => {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        });
      }
    }

    return lines.join('\n') + '\n';
  }

  // Mock storage for testing
  private mockStorage: Map<string, NoteContent> = new Map();

  /**
   * Clears the mock storage (for testing only)
   */
  clearMockStorage(): void {
    this.mockStorage.clear();
    this.clearIndices();
  }

  /**
   * Checks if the client is in mock mode
   */
  isUsingMock(): boolean {
    return this.useMock;
  }

  /**
   * Gets the configured vault root path
   */
  getVaultRootPath(): string {
    return this.vaultRootPath;
  }

  /**
   * Sets the vault root path (for runtime configuration)
   */
  setVaultRootPath(rootPath: string): void {
    this.vaultRootPath = rootPath;
  }
}

// Export singleton instance with default configuration
export const obsidianClient = new ObsidianMCPClientImpl();
