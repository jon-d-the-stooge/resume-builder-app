/**
 * Tests for Element Deduplication
 * 
 * Tests the deduplicator's ability to consolidate duplicate elements
 * while preserving context and selecting maximum importance scores.
 * 
 * Requirements: 1.5, 4.5
 */

import {
  deduplicateElements,
  countDuplicates,
  findDuplicateGroups,
  hasDuplicates,
  getDeduplicationStats
} from '../../ats-agent/parser/deduplicator';
import { Element, TaggedElement } from '../../ats-agent/types';

describe('Element Deduplication', () => {
  describe('deduplicateElements', () => {
    it('should consolidate duplicate elements', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Experience with Python',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['language'],
          context: 'Python programming skills',
          position: { start: 10, end: 16 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].normalizedText).toBe('python');
    });

    it('should preserve context from all occurrences', () => {
      const elements: Element[] = [
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: ['skill'],
          context: 'Experience with machine learning',
          position: { start: 0, end: 16 }
        },
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: ['ai'],
          context: 'Machine learning algorithms',
          position: { start: 20, end: 36 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].context).toContain('Experience with machine learning');
      expect(result[0].context).toContain('Machine learning algorithms');
      expect(result[0].context).toContain('|'); // Separator
    });

    it('should merge tags from all occurrences', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming', 'language'],
          context: 'Python experience',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['scripting', 'backend'],
          context: 'Python development',
          position: { start: 10, end: 16 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].tags).toContain('programming');
      expect(result[0].tags).toContain('language');
      expect(result[0].tags).toContain('scripting');
      expect(result[0].tags).toContain('backend');
      expect(result[0].tags.length).toBe(4);
    });

    it('should select maximum importance score for TaggedElements', () => {
      const elements: TaggedElement[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Python required',
          position: { start: 0, end: 6 },
          importance: 0.9,
          semanticTags: ['technical'],
          category: 'skill'
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['language'],
          context: 'Python preferred',
          position: { start: 10, end: 16 },
          importance: 0.5,
          semanticTags: ['technical'],
          category: 'skill'
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['scripting'],
          context: 'Python nice to have',
          position: { start: 20, end: 26 },
          importance: 0.3,
          semanticTags: ['technical'],
          category: 'skill'
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].importance).toBe(0.9); // Maximum importance
    });

    it('should keep first occurrence position', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'First occurrence',
          position: { start: 5, end: 11 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['language'],
          context: 'Second occurrence',
          position: { start: 50, end: 56 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].position.start).toBe(5);
      expect(result[0].position.end).toBe(11);
    });

    it('should handle case-insensitive deduplication', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Python',
          position: { start: 0, end: 6 }
        },
        {
          text: 'PYTHON',
          normalizedText: 'PYTHON',
          tags: ['language'],
          context: 'PYTHON',
          position: { start: 10, end: 16 }
        },
        {
          text: 'python',
          normalizedText: 'python',
          tags: ['scripting'],
          context: 'python',
          position: { start: 20, end: 26 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].tags.length).toBe(3);
    });

    it('should handle whitespace in normalized text', () => {
      const elements: Element[] = [
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: ['ai'],
          context: 'ML experience',
          position: { start: 0, end: 16 }
        },
        {
          text: 'machine learning',
          normalizedText: '  machine learning  ',
          tags: ['ml'],
          context: 'ML skills',
          position: { start: 20, end: 36 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].tags).toContain('ai');
      expect(result[0].tags).toContain('ml');
    });

    it('should preserve unique elements', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Python',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: ['programming'],
          context: 'Java',
          position: { start: 10, end: 14 }
        },
        {
          text: 'JavaScript',
          normalizedText: 'javascript',
          tags: ['programming'],
          context: 'JavaScript',
          position: { start: 20, end: 30 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(3);
      expect(result.map(el => el.normalizedText)).toContain('python');
      expect(result.map(el => el.normalizedText)).toContain('java');
      expect(result.map(el => el.normalizedText)).toContain('javascript');
    });

    it('should handle empty array', () => {
      const result = deduplicateElements([]);
      expect(result).toEqual([]);
    });

    it('should handle single element', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Python',
          position: { start: 0, end: 6 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0]).toEqual(elements[0]);
    });

    it('should handle empty contexts gracefully', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['language'],
          context: 'Python programming',
          position: { start: 10, end: 16 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].context).toBe('Python programming');
      expect(result[0].context).not.toContain('|'); // No separator for empty context
    });

    it('should handle multiple duplicates of same element', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['tag1'],
          context: 'Context 1',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['tag2'],
          context: 'Context 2',
          position: { start: 10, end: 16 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['tag3'],
          context: 'Context 3',
          position: { start: 20, end: 26 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['tag4'],
          context: 'Context 4',
          position: { start: 30, end: 36 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(1);
      expect(result[0].tags.length).toBe(4);
      expect(result[0].context.split('|').length).toBe(4);
    });

    it('should handle mixed unique and duplicate elements', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Python 1',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: ['programming'],
          context: 'Java',
          position: { start: 10, end: 14 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['language'],
          context: 'Python 2',
          position: { start: 20, end: 26 }
        },
        {
          text: 'JavaScript',
          normalizedText: 'javascript',
          tags: ['programming'],
          context: 'JavaScript',
          position: { start: 30, end: 40 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(3);
      
      const pythonElement = result.find(el => el.normalizedText === 'python');
      expect(pythonElement).toBeDefined();
      expect(pythonElement!.tags.length).toBe(2);
      expect(pythonElement!.context).toContain('Python 1');
      expect(pythonElement!.context).toContain('Python 2');
    });

    it('should not modify original array', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: 'Python',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['language'],
          context: 'Python',
          position: { start: 10, end: 16 }
        }
      ];

      const originalLength = elements.length;
      deduplicateElements(elements);

      expect(elements.length).toBe(originalLength);
    });
  });

  describe('countDuplicates', () => {
    it('should count duplicate elements', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 10, end: 16 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 20, end: 24 }
        }
      ];

      expect(countDuplicates(elements)).toBe(1);
    });

    it('should return 0 for no duplicates', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 10, end: 14 }
        }
      ];

      expect(countDuplicates(elements)).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(countDuplicates([])).toBe(0);
    });

    it('should count multiple duplicates correctly', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 10, end: 16 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 20, end: 26 }
        }
      ];

      expect(countDuplicates(elements)).toBe(2); // 2 duplicates of Python
    });
  });

  describe('findDuplicateGroups', () => {
    it('should find groups of duplicate elements', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 10, end: 16 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 20, end: 24 }
        }
      ];

      const groups = findDuplicateGroups(elements);

      expect(groups.length).toBe(1);
      expect(groups[0].length).toBe(2);
      expect(groups[0][0].normalizedText).toBe('python');
    });

    it('should return empty array when no duplicates', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 10, end: 14 }
        }
      ];

      const groups = findDuplicateGroups(elements);
      expect(groups).toEqual([]);
    });

    it('should find multiple duplicate groups', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 10, end: 16 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 20, end: 24 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 30, end: 34 }
        }
      ];

      const groups = findDuplicateGroups(elements);

      expect(groups.length).toBe(2);
    });
  });

  describe('hasDuplicates', () => {
    it('should return true when duplicates exist', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 10, end: 16 }
        }
      ];

      expect(hasDuplicates(elements)).toBe(true);
    });

    it('should return false when no duplicates', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 10, end: 14 }
        }
      ];

      expect(hasDuplicates(elements)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(hasDuplicates([])).toBe(false);
    });

    it('should return false for single element', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        }
      ];

      expect(hasDuplicates(elements)).toBe(false);
    });
  });

  describe('getDeduplicationStats', () => {
    it('should calculate deduplication statistics', () => {
      const original: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 10, end: 16 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 20, end: 24 }
        }
      ];

      const deduplicated = deduplicateElements(original);
      const stats = getDeduplicationStats(original, deduplicated);

      expect(stats.originalCount).toBe(3);
      expect(stats.deduplicatedCount).toBe(2);
      expect(stats.duplicatesRemoved).toBe(1);
      expect(stats.reductionPercentage).toBeCloseTo(33.33, 1);
    });

    it('should handle no duplicates', () => {
      const original: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 10, end: 14 }
        }
      ];

      const deduplicated = deduplicateElements(original);
      const stats = getDeduplicationStats(original, deduplicated);

      expect(stats.originalCount).toBe(2);
      expect(stats.deduplicatedCount).toBe(2);
      expect(stats.duplicatesRemoved).toBe(0);
      expect(stats.reductionPercentage).toBe(0);
    });

    it('should handle empty arrays', () => {
      const stats = getDeduplicationStats([], []);

      expect(stats.originalCount).toBe(0);
      expect(stats.deduplicatedCount).toBe(0);
      expect(stats.duplicatesRemoved).toBe(0);
      expect(stats.reductionPercentage).toBe(0);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle real-world job description with duplicates', () => {
      const elements: TaggedElement[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming', 'language'],
          context: 'Required: Python programming',
          position: { start: 0, end: 6 },
          importance: 0.9,
          semanticTags: ['technical'],
          category: 'skill'
        },
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: ['ai', 'ml'],
          context: 'Experience with machine learning',
          position: { start: 10, end: 26 },
          importance: 0.8,
          semanticTags: ['technical'],
          category: 'skill'
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['scripting'],
          context: 'Preferred: Python scripting',
          position: { start: 30, end: 36 },
          importance: 0.5,
          semanticTags: ['technical'],
          category: 'skill'
        },
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: ['data science'],
          context: 'Machine learning algorithms',
          position: { start: 40, end: 56 },
          importance: 0.7,
          semanticTags: ['technical'],
          category: 'skill'
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(2);

      const python = result.find(el => el.normalizedText === 'python');
      expect(python).toBeDefined();
      expect(python!.importance).toBe(0.9); // Max importance
      expect(python!.tags).toContain('programming');
      expect(python!.tags).toContain('language');
      expect(python!.tags).toContain('scripting');

      const ml = result.find(el => el.normalizedText === 'machine learning');
      expect(ml).toBeDefined();
      expect(ml!.importance).toBe(0.8); // Max importance
      expect(ml!.tags).toContain('ai');
      expect(ml!.tags).toContain('ml');
      expect(ml!.tags).toContain('data science');
    });

    it('should handle resume with skills mentioned in multiple sections', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['programming'],
          context: '[Skills] Python, Java, JavaScript',
          position: { start: 0, end: 6 }
        },
        {
          text: 'project management',
          normalizedText: 'project management',
          tags: ['leadership'],
          context: '[Experience] Led project management for team',
          position: { start: 10, end: 28 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: ['backend'],
          context: '[Experience] Developed Python applications',
          position: { start: 30, end: 36 }
        },
        {
          text: 'project management',
          normalizedText: 'project management',
          tags: ['agile'],
          context: '[Summary] Experienced in project management',
          position: { start: 40, end: 58 }
        }
      ];

      const result = deduplicateElements(elements);

      expect(result.length).toBe(2);

      const python = result.find(el => el.normalizedText === 'python');
      expect(python).toBeDefined();
      expect(python!.context).toContain('[Skills]');
      expect(python!.context).toContain('[Experience]');
      expect(python!.tags).toContain('programming');
      expect(python!.tags).toContain('backend');

      const pm = result.find(el => el.normalizedText === 'project management');
      expect(pm).toBeDefined();
      expect(pm!.context).toContain('[Experience]');
      expect(pm!.context).toContain('[Summary]');
      expect(pm!.tags).toContain('leadership');
      expect(pm!.tags).toContain('agile');
    });
  });
});
