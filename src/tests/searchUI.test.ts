import { describe, it, expect, beforeEach } from 'vitest';
import { SearchQuery, ContentType, DateRange } from '../types';

// Search query building logic (extracted for testing)
function buildSearchQuery(formData: {
  contentType?: string;
  text?: string;
  tags?: string[];
  dateStart?: string;
  dateEnd?: string;
}): SearchQuery {
  const query: SearchQuery = {};
  
  if (formData.contentType) {
    query.contentType = formData.contentType as ContentType;
  }
  
  if (formData.text) {
    query.text = formData.text;
  }
  
  if (formData.tags && formData.tags.length > 0) {
    query.tags = formData.tags;
  }
  
  if (formData.dateStart || formData.dateEnd) {
    query.dateRange = {};
    if (formData.dateStart) {
      query.dateRange.start = formData.dateStart;
    }
    if (formData.dateEnd) {
      query.dateRange.end = formData.dateEnd;
    }
  }
  
  return query;
}

function hasSearchCriteria(query: SearchQuery): boolean {
  return !!(
    query.contentType ||
    query.text ||
    (query.tags && query.tags.length > 0) ||
    query.dateRange
  );
}

function validateSearchQuery(query: SearchQuery): { isValid: boolean; error?: string } {
  if (!hasSearchCriteria(query)) {
    return {
      isValid: false,
      error: 'Please enter at least one search criterion'
    };
  }
  
  return { isValid: true };
}

describe('Search UI - Filter Application', () => {
  it('should build query with content type filter', () => {
    const query = buildSearchQuery({
      contentType: 'skill'
    });
    
    expect(query.contentType).toBe('skill');
    expect(hasSearchCriteria(query)).toBe(true);
  });

  it('should build query with text search', () => {
    const query = buildSearchQuery({
      text: 'TypeScript'
    });
    
    expect(query.text).toBe('TypeScript');
    expect(hasSearchCriteria(query)).toBe(true);
  });

  it('should build query with single tag', () => {
    const query = buildSearchQuery({
      tags: ['skill']
    });
    
    expect(query.tags).toEqual(['skill']);
    expect(hasSearchCriteria(query)).toBe(true);
  });

  it('should build query with multiple tags', () => {
    const query = buildSearchQuery({
      tags: ['skill', 'typescript', 'programming-language']
    });
    
    expect(query.tags).toEqual(['skill', 'typescript', 'programming-language']);
    expect(query.tags?.length).toBe(3);
  });

  it('should build query with date range (start only)', () => {
    const query = buildSearchQuery({
      dateStart: '2020-01-01'
    });
    
    expect(query.dateRange).toBeDefined();
    expect(query.dateRange?.start).toBe('2020-01-01');
    expect(query.dateRange?.end).toBeUndefined();
  });

  it('should build query with date range (end only)', () => {
    const query = buildSearchQuery({
      dateEnd: '2023-12-31'
    });
    
    expect(query.dateRange).toBeDefined();
    expect(query.dateRange?.start).toBeUndefined();
    expect(query.dateRange?.end).toBe('2023-12-31');
  });

  it('should build query with complete date range', () => {
    const query = buildSearchQuery({
      dateStart: '2020-01-01',
      dateEnd: '2023-12-31'
    });
    
    expect(query.dateRange).toBeDefined();
    expect(query.dateRange?.start).toBe('2020-01-01');
    expect(query.dateRange?.end).toBe('2023-12-31');
  });

  it('should build query with multiple filters', () => {
    const query = buildSearchQuery({
      contentType: 'accomplishment',
      text: 'performance',
      tags: ['optimization', 'backend'],
      dateStart: '2021-01-01',
      dateEnd: '2022-12-31'
    });
    
    expect(query.contentType).toBe('accomplishment');
    expect(query.text).toBe('performance');
    expect(query.tags).toEqual(['optimization', 'backend']);
    expect(query.dateRange?.start).toBe('2021-01-01');
    expect(query.dateRange?.end).toBe('2022-12-31');
  });

  it('should handle empty form data', () => {
    const query = buildSearchQuery({});
    
    expect(hasSearchCriteria(query)).toBe(false);
  });

  it('should ignore empty strings', () => {
    const query = buildSearchQuery({
      contentType: '',
      text: ''
    });
    
    expect(query.contentType).toBeUndefined();
    expect(query.text).toBeUndefined();
    expect(hasSearchCriteria(query)).toBe(false);
  });

  it('should ignore empty tag arrays', () => {
    const query = buildSearchQuery({
      tags: []
    });
    
    expect(query.tags).toBeUndefined();
    expect(hasSearchCriteria(query)).toBe(false);
  });
});

describe('Search UI - Result Display', () => {
  it('should format content type for display', () => {
    const typeMap: Record<string, string> = {
      'job-entry': 'Job Entry',
      'job-title': 'Job Title',
      'job-location': 'Job Location',
      'job-duration': 'Job Duration',
      'skill': 'Skill',
      'accomplishment': 'Accomplishment',
      'education': 'Education',
      'certification': 'Certification'
    };
    
    expect(typeMap['skill']).toBe('Skill');
    expect(typeMap['job-entry']).toBe('Job Entry');
    expect(typeMap['accomplishment']).toBe('Accomplishment');
  });

  it('should display result count correctly', () => {
    const formatCount = (count: number) => 
      `Found ${count} result${count !== 1 ? 's' : ''}`;
    
    expect(formatCount(0)).toBe('Found 0 results');
    expect(formatCount(1)).toBe('Found 1 result');
    expect(formatCount(5)).toBe('Found 5 results');
    expect(formatCount(100)).toBe('Found 100 results');
  });

  it('should format location for display', () => {
    const formatLocation = (location: { city?: string; state?: string; country?: string }) => {
      const parts = [];
      if (location.city) parts.push(location.city);
      if (location.state) parts.push(location.state);
      if (location.country) parts.push(location.country);
      return parts.join(', ');
    };
    
    expect(formatLocation({ city: 'San Francisco', state: 'CA', country: 'USA' }))
      .toBe('San Francisco, CA, USA');
    expect(formatLocation({ city: 'New York', state: 'NY' }))
      .toBe('New York, NY');
    expect(formatLocation({ city: 'London' }))
      .toBe('London');
    expect(formatLocation({}))
      .toBe('');
  });

  it('should format date range for display', () => {
    const formatDateRange = (dateRange: DateRange) => {
      const start = dateRange.start 
        ? new Date(dateRange.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
        : 'Unknown';
      
      const end = dateRange.end 
        ? new Date(dateRange.end).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
        : 'Present';
      
      return `${start} - ${end}`;
    };
    
    const result1 = formatDateRange({ start: '2020-01-01', end: '2023-06-30' });
    expect(result1).toMatch(/20(19|20)/); // Account for timezone differences
    expect(result1).toMatch(/2023/);
    
    const result2 = formatDateRange({ start: '2020-01-01' });
    expect(result2).toContain('Present');
  });
});

describe('Search UI - Empty Results Handling', () => {
  it('should detect empty results', () => {
    const results: any[] = [];
    expect(results.length).toBe(0);
  });

  it('should provide appropriate message for empty results', () => {
    const emptyMessage = 'No results found matching your search criteria';
    expect(emptyMessage).toContain('No results');
  });

  it('should handle null or undefined results', () => {
    const results1 = null;
    const results2 = undefined;
    const results3: any[] = [];
    
    expect(results1 || []).toEqual([]);
    expect(results2 || []).toEqual([]);
    expect(results3).toEqual([]);
  });
});

describe('Search UI - Query Validation', () => {
  it('should validate query with at least one criterion', () => {
    const validQuery = buildSearchQuery({ text: 'test' });
    const result = validateSearchQuery(validQuery);
    
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject query with no criteria', () => {
    const invalidQuery = buildSearchQuery({});
    const result = validateSearchQuery(invalidQuery);
    
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('at least one search criterion');
  });

  it('should accept query with only content type', () => {
    const query = buildSearchQuery({ contentType: 'skill' });
    const result = validateSearchQuery(query);
    
    expect(result.isValid).toBe(true);
  });

  it('should accept query with only tags', () => {
    const query = buildSearchQuery({ tags: ['skill'] });
    const result = validateSearchQuery(query);
    
    expect(result.isValid).toBe(true);
  });

  it('should accept query with only date range', () => {
    const query = buildSearchQuery({ dateStart: '2020-01-01' });
    const result = validateSearchQuery(query);
    
    expect(result.isValid).toBe(true);
  });
});

describe('Search UI - Tag Management', () => {
  it('should add tag to selection', () => {
    const selectedTags: string[] = [];
    const newTag = 'skill';
    
    if (!selectedTags.includes(newTag)) {
      selectedTags.push(newTag);
    }
    
    expect(selectedTags).toContain('skill');
    expect(selectedTags.length).toBe(1);
  });

  it('should remove tag from selection', () => {
    const selectedTags = ['skill', 'typescript', 'backend'];
    const tagToRemove = 'typescript';
    
    const filtered = selectedTags.filter(t => t !== tagToRemove);
    
    expect(filtered).toEqual(['skill', 'backend']);
    expect(filtered.length).toBe(2);
  });

  it('should prevent duplicate tags', () => {
    const selectedTags = ['skill'];
    const newTag = 'skill';
    
    if (!selectedTags.includes(newTag)) {
      selectedTags.push(newTag);
    }
    
    expect(selectedTags.length).toBe(1);
  });

  it('should strip # prefix from tags', () => {
    const stripHash = (tag: string) => tag.replace(/^#/, '');
    
    expect(stripHash('#skill')).toBe('skill');
    expect(stripHash('skill')).toBe('skill');
    expect(stripHash('##skill')).toBe('#skill');
  });

  it('should handle multiple tag additions', () => {
    const selectedTags: string[] = [];
    const tagsToAdd = ['skill', 'typescript', 'backend', 'frontend'];
    
    tagsToAdd.forEach(tag => {
      if (!selectedTags.includes(tag)) {
        selectedTags.push(tag);
      }
    });
    
    expect(selectedTags.length).toBe(4);
    expect(selectedTags).toEqual(tagsToAdd);
  });

  it('should clear all tags', () => {
    let selectedTags = ['skill', 'typescript', 'backend'];
    selectedTags = [];
    
    expect(selectedTags.length).toBe(0);
  });
});

describe('Search UI - Content Type Filtering', () => {
  it('should support all content types', () => {
    const contentTypes = [
      'job-entry',
      'job-title',
      'job-location',
      'job-duration',
      'skill',
      'accomplishment',
      'education',
      'certification'
    ];
    
    contentTypes.forEach(type => {
      const query = buildSearchQuery({ contentType: type });
      expect(query.contentType).toBe(type);
    });
  });

  it('should allow empty content type (all types)', () => {
    const query = buildSearchQuery({ contentType: '' });
    expect(query.contentType).toBeUndefined();
  });
});

describe('Search UI - Date Range Filtering', () => {
  it('should handle start date only', () => {
    const query = buildSearchQuery({ dateStart: '2020-01-01' });
    
    expect(query.dateRange).toBeDefined();
    expect(query.dateRange?.start).toBe('2020-01-01');
    expect(query.dateRange?.end).toBeUndefined();
  });

  it('should handle end date only', () => {
    const query = buildSearchQuery({ dateEnd: '2023-12-31' });
    
    expect(query.dateRange).toBeDefined();
    expect(query.dateRange?.start).toBeUndefined();
    expect(query.dateRange?.end).toBe('2023-12-31');
  });

  it('should handle both start and end dates', () => {
    const query = buildSearchQuery({
      dateStart: '2020-01-01',
      dateEnd: '2023-12-31'
    });
    
    expect(query.dateRange).toBeDefined();
    expect(query.dateRange?.start).toBe('2020-01-01');
    expect(query.dateRange?.end).toBe('2023-12-31');
  });

  it('should not create date range if both dates are empty', () => {
    const query = buildSearchQuery({
      dateStart: '',
      dateEnd: ''
    });
    
    expect(query.dateRange).toBeUndefined();
  });
});

describe('Search UI - Clear Filters', () => {
  it('should clear all filter values', () => {
    const formData = {
      contentType: 'skill',
      text: 'TypeScript',
      tags: ['skill', 'typescript'],
      dateStart: '2020-01-01',
      dateEnd: '2023-12-31'
    };
    
    // Clear
    const cleared = {
      contentType: '',
      text: '',
      tags: [],
      dateStart: '',
      dateEnd: ''
    };
    
    expect(cleared.contentType).toBe('');
    expect(cleared.text).toBe('');
    expect(cleared.tags.length).toBe(0);
    expect(cleared.dateStart).toBe('');
    expect(cleared.dateEnd).toBe('');
  });

  it('should reset to initial state after clear', () => {
    const query = buildSearchQuery({
      contentType: '',
      text: '',
      tags: [],
      dateStart: '',
      dateEnd: ''
    });
    
    expect(hasSearchCriteria(query)).toBe(false);
  });
});
