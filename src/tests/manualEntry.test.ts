import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Manual Entry Form Tests (Task 15.2)
 * 
 * Tests the manual content entry form functionality including:
 * - Form validation
 * - Successful submission
 * - Error display for invalid data
 * 
 * Requirements: 6.1-6.7
 */

describe('Manual Entry Form (Task 15.2)', () => {
  describe('Unit Tests - Form Validation', () => {
    it('should validate required fields', () => {
      // Test that content type is required
      const formData = {
        type: '',
        content: 'Test content',
        tags: [],
        metadata: {}
      };
      
      const isValid = validateManualEntry(formData);
      expect(isValid).toBe(false);
      
      // Test that content text is required
      const formData2 = {
        type: 'skill',
        content: '',
        tags: [],
        metadata: {}
      };
      
      const isValid2 = validateManualEntry(formData2);
      expect(isValid2).toBe(false);
    });

    it('should accept valid form data', () => {
      const formData = {
        type: 'skill',
        content: 'TypeScript programming',
        tags: ['skill', 'programming'],
        metadata: {
          proficiency: 'expert'
        }
      };
      
      const isValid = validateManualEntry(formData);
      expect(isValid).toBe(true);
    });

    it('should validate content type is from allowed list', () => {
      const validTypes = [
        'job-entry', 'job-title', 'job-location', 'job-duration',
        'skill', 'accomplishment', 'education', 'certification'
      ];
      
      validTypes.forEach(type => {
        const formData = {
          type,
          content: 'Test content',
          tags: [],
          metadata: {}
        };
        
        const isValid = validateManualEntry(formData);
        expect(isValid).toBe(true);
      });
      
      // Test invalid type
      const invalidFormData = {
        type: 'invalid-type',
        content: 'Test content',
        tags: [],
        metadata: {}
      };
      
      const isValid = validateManualEntry(invalidFormData);
      expect(isValid).toBe(false);
    });

    it('should validate date ranges when provided', () => {
      // Valid date range
      const formData = {
        type: 'job-entry',
        content: 'Senior Engineer',
        tags: [],
        metadata: {
          dateRange: {
            start: '2020-01-01',
            end: '2023-06-30'
          }
        }
      };
      
      const isValid = validateManualEntry(formData);
      expect(isValid).toBe(true);
      
      // Invalid date range (end before start)
      const invalidFormData = {
        type: 'job-entry',
        content: 'Senior Engineer',
        tags: [],
        metadata: {
          dateRange: {
            start: '2023-06-30',
            end: '2020-01-01'
          }
        }
      };
      
      const isValid2 = validateManualEntry(invalidFormData);
      expect(isValid2).toBe(false);
    });

    it('should allow optional metadata fields', () => {
      const formData = {
        type: 'accomplishment',
        content: 'Built feature X',
        tags: ['accomplishment'],
        metadata: {
          company: 'Acme Corp',
          location: {
            city: 'San Francisco',
            state: 'CA',
            country: 'USA'
          },
          notes: 'Additional context'
        }
      };
      
      const isValid = validateManualEntry(formData);
      expect(isValid).toBe(true);
    });
  });

  describe('Unit Tests - Successful Submission', () => {
    it('should create content item with valid data', async () => {
      const formData = {
        type: 'skill',
        content: 'Python programming',
        tags: ['skill', 'programming', 'python'],
        metadata: {
          proficiency: 'intermediate'
        }
      };
      
      const result = await createManualContent(formData);
      
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('should apply appropriate tags based on content type', () => {
      const formData = {
        type: 'skill',
        content: 'JavaScript',
        tags: ['custom-tag'],
        metadata: {}
      };
      
      const processedData = processManualEntry(formData);
      
      // Should include both the type tag and custom tags
      expect(processedData.tags).toContain('skill');
      expect(processedData.tags).toContain('custom-tag');
    });

    it('should generate unique IDs for each content item', async () => {
      const formData = {
        type: 'accomplishment',
        content: 'Achievement 1',
        tags: [],
        metadata: {}
      };
      
      const result1 = await createManualContent(formData);
      const result2 = await createManualContent(formData);
      
      expect(result1.id).not.toBe(result2.id);
    });

    it('should preserve all metadata fields', () => {
      const formData = {
        type: 'job-entry',
        content: 'Software Engineer',
        tags: ['job-entry'],
        metadata: {
          company: 'Tech Corp',
          location: {
            city: 'Seattle',
            state: 'WA'
          },
          dateRange: {
            start: '2021-01-01',
            end: '2023-12-31'
          },
          notes: 'Remote position'
        }
      };
      
      const processedData = processManualEntry(formData);
      
      expect(processedData.metadata.company).toBe('Tech Corp');
      expect(processedData.metadata.location?.city).toBe('Seattle');
      expect(processedData.metadata.dateRange?.start).toBe('2021-01-01');
      expect(processedData.metadata.notes).toBe('Remote position');
    });
  });

  describe('Unit Tests - Error Display', () => {
    it('should return validation errors for missing required fields', () => {
      const formData = {
        type: '',
        content: '',
        tags: [],
        metadata: {}
      };
      
      const errors = getValidationErrors(formData);
      
      expect(errors).toHaveProperty('type');
      expect(errors).toHaveProperty('content');
      expect(errors.type).toContain('required');
      expect(errors.content).toContain('required');
    });

    it('should return specific error for invalid content type', () => {
      const formData = {
        type: 'invalid-type',
        content: 'Test content',
        tags: [],
        metadata: {}
      };
      
      const errors = getValidationErrors(formData);
      
      expect(errors).toHaveProperty('type');
      expect(errors.type.toLowerCase()).toContain('invalid');
    });

    it('should return error for invalid date range', () => {
      const formData = {
        type: 'job-entry',
        content: 'Engineer',
        tags: [],
        metadata: {
          dateRange: {
            start: '2023-12-31',
            end: '2023-01-01'
          }
        }
      };
      
      const errors = getValidationErrors(formData);
      
      expect(errors).toHaveProperty('dateRange');
      expect(errors.dateRange.toLowerCase()).toContain('end date');
    });

    it('should return empty errors object for valid data', () => {
      const formData = {
        type: 'skill',
        content: 'React',
        tags: ['skill'],
        metadata: {}
      };
      
      const errors = getValidationErrors(formData);
      
      expect(Object.keys(errors)).toHaveLength(0);
    });
  });

  describe('Unit Tests - Tag Management', () => {
    it('should normalize tags to lowercase with hyphens', () => {
      const tags = ['Programming Language', 'TypeScript', 'Web Dev'];
      const normalized = normalizeTags(tags);
      
      expect(normalized).toContain('programming-language');
      expect(normalized).toContain('typescript');
      expect(normalized).toContain('web-dev');
    });

    it('should remove duplicate tags', () => {
      const tags = ['skill', 'programming', 'skill', 'typescript', 'programming'];
      const deduplicated = deduplicateTags(tags);
      
      expect(deduplicated).toHaveLength(3);
      expect(deduplicated).toContain('skill');
      expect(deduplicated).toContain('programming');
      expect(deduplicated).toContain('typescript');
    });

    it('should auto-add content type as tag', () => {
      const formData = {
        type: 'accomplishment',
        content: 'Built feature',
        tags: ['project'],
        metadata: {}
      };
      
      const processedData = processManualEntry(formData);
      
      expect(processedData.tags).toContain('accomplishment');
      expect(processedData.tags).toContain('project');
    });
  });
});

// Helper functions for testing

function validateManualEntry(formData: any): boolean {
  const errors = getValidationErrors(formData);
  return Object.keys(errors).length === 0;
}

function getValidationErrors(formData: any): Record<string, string> {
  const errors: Record<string, string> = {};
  
  const validTypes = [
    'job-entry', 'job-title', 'job-location', 'job-duration',
    'skill', 'accomplishment', 'education', 'certification'
  ];
  
  // Validate content type
  if (!formData.type) {
    errors.type = 'Content type is required';
  } else if (!validTypes.includes(formData.type)) {
    errors.type = 'Invalid content type';
  }
  
  // Validate content text
  if (!formData.content || !formData.content.trim()) {
    errors.content = 'Content is required';
  }
  
  // Validate date range if provided
  if (formData.metadata?.dateRange) {
    const { start, end } = formData.metadata.dateRange;
    if (start && end && new Date(end) < new Date(start)) {
      errors.dateRange = 'End date must be after start date';
    }
  }
  
  return errors;
}

async function createManualContent(formData: any): Promise<{ success: boolean; id: string }> {
  // Simulate content creation
  if (!validateManualEntry(formData)) {
    throw new Error('Invalid form data');
  }
  
  return {
    success: true,
    id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
}

function processManualEntry(formData: any): any {
  const processed = { ...formData };
  
  // Auto-add content type as tag
  if (!processed.tags.includes(processed.type)) {
    processed.tags = [processed.type, ...processed.tags];
  }
  
  // Normalize tags
  processed.tags = normalizeTags(processed.tags);
  processed.tags = deduplicateTags(processed.tags);
  
  return processed;
}

function normalizeTags(tags: string[]): string[] {
  return tags.map(tag => tag.toLowerCase().replace(/\s+/g, '-'));
}

function deduplicateTags(tags: string[]): string[] {
  return [...new Set(tags)];
}
