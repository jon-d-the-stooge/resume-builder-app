import { SearchQuery, ObsidianQuery, ContentType, DateRange } from '../../types';

/**
 * Search Query Builder
 * Builds queries for tag-based filtering, text-based search, date range filtering,
 * and supports multiple simultaneous filters
 */
export class SearchQueryBuilder {
  private query: SearchQuery = {};

  /**
   * Adds tag-based filtering to the query
   * @param tags - Array of tags to filter by
   * @returns This builder for chaining
   */
  withTags(tags: string[]): this {
    this.query.tags = tags;
    return this;
  }

  /**
   * Adds a single tag to the filter
   * @param tag - Tag to add
   * @returns This builder for chaining
   */
  withTag(tag: string): this {
    if (!this.query.tags) {
      this.query.tags = [];
    }
    this.query.tags.push(tag);
    return this;
  }

  /**
   * Adds text-based search to the query
   * @param text - Text to search for in content
   * @returns This builder for chaining
   */
  withText(text: string): this {
    this.query.text = text;
    return this;
  }

  /**
   * Adds date range filtering to the query
   * @param dateRange - Date range to filter by
   * @returns This builder for chaining
   */
  withDateRange(dateRange: DateRange): this {
    this.query.dateRange = dateRange;
    return this;
  }

  /**
   * Adds date range filtering with start and end dates
   * @param start - Start date (ISO 8601 format)
   * @param end - Optional end date (ISO 8601 format)
   * @returns This builder for chaining
   */
  withDateRangeFromDates(start: string, end?: string): this {
    this.query.dateRange = { start, end };
    return this;
  }

  /**
   * Adds content type filtering to the query
   * @param contentType - Content type to filter by
   * @returns This builder for chaining
   */
  withContentType(contentType: ContentType): this {
    this.query.contentType = contentType;
    return this;
  }

  /**
   * Builds the final SearchQuery object
   * @returns The constructed SearchQuery
   */
  build(): SearchQuery {
    return { ...this.query };
  }

  /**
   * Converts the SearchQuery to an ObsidianQuery for vault operations
   * @returns ObsidianQuery object
   */
  toObsidianQuery(): ObsidianQuery {
    return {
      tags: this.query.tags,
      searchContent: !!this.query.text,
      searchFrontmatter: true,
      query: this.query.text
    };
  }

  /**
   * Resets the builder to start a new query
   * @returns This builder for chaining
   */
  reset(): this {
    this.query = {};
    return this;
  }

  /**
   * Creates a new SearchQueryBuilder instance
   * @returns A new SearchQueryBuilder
   */
  static create(): SearchQueryBuilder {
    return new SearchQueryBuilder();
  }

  /**
   * Creates a query for searching by tags only
   * @param tags - Tags to search for
   * @returns SearchQuery
   */
  static byTags(tags: string[]): SearchQuery {
    return new SearchQueryBuilder().withTags(tags).build();
  }

  /**
   * Creates a query for searching by text only
   * @param text - Text to search for
   * @returns SearchQuery
   */
  static byText(text: string): SearchQuery {
    return new SearchQueryBuilder().withText(text).build();
  }

  /**
   * Creates a query for searching by content type only
   * @param contentType - Content type to filter by
   * @returns SearchQuery
   */
  static byContentType(contentType: ContentType): SearchQuery {
    return new SearchQueryBuilder().withContentType(contentType).build();
  }

  /**
   * Creates a query for searching by date range only
   * @param dateRange - Date range to filter by
   * @returns SearchQuery
   */
  static byDateRange(dateRange: DateRange): SearchQuery {
    return new SearchQueryBuilder().withDateRange(dateRange).build();
  }

  /**
   * Validates that a query has at least one filter criterion
   * @param query - Query to validate
   * @returns True if query has at least one criterion
   */
  static isValid(query: SearchQuery): boolean {
    return !!(
      (query.tags && query.tags.length > 0) ||
      query.text ||
      query.dateRange ||
      query.contentType
    );
  }

  /**
   * Checks if a query has multiple filter criteria
   * @param query - Query to check
   * @returns True if query has multiple criteria
   */
  static hasMultipleFilters(query: SearchQuery): boolean {
    let count = 0;
    if (query.tags && query.tags.length > 0) count++;
    if (query.text) count++;
    if (query.dateRange) count++;
    if (query.contentType) count++;
    return count > 1;
  }
}

/**
 * Helper function to create a new query builder
 * @returns A new SearchQueryBuilder instance
 */
export function createQueryBuilder(): SearchQueryBuilder {
  return SearchQueryBuilder.create();
}

/**
 * Helper function to build a query with multiple filters
 * @param options - Query options
 * @returns SearchQuery
 */
export function buildQuery(options: {
  tags?: string[];
  text?: string;
  dateRange?: DateRange;
  contentType?: ContentType;
}): SearchQuery {
  const builder = new SearchQueryBuilder();

  if (options.tags) {
    builder.withTags(options.tags);
  }

  if (options.text) {
    builder.withText(options.text);
  }

  if (options.dateRange) {
    builder.withDateRange(options.dateRange);
  }

  if (options.contentType) {
    builder.withContentType(options.contentType);
  }

  return builder.build();
}
