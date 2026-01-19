import { ContentItem, ContentType } from '../types';

/**
 * Markdown Generator
 * Creates properly formatted markdown content for content items
 */
export class MarkdownGenerator {
  /**
   * Generates markdown content for a content item
   * @param item - The content item
   * @returns Formatted markdown content
   */
  generateMarkdown(item: ContentItem): string {
    switch (item.type) {
      case ContentType.JOB_ENTRY:
        return this.generateJobEntryMarkdown(item);
      case ContentType.ACCOMPLISHMENT:
        return this.generateAccomplishmentMarkdown(item);
      case ContentType.SKILL:
        return this.generateSkillMarkdown(item);
      case ContentType.EDUCATION:
        return this.generateEducationMarkdown(item);
      case ContentType.CERTIFICATION:
        return this.generateCertificationMarkdown(item);
      case ContentType.JOB_TITLE:
      case ContentType.JOB_LOCATION:
      case ContentType.JOB_DURATION:
        return this.generateMetadataMarkdown(item);
      default:
        return this.generateGenericMarkdown(item);
    }
  }

  /**
   * Generates markdown for a job entry
   */
  private generateJobEntryMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# ${item.content}`);
    lines.push('');
    
    // Duration
    if (item.metadata.dateRange) {
      const start = this.formatDate(item.metadata.dateRange.start);
      const end = item.metadata.dateRange.end 
        ? this.formatDate(item.metadata.dateRange.end)
        : 'Present';
      lines.push(`**Duration**: ${start} - ${end}`);
    }
    
    // Location
    if (item.metadata.location) {
      const location = this.formatLocation(item.metadata.location);
      if (location) {
        lines.push(`**Location**: ${location}`);
      }
    }
    
    // Company
    if (item.metadata.company) {
      lines.push(`**Company**: ${item.metadata.company}`);
    }
    
    lines.push('');
    
    // Related content section (will be populated with child links)
    lines.push('## Related Content');
    lines.push('');
    lines.push('_Accomplishments, skills, and other details will be linked here._');
    
    return lines.join('\n');
  }

  /**
   * Generates markdown for an accomplishment
   */
  private generateAccomplishmentMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title (first line of content or generic title)
    const title = this.extractTitle(item.content) || 'Accomplishment';
    lines.push(`# ${title}`);
    lines.push('');
    
    // Content
    lines.push(item.content);
    lines.push('');
    
    // Date range if available
    if (item.metadata.dateRange) {
      const start = this.formatDate(item.metadata.dateRange.start);
      const end = item.metadata.dateRange.end 
        ? this.formatDate(item.metadata.dateRange.end)
        : 'Present';
      lines.push(`**Period**: ${start} - ${end}`);
      lines.push('');
    }
    
    // Parent job link
    if (item.parentId) {
      lines.push('## Context');
      lines.push('');
      lines.push(`**Parent Job**: [[${item.parentId}]]`);
    }
    
    return lines.join('\n');
  }

  /**
   * Generates markdown for a skill
   */
  private generateSkillMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# ${item.content}`);
    lines.push('');
    
    // Proficiency
    if (item.metadata.proficiency) {
      lines.push(`**Proficiency**: ${item.metadata.proficiency}`);
      lines.push('');
    }
    
    // Notes
    if (item.metadata.notes) {
      lines.push(item.metadata.notes);
      lines.push('');
    }
    
    // Applied at (parent job)
    if (item.parentId) {
      lines.push('## Applied At');
      lines.push('');
      lines.push(`[[${item.parentId}]]`);
    }
    
    return lines.join('\n');
  }

  /**
   * Generates markdown for education
   */
  private generateEducationMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# ${item.content}`);
    lines.push('');
    
    // Date range
    if (item.metadata.dateRange) {
      const start = this.formatDate(item.metadata.dateRange.start);
      const end = item.metadata.dateRange.end 
        ? this.formatDate(item.metadata.dateRange.end)
        : 'Present';
      lines.push(`**Period**: ${start} - ${end}`);
    }
    
    // Location
    if (item.metadata.location) {
      const location = this.formatLocation(item.metadata.location);
      if (location) {
        lines.push(`**Location**: ${location}`);
      }
    }
    
    // Notes
    if (item.metadata.notes) {
      lines.push('');
      lines.push(item.metadata.notes);
    }
    
    return lines.join('\n');
  }

  /**
   * Generates markdown for certification
   */
  private generateCertificationMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# ${item.content}`);
    lines.push('');
    
    // Company/Issuer
    if (item.metadata.company) {
      lines.push(`**Issuer**: ${item.metadata.company}`);
    }
    
    // Date issued
    if (item.metadata.dateRange?.start) {
      lines.push(`**Issued**: ${this.formatDate(item.metadata.dateRange.start)}`);
    }
    
    // Expiration
    if (item.metadata.dateRange?.end) {
      lines.push(`**Expires**: ${this.formatDate(item.metadata.dateRange.end)}`);
    }
    
    // Notes
    if (item.metadata.notes) {
      lines.push('');
      lines.push(item.metadata.notes);
    }
    
    return lines.join('\n');
  }

  /**
   * Generates markdown for metadata items (job title, location, duration)
   */
  private generateMetadataMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# ${item.content}`);
    lines.push('');
    
    // Type
    lines.push(`**Type**: ${item.type}`);
    lines.push('');
    
    // Parent job link
    if (item.parentId) {
      lines.push('## Associated Job');
      lines.push('');
      lines.push(`[[${item.parentId}]]`);
    }
    
    return lines.join('\n');
  }

  /**
   * Generates generic markdown for unknown types
   */
  private generateGenericMarkdown(item: ContentItem): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# ${item.content}`);
    lines.push('');
    
    // Parent link if available
    if (item.parentId) {
      lines.push('## Parent');
      lines.push('');
      lines.push(`[[${item.parentId}]]`);
    }
    
    return lines.join('\n');
  }

  /**
   * Adds child links to a parent item's markdown
   * @param markdown - Original markdown content
   * @param childIds - Array of child IDs
   * @returns Updated markdown with child links
   */
  addChildLinks(markdown: string, childIds: string[]): string {
    if (!childIds || childIds.length === 0) {
      return markdown;
    }
    
    // Replace the placeholder section with actual links
    const relatedContentSection = childIds.map(id => `- [[${id}]]`).join('\n');
    
    // Replace the placeholder text
    return markdown.replace(
      '_Accomplishments, skills, and other details will be linked here._',
      relatedContentSection
    );
  }

  /**
   * Formats a date string for display
   */
  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * Formats a location object for display
   */
  private formatLocation(location: { city?: string; state?: string; country?: string }): string {
    const parts: string[] = [];
    
    if (location.city) parts.push(location.city);
    if (location.state) parts.push(location.state);
    if (location.country) parts.push(location.country);
    
    return parts.join(', ');
  }

  /**
   * Extracts a title from content (first line or first sentence)
   */
  private extractTitle(content: string): string | null {
    // Try to get first line
    const firstLine = content.split('\n')[0].trim();
    if (firstLine && firstLine.length <= 100) {
      return firstLine;
    }
    
    // Try to get first sentence
    const firstSentence = content.split(/[.!?]/)[0].trim();
    if (firstSentence && firstSentence.length <= 100) {
      return firstSentence;
    }
    
    // Truncate if too long
    if (content.length > 100) {
      return content.substring(0, 97) + '...';
    }
    
    return content;
  }
}

// Export singleton instance
export const markdownGenerator = new MarkdownGenerator();
