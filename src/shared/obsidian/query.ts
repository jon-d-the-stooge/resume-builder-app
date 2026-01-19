/**
 * Obsidian Query Utilities
 * 
 * Query builder utilities for Obsidian vault operations.
 */

import { ObsidianQuery } from './types';

/**
 * Query builder for constructing Obsidian vault queries
 */
export class QueryBuilder {
  private query: ObsidianQuery = {};

  /**
   * Filter by tags (AND operation - all tags must match)
   */
  withTags(tags: string[]): this {
    this.query.tags = tags;
    return this;
  }

  /**
   * Add a single tag to the filter
   */
  withTag(tag: string): this {
    if (!this.query.tags) {
      this.query.tags = [];
    }
    this.query.tags.push(tag);
    return this;
  }

  /**
   * Search in note content
   */
  searchContent(enabled: boolean = true): this {
    this.query.searchContent = enabled;
    return this;
  }

  /**
   * Search in frontmatter
   */
  searchFrontmatter(enabled: boolean = true): this {
    this.query.searchFrontmatter = enabled;
    return this;
  }

  /**
   * Set text query
   */
  withQuery(text: string): this {
    this.query.query = text;
    return this;
  }

  /**
   * Build the final query object
   */
  build(): ObsidianQuery {
    return { ...this.query };
  }

  /**
   * Reset the builder to start a new query
   */
  reset(): this {
    this.query = {};
    return this;
  }
}

/**
 * Helper function to create a new query builder
 */
export function createQuery(): QueryBuilder {
  return new QueryBuilder();
}

/**
 * Helper function to create a simple tag query
 */
export function queryByTags(tags: string[]): ObsidianQuery {
  return { tags };
}

/**
 * Helper function to create a simple text query
 */
export function queryByText(text: string, searchContent: boolean = true, searchFrontmatter: boolean = false): ObsidianQuery {
  return {
    query: text,
    searchContent,
    searchFrontmatter
  };
}

/**
 * Helper function to create a combined tag and text query
 */
export function queryByTagsAndText(
  tags: string[],
  text: string,
  searchContent: boolean = true,
  searchFrontmatter: boolean = false
): ObsidianQuery {
  return {
    tags,
    query: text,
    searchContent,
    searchFrontmatter
  };
}
