/**
 * Obsidian Types
 * 
 * Type definitions for Obsidian vault and note structures.
 */

import { ContentMetadata, DateRange, Location } from '../types/common';

/**
 * Content type for Obsidian notes
 */
export enum ContentType {
  JOB_TITLE = 'job-title',
  JOB_LOCATION = 'job-location',
  JOB_DURATION = 'job-duration',
  SKILL = 'skill',
  ACCOMPLISHMENT = 'accomplishment',
  EDUCATION = 'education',
  CERTIFICATION = 'certification',
  JOB_ENTRY = 'job-entry'
}

/**
 * YAML frontmatter structure for Obsidian notes
 */
export interface Frontmatter {
  tags: string[];
  type: ContentType;
  createdAt: string;
  updatedAt: string;
  metadata: ContentMetadata;
  parentId?: string;
  childIds?: string[];
}

/**
 * Note content with parsed frontmatter
 */
export interface NoteContent {
  path: string;
  content: string;
  frontmatter: Frontmatter;
}

/**
 * Query parameters for searching notes
 */
export interface ObsidianQuery {
  tags?: string[];
  searchContent?: boolean;
  searchFrontmatter?: boolean;
  query?: string;
}

/**
 * Search result from vault query
 */
export interface NoteSearchResult {
  path: string;
  content: string;
  frontmatter: Frontmatter;
}
