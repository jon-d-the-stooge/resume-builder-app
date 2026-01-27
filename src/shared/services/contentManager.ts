import {
  ContentManager,
  ContentItem,
  ContentItemInput,
  ContentType,
  SearchQuery,
  Frontmatter,
  DateRange
} from '../../types';
import { StorageProvider, FileStorage } from '../storage';
import { markdownGenerator } from './markdownGenerator';
import { SearchQueryBuilder } from './searchQueryBuilder';
import * as path from 'path';

/**
 * Configuration options for ContentManagerImpl
 */
export interface ContentManagerOptions {
  /**
   * Storage provider for persistence
   * Defaults to FileStorage with user's Documents/ObsidianVault path
   */
  storage?: StorageProvider;

  /**
   * Root path for FileStorage (only used if storage not provided)
   */
  storagePath?: string;
}

/**
 * Content Manager implementation
 * Handles creation, updates, deletion, and search of content items
 */
export class ContentManagerImpl implements ContentManager {
  // In-memory cache for content items
  private contentItems: Map<string, ContentItem> = new Map();

  // Track parent-child relationships
  private childToParent: Map<string, string> = new Map();
  private parentToChildren: Map<string, Set<string>> = new Map();

  // Storage provider for persistence
  private storage: StorageProvider;

  constructor(options?: ContentManagerOptions) {
    if (options?.storage) {
      this.storage = options.storage;
    } else {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const defaultPath = options?.storagePath || path.join(homeDir, 'Documents', 'ObsidianVault');
      this.storage = new FileStorage(defaultPath);
    }
  }

  /**
   * Convert frontmatter object to YAML string
   */
  private frontmatterToYaml(frontmatter: Frontmatter): string {
    const lines: string[] = [];

    if (frontmatter.tags && frontmatter.tags.length > 0) {
      lines.push(`tags: [${frontmatter.tags.join(', ')}]`);
    } else {
      lines.push('tags: []');
    }

    lines.push(`type: ${frontmatter.type}`);
    lines.push(`createdAt: ${frontmatter.createdAt}`);
    lines.push(`updatedAt: ${frontmatter.updatedAt}`);

    if (frontmatter.parentId) {
      lines.push(`parentId: ${frontmatter.parentId}`);
    }

    if (frontmatter.childIds && frontmatter.childIds.length > 0) {
      lines.push('childIds:');
      frontmatter.childIds.forEach(id => lines.push(`  - ${id}`));
    }

    if (frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0) {
      lines.push(`metadata: ${JSON.stringify(frontmatter.metadata)}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Build markdown content with frontmatter
   */
  private buildMarkdownWithFrontmatter(content: string, frontmatter: Frontmatter): string {
    const yaml = this.frontmatterToYaml(frontmatter);
    return `---\n${yaml}---\n\n${content}`;
  }

  /**
   * Write a note with frontmatter to storage
   */
  private async writeNote(filePath: string, content: string, frontmatter: Frontmatter): Promise<void> {
    const fullContent = this.buildMarkdownWithFrontmatter(content, frontmatter);
    await this.storage.write(filePath, fullContent);
  }

  /**
   * Delete a note from storage
   */
  private async deleteNote(filePath: string): Promise<void> {
    await this.storage.delete(filePath);
  }
  /**
   * Creates a new content item with appropriate tags
   * @param item - The content item input data
   * @returns Promise resolving to the created content item
   */
  async createContentItem(item: ContentItemInput): Promise<ContentItem> {
    // Generate unique ID
    const id = this.generateId(item.type);

    // Apply automatic tags based on content type
    const tags = this.applyAutomaticTags(item.type, item.tags);

    // Generate file path based on content type and ID
    const filePath = this.generateFilePath(item.type, id, item.parentId);

    // Create timestamps
    const now = new Date();

    // Create the content item
    const contentItem: ContentItem = {
      ...item,
      id,
      tags,
      filePath,
      createdAt: now,
      updatedAt: now
    };

    // Store in cache
    this.contentItems.set(id, contentItem);

    // Track parent-child relationship
    if (item.parentId) {
      this.childToParent.set(id, item.parentId);

      if (!this.parentToChildren.has(item.parentId)) {
        this.parentToChildren.set(item.parentId, new Set());
      }
      this.parentToChildren.get(item.parentId)!.add(id);
    }

    // Generate markdown content
    const markdown = markdownGenerator.generateMarkdown(contentItem);

    // Create frontmatter
    const frontmatter: Frontmatter = {
      tags: contentItem.tags,
      type: contentItem.type,
      createdAt: contentItem.createdAt.toISOString(),
      updatedAt: contentItem.updatedAt.toISOString(),
      metadata: contentItem.metadata,
      parentId: contentItem.parentId,
      childIds: this.parentToChildren.get(id)
        ? Array.from(this.parentToChildren.get(id)!)
        : undefined
    };

    // Write to vault
    await this.writeNote(filePath, markdown, frontmatter);

    return contentItem;
  }

  /**
   * Gets a content item by its ID
   * @param id - The ID of the content item to retrieve
   * @returns Promise resolving to the content item, or null if not found
   */
  async getContentItemById(id: string): Promise<ContentItem | null> {
    return this.contentItems.get(id) || null;
  }

  /**
   * Updates an existing content item
   * @param id - The ID of the content item to update
   * @param updates - Partial updates to apply
   * @returns Promise resolving to the updated content item
   */
  async updateContentItem(id: string, updates: Partial<ContentItem>): Promise<ContentItem> {
    // Get existing item
    const existing = this.contentItems.get(id);
    if (!existing) {
      throw new Error(`Content item not found: ${id}`);
    }

    // Preserve creation timestamp
    const updatedItem: ContentItem = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      createdAt: existing.createdAt, // Preserve creation timestamp
      updatedAt: new Date() // Update modification timestamp
    };

    // Update cache
    this.contentItems.set(id, updatedItem);

    // Generate updated markdown
    const markdown = markdownGenerator.generateMarkdown(updatedItem);

    // Create updated frontmatter
    const frontmatter: Frontmatter = {
      tags: updatedItem.tags,
      type: updatedItem.type,
      createdAt: updatedItem.createdAt.toISOString(),
      updatedAt: updatedItem.updatedAt.toISOString(),
      metadata: updatedItem.metadata,
      parentId: updatedItem.parentId,
      childIds: this.parentToChildren.get(id)
        ? Array.from(this.parentToChildren.get(id)!)
        : undefined
    };

    // Update in vault
    await this.writeNote(updatedItem.filePath, markdown, frontmatter);

    return updatedItem;
  }

  /**
   * Deletes a content item
   * @param id - The ID of the content item to delete
   */
  async deleteContentItem(id: string): Promise<void> {
    // Get existing item
    const existing = this.contentItems.get(id);
    if (!existing) {
      throw new Error(`Content item not found: ${id}`);
    }

    // Remove from cache
    this.contentItems.delete(id);

    // Remove parent-child relationships
    if (existing.parentId) {
      this.childToParent.delete(id);
      this.parentToChildren.get(existing.parentId)?.delete(id);
    }

    // Remove as parent
    this.parentToChildren.delete(id);

    // Delete from vault
    await this.deleteNote(existing.filePath);
  }

  /**
   * Links two content items in a parent-child relationship
   * Updates both parent and child markdown files with Obsidian links
   * @param parentId - The ID of the parent content item
   * @param childId - The ID of the child content item
   */
  async linkContentItems(parentId: string, childId: string): Promise<void> {
    // Verify both items exist
    const parent = this.contentItems.get(parentId);
    const child = this.contentItems.get(childId);

    if (!parent) {
      throw new Error(`Parent content item not found: ${parentId}`);
    }
    if (!child) {
      throw new Error(`Child content item not found: ${childId}`);
    }

    // Update relationships in memory
    this.childToParent.set(childId, parentId);

    if (!this.parentToChildren.has(parentId)) {
      this.parentToChildren.set(parentId, new Set());
    }
    this.parentToChildren.get(parentId)!.add(childId);

    // Update child's parentId and regenerate markdown with parent link
    child.parentId = parentId;
    child.updatedAt = new Date();
    this.contentItems.set(childId, child);

    // Generate updated child markdown with parent link
    const childMarkdown = markdownGenerator.generateMarkdown(child);
    const childFrontmatter: Frontmatter = {
      tags: child.tags,
      type: child.type,
      createdAt: child.createdAt.toISOString(),
      updatedAt: child.updatedAt.toISOString(),
      metadata: child.metadata,
      parentId: parentId,
      childIds: this.parentToChildren.get(childId)
        ? Array.from(this.parentToChildren.get(childId)!)
        : undefined
    };

    // Write updated child note
    await this.writeNote(child.filePath, childMarkdown, childFrontmatter);

    // Update parent's markdown with child links
    parent.updatedAt = new Date();
    this.contentItems.set(parentId, parent);

    // Get all child IDs for the parent
    const childIds = Array.from(this.parentToChildren.get(parentId)!);

    // Generate parent markdown
    let parentMarkdown = markdownGenerator.generateMarkdown(parent);

    // Add child links to parent markdown
    parentMarkdown = markdownGenerator.addChildLinks(parentMarkdown, childIds);

    const parentFrontmatter: Frontmatter = {
      tags: parent.tags,
      type: parent.type,
      createdAt: parent.createdAt.toISOString(),
      updatedAt: parent.updatedAt.toISOString(),
      metadata: parent.metadata,
      parentId: parent.parentId,
      childIds: childIds
    };

    // Write updated parent note
    await this.writeNote(parent.filePath, parentMarkdown, parentFrontmatter);
  }

  /**
   * Links a skill to multiple job entries (many-to-many relationship)
   * Skills can be applied at multiple jobs
   * @param skillId - The ID of the skill content item
   * @param jobIds - Array of job entry IDs where the skill was applied
   */
  async linkSkillToMultipleJobs(skillId: string, jobIds: string[]): Promise<void> {
    // Verify skill exists
    const skill = this.contentItems.get(skillId);
    if (!skill) {
      throw new Error(`Skill content item not found: ${skillId}`);
    }

    if (skill.type !== ContentType.SKILL) {
      throw new Error(`Content item ${skillId} is not a skill`);
    }

    // Verify all jobs exist
    for (const jobId of jobIds) {
      const job = this.contentItems.get(jobId);
      if (!job) {
        throw new Error(`Job entry not found: ${jobId}`);
      }
      if (job.type !== ContentType.JOB_ENTRY) {
        throw new Error(`Content item ${jobId} is not a job entry`);
      }
    }

    // Link skill to each job
    for (const jobId of jobIds) {
      // Add to parent-child tracking
      if (!this.parentToChildren.has(jobId)) {
        this.parentToChildren.set(jobId, new Set());
      }
      this.parentToChildren.get(jobId)!.add(skillId);

      // Update job's markdown with skill link
      const job = this.contentItems.get(jobId)!;
      job.updatedAt = new Date();

      const childIds = Array.from(this.parentToChildren.get(jobId)!);
      let jobMarkdown = markdownGenerator.generateMarkdown(job);
      jobMarkdown = markdownGenerator.addChildLinks(jobMarkdown, childIds);

      const jobFrontmatter: Frontmatter = {
        tags: job.tags,
        type: job.type,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        metadata: job.metadata,
        parentId: job.parentId,
        childIds: childIds
      };

      await this.writeNote(job.filePath, jobMarkdown, jobFrontmatter);
    }

    // Update skill's markdown to reference all jobs
    skill.updatedAt = new Date();
    this.contentItems.set(skillId, skill);

    // Generate skill markdown with multiple parent references
    const skillMarkdown = this.generateSkillMarkdownWithMultipleJobs(skill, jobIds);

    const skillFrontmatter: Frontmatter = {
      tags: skill.tags,
      type: skill.type,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
      metadata: {
        ...skill.metadata,
        // Store multiple parent job IDs in custom fields
        customFields: {
          ...skill.metadata.customFields,
          parentJobIds: jobIds
        }
      },
      parentId: skill.parentId, // Keep primary parent if exists
      childIds: undefined
    };

    await this.writeNote(skill.filePath, skillMarkdown, skillFrontmatter);
  }

  /**
   * Generates markdown for a skill with multiple job references
   * @param skill - The skill content item
   * @param jobIds - Array of job IDs where skill was applied
   * @returns Markdown content with multiple job links
   */
  private generateSkillMarkdownWithMultipleJobs(skill: ContentItem, jobIds: string[]): string {
    const lines: string[] = [];

    // Title
    lines.push(`# ${skill.content}`);
    lines.push('');

    // Proficiency
    if (skill.metadata.proficiency) {
      lines.push(`**Proficiency**: ${skill.metadata.proficiency}`);
      lines.push('');
    }

    // Notes
    if (skill.metadata.notes) {
      lines.push(skill.metadata.notes);
      lines.push('');
    }

    // Applied at (multiple jobs)
    if (jobIds.length > 0) {
      lines.push('## Applied At');
      lines.push('');
      jobIds.forEach(jobId => {
        lines.push(`- [[${jobId}]]`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Parse frontmatter from markdown content
   */
  private parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    if (!match) return null;

    try {
      const yamlContent = match[1];
      const body = match[2];

      // Simple YAML parsing for our known structure
      const frontmatter: Partial<Frontmatter> = {
        tags: [],
        type: ContentType.SKILL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {}
      };

      for (const line of yamlContent.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();

        if (key === 'tags') {
          if (value.startsWith('[') && value.endsWith(']')) {
            frontmatter.tags = value.slice(1, -1).split(',').map(t => t.trim()).filter(t => t.length > 0);
          }
        } else if (key === 'type') {
          frontmatter.type = value as ContentType;
        } else if (key === 'createdAt' || key === 'updatedAt') {
          (frontmatter as any)[key] = value;
        } else if (key === 'parentId' && value) {
          frontmatter.parentId = value;
        } else if (key === 'metadata') {
          try {
            frontmatter.metadata = JSON.parse(value);
          } catch { /* ignore parsing errors */ }
        }
      }

      return { frontmatter: frontmatter as Frontmatter, body };
    } catch {
      return null;
    }
  }

  /**
   * Recursively scan a directory for markdown files
   */
  private async scanDirectory(directory: string): Promise<Array<{ path: string; content: string; frontmatter: Frontmatter }>> {
    const results: Array<{ path: string; content: string; frontmatter: Frontmatter }> = [];

    try {
      const exists = await this.storage.exists(directory);
      if (!exists) return results;

      const entries = await this.storage.list(directory);

      for (const entry of entries) {
        const fullPath = `${directory}/${entry}`;

        if (entry.endsWith('.md')) {
          try {
            const content = await this.storage.read(fullPath);
            const parsed = this.parseFrontmatter(content);
            if (parsed) {
              results.push({ path: fullPath, content: parsed.body, frontmatter: parsed.frontmatter });
            }
          } catch { /* skip unreadable files */ }
        } else if (!entry.includes('.')) {
          // Likely a directory, recurse
          const subResults = await this.scanDirectory(fullPath);
          results.push(...subResults);
        }
      }
    } catch { /* ignore directory errors */ }

    return results;
  }

  /**
   * Searches for content items based on query criteria
   * Supports tag-based filtering, text search, date range filtering,
   * and multiple simultaneous filters
   * @param query - The search query
   * @returns Promise resolving to matching content items with hierarchical context
   */
  async searchContentItems(query: SearchQuery): Promise<ContentItem[]> {
    // Validate query has at least one criterion
    if (!SearchQueryBuilder.isValid(query)) {
      throw new Error('Search query must have at least one filter criterion');
    }

    // Scan the resume-content directory
    const results = await this.scanDirectory('resume-content');

    // Filter results based on query
    const filteredResults = results.filter(result => {
      // Filter by tags
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(tag => result.frontmatter.tags.includes(tag));
        if (!hasAllTags) return false;
      }

      // Filter by text
      if (query.text) {
        const searchText = query.text.toLowerCase();
        const contentMatches = result.content.toLowerCase().includes(searchText);
        const frontmatterMatches = JSON.stringify(result.frontmatter).toLowerCase().includes(searchText);
        if (!contentMatches && !frontmatterMatches) return false;
      }

      return true;
    });

    // Handle empty results gracefully
    if (filteredResults.length === 0) {
      return [];
    }

    // Convert to ContentItems and apply additional filters
    const items: ContentItem[] = [];

    for (const result of filteredResults) {
      // Filter by content type if specified
      if (query.contentType && result.frontmatter.type !== query.contentType) {
        continue;
      }

      // Filter by date range if specified
      if (query.dateRange && result.frontmatter.metadata?.dateRange) {
        if (!this.dateRangesOverlap(query.dateRange, result.frontmatter.metadata.dateRange)) {
          continue;
        }
      }

      // Get from cache or reconstruct
      const id = this.extractIdFromPath(result.path);
      let item = this.contentItems.get(id);

      if (!item) {
        // Reconstruct from storage data with full metadata and hierarchical context
        item = this.reconstructContentItemFromStorage(result);

        // Cache it
        this.contentItems.set(id, item);
      }

      items.push(item);
    }

    return items;
  }

  /**
   * Reconstructs a ContentItem from storage search result
   * Preserves all tags, metadata, and hierarchical context
   */
  private reconstructContentItemFromStorage(result: { path: string; content: string; frontmatter: Frontmatter }): ContentItem {
    const id = this.extractIdFromPath(result.path);
    const contentType = result.frontmatter.type;

    return {
      id,
      type: contentType,
      content: this.extractContentFromMarkdown(result.content, contentType),
      tags: result.frontmatter.tags,
      metadata: result.frontmatter.metadata || {},
      parentId: result.frontmatter.parentId,
      createdAt: new Date(result.frontmatter.createdAt),
      updatedAt: new Date(result.frontmatter.updatedAt),
      filePath: result.path
    };
  }

  /**
   * Checks if two date ranges overlap
   * @param range1 - First date range
   * @param range2 - Second date range
   * @returns True if ranges overlap
   */
  private dateRangesOverlap(range1: DateRange, range2: DateRange): boolean {
    const start1 = new Date(range1.start);
    const end1 = range1.end ? new Date(range1.end) : new Date('2099-12-31'); // Far future if no end

    const start2 = new Date(range2.start);
    const end2 = range2.end ? new Date(range2.end) : new Date('2099-12-31'); // Far future if no end

    // Check if ranges overlap: start1 <= end2 && start2 <= end1
    return start1 <= end2 && start2 <= end1;
  }

  /**
   * Detects duplicate content items
   * @param item - The content item to check for duplicates
   * @returns Promise resolving to array of potential duplicates
   */
  async detectDuplicates(item: ContentItemInput): Promise<ContentItem[]> {
    // Get all items of the same type
    const results = await this.searchContentItems({
      contentType: item.type
    });

    // Filter to exact content matches (trimmed and case-sensitive)
    const trimmedContent = item.content.trim();
    return results.filter(existing =>
      existing.content.trim() === trimmedContent
    );
  }

  /**
   * Generates a unique ID for a content item
   * @param type - The content type
   * @returns A unique ID string
   */
  private generateId(type: ContentType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}`;
  }

  /**
   * Applies automatic tags based on content type
   * Merges with any user-provided tags
   * @param type - The content type
   * @param userTags - User-provided tags
   * @returns Array of tags including automatic type-based tag
   */
  private applyAutomaticTags(type: ContentType, userTags: string[]): string[] {
    // Start with the content type as a tag
    const tags = new Set<string>([type]);

    // Add user-provided tags
    userTags.forEach(tag => tags.add(tag));

    return Array.from(tags);
  }

  /**
   * Generates the file path for a content item in the vault
   * @param type - The content type
   * @param id - The content item ID
   * @param parentId - Optional parent ID for hierarchical organization
   * @returns The file path relative to vault root
   */
  private generateFilePath(type: ContentType, id: string, parentId?: string): string {
    const baseDir = 'resume-content';

    // Determine subdirectory based on content type
    let subDir: string;
    let fileName: string;

    switch (type) {
      case ContentType.JOB_ENTRY:
        subDir = 'jobs';
        fileName = `${id}.md`;
        break;

      case ContentType.ACCOMPLISHMENT:
        if (parentId) {
          // Store accomplishments under parent job directory
          subDir = `jobs/${parentId}/accomplishments`;
        } else {
          // Standalone accomplishments
          subDir = 'accomplishments';
        }
        fileName = `${id}.md`;
        break;

      case ContentType.SKILL:
        if (parentId) {
          // Store skills under parent job directory
          subDir = `jobs/${parentId}/skills`;
        } else {
          // Standalone skills
          subDir = 'standalone-skills';
        }
        fileName = `${id}.md`;
        break;

      case ContentType.EDUCATION:
        subDir = 'education';
        fileName = `${id}.md`;
        break;

      case ContentType.CERTIFICATION:
        subDir = 'certifications';
        fileName = `${id}.md`;
        break;

      case ContentType.JOB_TITLE:
      case ContentType.JOB_LOCATION:
      case ContentType.JOB_DURATION:
        // These are typically part of job entries, not standalone
        // Store in a metadata directory if they are standalone
        subDir = 'metadata';
        fileName = `${id}.md`;
        break;

      default:
        subDir = 'other';
        fileName = `${id}.md`;
    }

    return `${baseDir}/${subDir}/${fileName}`;
  }

  /**
   * Extracts ID from file path
   * @param path - File path
   * @returns Extracted ID
   */
  private extractIdFromPath(path: string): string {
    // Extract filename without extension
    const filename = path.split('/').pop()?.replace('.md', '') || '';
    return filename;
  }

  /**
   * Extracts content from markdown based on content type
   * Different types store their "content" in different places in the markdown:
   * - SKILL, JOB_ENTRY, EDUCATION, CERTIFICATION: Content is in the H1 title
   * - ACCOMPLISHMENT: Content is in the body (after H1, before ## sections)
   * @param markdown - Full markdown content
   * @param contentType - The type of content item
   * @returns Extracted content without Obsidian navigation sections
   */
  private extractContentFromMarkdown(markdown: string, contentType?: ContentType): string {
    // Remove frontmatter
    const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n\n?/, '');

    // Stop at first ## section (these contain wikilinks for vault navigation)
    const contentOnly = withoutFrontmatter.split(/\n## /)[0];

    // For types where content = H1 title (skill name, job title, etc.)
    const titleTypes = [ContentType.SKILL, ContentType.JOB_ENTRY, ContentType.EDUCATION, ContentType.CERTIFICATION];
    if (contentType && titleTypes.includes(contentType)) {
      // Extract just the H1 title
      const titleMatch = contentOnly.match(/^# (.+)/);
      return titleMatch ? titleMatch[1].trim() : contentOnly.trim();
    }

    // For ACCOMPLISHMENT and other types: content is in the body
    // Remove the H1 title header and return the body content
    const withoutH1 = contentOnly.replace(/^# .+\n\n?/, '');
    return withoutH1.trim();
  }
}

// Export singleton instance
export const contentManager = new ContentManagerImpl();
