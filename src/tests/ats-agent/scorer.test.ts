/**
 * Unit tests for Scorer Engine
 * 
 * Tests importance scoring, match score calculation, gap identification,
 * and strength identification.
 * 
 * Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.4, 5.5
 * Task: 6.14 (Write unit tests for scorer engine)
 */

import { describe, it, expect } from 'vitest';
import {
  assignImportance,
  calculateMatchScore,
  assignImportanceScores
} from '../../ats-agent/parser/scorer';
import {
  Element,
  ParsedJob,
  ParsedResume,
  SemanticMatch
} from '../../ats-agent/types';

describe('Scorer Engine - Unit Tests', () => {
  describe('assignImportance', () => {
    it('should assign high importance (>= 0.9) for "required" indicator', () => {
      const element: Element = {
        text: 'Python',
        normalizedText: 'python',
        tags: ['programming'],
        context: 'Python experience is required for this role',
        position: { start: 0, end: 6 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeGreaterThanOrEqual(0.9);
      expect(importance).toBeLessThanOrEqual(1.0);
    });

    it('should assign high importance (>= 0.9) for "must have" indicator', () => {
      const element: Element = {
        text: 'JavaScript',
        normalizedText: 'javascript',
        tags: ['programming'],
        context: 'Must have JavaScript skills',
        position: { start: 0, end: 10 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeGreaterThanOrEqual(0.9);
    });

    it('should assign high importance (>= 0.9) for "essential" indicator', () => {
      const element: Element = {
        text: 'SQL',
        normalizedText: 'sql',
        tags: ['databases'],
        context: 'SQL knowledge is essential',
        position: { start: 0, end: 3 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeGreaterThanOrEqual(0.9);
    });

    it('should assign low importance (<= 0.5) for "preferred" indicator', () => {
      const element: Element = {
        text: 'Docker',
        normalizedText: 'docker',
        tags: ['tools'],
        context: 'Docker experience is preferred',
        position: { start: 0, end: 6 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeLessThanOrEqual(0.5);
    });

    it('should assign low importance (<= 0.5) for "nice to have" indicator', () => {
      const element: Element = {
        text: 'Kubernetes',
        normalizedText: 'kubernetes',
        tags: ['tools'],
        context: 'Kubernetes is nice to have',
        position: { start: 0, end: 10 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeLessThanOrEqual(0.5);
    });

    it('should assign low importance (<= 0.5) for "bonus" indicator', () => {
      const element: Element = {
        text: 'AWS',
        normalizedText: 'aws',
        tags: ['platforms'],
        context: 'AWS experience is a bonus',
        position: { start: 0, end: 3 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeLessThanOrEqual(0.5);
    });

    it('should use highest importance when multiple indicators conflict', () => {
      const element: Element = {
        text: 'React',
        normalizedText: 'react',
        tags: ['frameworks'],
        context: 'React is required but also nice to have for advanced features',
        position: { start: 0, end: 5 }
      };

      const importance = assignImportance(element, element.context);
      // Should use "required" (high) over "nice to have" (low)
      expect(importance).toBeGreaterThanOrEqual(0.9);
    });

    it('should infer importance from position (earlier = more important)', () => {
      const element: Element = {
        text: 'TypeScript',
        normalizedText: 'typescript',
        tags: ['programming'],
        context: 'TypeScript experience',
        position: { start: 0, end: 10 }
      };

      const earlyImportance = assignImportance(element, element.context, 0.1);
      const lateImportance = assignImportance(element, element.context, 0.9);

      expect(earlyImportance).toBeGreaterThan(lateImportance);
    });

    it('should boost importance for elements in requirements section', () => {
      const element: Element = {
        text: 'Java',
        normalizedText: 'java',
        tags: ['programming'],
        context: 'Requirements: Java programming skills',
        position: { start: 0, end: 4 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeGreaterThan(0.5);
    });

    it('should reduce importance for elements in nice-to-have section', () => {
      const element: Element = {
        text: 'Go',
        normalizedText: 'go',
        tags: ['programming'],
        context: 'Nice to have: Go programming experience',
        position: { start: 0, end: 2 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeLessThan(0.5);
    });

    it('should boost importance for frequently mentioned elements', () => {
      const element: Element = {
        text: 'Python',
        normalizedText: 'python',
        tags: ['programming'],
        context: 'Python skills required. Python experience with Python frameworks.',
        position: { start: 0, end: 6 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeGreaterThan(0.5);
    });

    it('should always return score in range [0.0, 1.0]', () => {
      const element: Element = {
        text: 'Test',
        normalizedText: 'test',
        tags: [],
        context: 'Test context',
        position: { start: 0, end: 4 }
      };

      const importance = assignImportance(element, element.context);
      expect(importance).toBeGreaterThanOrEqual(0.0);
      expect(importance).toBeLessThanOrEqual(1.0);
    });
  });

  describe('calculateMatchScore', () => {
    it('should return score in range [0.0, 1.0]', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);
      expect(result.overallScore).toBeGreaterThanOrEqual(0.0);
      expect(result.overallScore).toBeLessThanOrEqual(1.0);
    });

    it('should weight matches by importance of job requirements', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          },
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['tools'],
            context: 'Docker experience',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer with Docker',
        metadata: {}
      };

      // High importance match
      const highImportanceJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      // Low importance match
      const lowImportanceJob: ParsedJob = {
        elements: [
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['tools'],
            context: 'Docker nice to have',
            position: { start: 0, end: 6 },
            importance: 0.3,
            category: 'skill'
          } as any
        ],
        rawText: 'Docker nice to have',
        metadata: {}
      };

      const highMatches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: highImportanceJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const lowMatches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[1],
          jobElement: lowImportanceJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const highResult = calculateMatchScore(parsedResume, highImportanceJob, highMatches);
      const lowResult = calculateMatchScore(parsedResume, lowImportanceJob, lowMatches);

      // High importance match should contribute more to score
      expect(highResult.overallScore).toBeGreaterThan(lowResult.overallScore);
    });

    it('should include all dimension scores in breakdown', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      expect(result.breakdown).toHaveProperty('keywordScore');
      expect(result.breakdown).toHaveProperty('skillsScore');
      expect(result.breakdown).toHaveProperty('attributesScore');
      expect(result.breakdown).toHaveProperty('experienceScore');
      expect(result.breakdown).toHaveProperty('levelScore');
      expect(result.breakdown).toHaveProperty('weights');
    });

    it('should identify gaps for missing job requirements', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript required',
            position: { start: 0, end: 10 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python and JavaScript required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Should identify JavaScript as a gap
      expect(result.gaps.length).toBeGreaterThan(0);
      const jsGap = result.gaps.find(g => g.element.normalizedText === 'javascript');
      expect(jsGap).toBeDefined();
      expect(jsGap?.importance).toBe(0.9);
    });

    it('should sort gaps by impact (importance × (1 - match quality))', () => {
      const parsedResume: ParsedResume = {
        elements: [],
        rawText: '',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any,
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['tools'],
            context: 'Docker nice to have',
            position: { start: 0, end: 6 },
            importance: 0.3,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required, Docker nice to have',
        metadata: {}
      };

      const matches: SemanticMatch[] = [];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Python (importance 0.9) should be first gap
      expect(result.gaps[0].element.normalizedText).toBe('python');
      expect(result.gaps[0].impact).toBeGreaterThan(result.gaps[1].impact);
    });

    it('should identify strengths for high-quality matches on important elements', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Should identify Python as a strength
      expect(result.strengths.length).toBeGreaterThan(0);
      const pythonStrength = result.strengths.find(s => s.element.normalizedText === 'python');
      expect(pythonStrength).toBeDefined();
      expect(pythonStrength?.matchType).toBe('exact');
    });

    it('should sort strengths by contribution (importance × match quality)', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          },
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['tools'],
            context: 'Docker experience',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer with Docker',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any,
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['tools'],
            context: 'Docker preferred',
            position: { start: 0, end: 6 },
            importance: 0.5,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required, Docker preferred',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        },
        {
          resumeElement: parsedResume.elements[1],
          jobElement: parsedJob.elements[1],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Python (importance 0.9) should be first strength
      expect(result.strengths[0].element.normalizedText).toBe('python');
      expect(result.strengths[0].contribution).toBeGreaterThan(result.strengths[1].contribution);
    });
  });

  describe('assignImportanceScores', () => {
    it('should assign importance to all elements in parsed job', () => {
      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 }
          },
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript preferred',
            position: { start: 0, end: 10 }
          }
        ],
        rawText: 'Python required, JavaScript preferred',
        metadata: {}
      };

      const result = assignImportanceScores(parsedJob);

      expect(result.elements.length).toBe(2);
      expect((result.elements[0] as any).importance).toBeDefined();
      expect((result.elements[1] as any).importance).toBeDefined();
    });

    it('should assign higher importance to earlier elements', () => {
      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python experience',
            position: { start: 0, end: 6 }
          },
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript experience',
            position: { start: 0, end: 10 }
          }
        ],
        rawText: 'Python and JavaScript experience',
        metadata: {}
      };

      const result = assignImportanceScores(parsedJob);

      const firstImportance = (result.elements[0] as any).importance;
      const lastImportance = (result.elements[result.elements.length - 1] as any).importance;

      // Earlier elements should have higher importance (due to position boost)
      expect(firstImportance).toBeGreaterThanOrEqual(lastImportance);
    });
  });

  describe('Enhanced Score Breakdown (Task 15.1)', () => {
    it('should include detailed dimension breakdowns in score result', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          },
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript expert',
            position: { start: 0, end: 10 }
          }
        ],
        rawText: 'Python and JavaScript developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript required',
            position: { start: 0, end: 10 },
            importance: 0.8,
            category: 'skill'
          } as any
        ],
        rawText: 'Python and JavaScript required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        },
        {
          resumeElement: parsedResume.elements[1],
          jobElement: parsedJob.elements[1],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify dimensions object exists
      expect(result.breakdown.dimensions).toBeDefined();
      expect(result.breakdown.dimensions).toHaveProperty('keywords');
      expect(result.breakdown.dimensions).toHaveProperty('skills');
      expect(result.breakdown.dimensions).toHaveProperty('attributes');
      expect(result.breakdown.dimensions).toHaveProperty('experience');
      expect(result.breakdown.dimensions).toHaveProperty('level');
    });

    it('should include contribution details for each dimension', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify skills dimension has detailed breakdown
      const skillsDimension = result.breakdown.dimensions!.skills;
      expect(skillsDimension).toHaveProperty('score');
      expect(skillsDimension).toHaveProperty('weight');
      expect(skillsDimension).toHaveProperty('weightedScore');
      expect(skillsDimension).toHaveProperty('contributions');
      expect(Array.isArray(skillsDimension.contributions)).toBe(true);
    });

    it('should show how each matched element contributed to the score', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify contribution details
      const skillsContributions = result.breakdown.dimensions!.skills.contributions;
      expect(skillsContributions.length).toBeGreaterThan(0);

      const pythonContribution = skillsContributions[0];
      expect(pythonContribution).toHaveProperty('element');
      expect(pythonContribution).toHaveProperty('importance');
      expect(pythonContribution).toHaveProperty('matchQuality');
      expect(pythonContribution).toHaveProperty('contribution');
      expect(pythonContribution).toHaveProperty('category');
      expect(pythonContribution).toHaveProperty('matchType');

      // Verify values
      expect(pythonContribution.element.normalizedText).toBe('python');
      expect(pythonContribution.importance).toBe(0.9);
      expect(pythonContribution.matchQuality).toBe(1.0); // exact match
      expect(pythonContribution.contribution).toBe(0.9); // importance × matchQuality
      expect(pythonContribution.category).toBe('skill');
      expect(pythonContribution.matchType).toBe('exact');
    });

    it('should calculate weighted scores for each dimension', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify weighted scores are calculated correctly
      const skillsDimension = result.breakdown.dimensions!.skills;
      const expectedWeightedScore = skillsDimension.score * skillsDimension.weight;
      expect(skillsDimension.weightedScore).toBeCloseTo(expectedWeightedScore, 5);
    });

    it('should track contributions for multiple elements in same dimension', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          },
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript expert',
            position: { start: 0, end: 10 }
          }
        ],
        rawText: 'Python and JavaScript developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript required',
            position: { start: 0, end: 10 },
            importance: 0.8,
            category: 'skill'
          } as any
        ],
        rawText: 'Python and JavaScript required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        },
        {
          resumeElement: parsedResume.elements[1],
          jobElement: parsedJob.elements[1],
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify both contributions are tracked
      const skillsContributions = result.breakdown.dimensions!.skills.contributions;
      expect(skillsContributions.length).toBe(2);

      // Verify Python contribution
      const pythonContrib = skillsContributions.find(c => c.element.normalizedText === 'python');
      expect(pythonContrib).toBeDefined();
      expect(pythonContrib!.importance).toBe(0.9);
      expect(pythonContrib!.contribution).toBe(0.9);

      // Verify JavaScript contribution
      const jsContrib = skillsContributions.find(c => c.element.normalizedText === 'javascript');
      expect(jsContrib).toBeDefined();
      expect(jsContrib!.importance).toBe(0.8);
      expect(jsContrib!.contribution).toBe(0.8);
    });

    it('should show zero contribution for missing elements', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python developer',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Python developer',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9,
            category: 'skill'
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript required',
            position: { start: 0, end: 10 },
            importance: 0.8,
            category: 'skill'
          } as any
        ],
        rawText: 'Python and JavaScript required',
        metadata: {}
      };

      const matches: SemanticMatch[] = [
        {
          resumeElement: parsedResume.elements[0],
          jobElement: parsedJob.elements[0],
          matchType: 'exact',
          confidence: 1.0
        }
        // No match for JavaScript
      ];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify JavaScript has zero contribution
      const skillsContributions = result.breakdown.dimensions!.skills.contributions;
      const jsContrib = skillsContributions.find(c => c.element.normalizedText === 'javascript');
      expect(jsContrib).toBeDefined();
      expect(jsContrib!.matchQuality).toBe(0.0);
      expect(jsContrib!.contribution).toBe(0.0);
      expect(jsContrib!.matchType).toBeUndefined();
    });
  });

  describe('Gap Importance Display (Requirement 10.4)', () => {
    it('should include importance score in each gap', () => {
      const parsedResume: ParsedResume = {
        elements: [],
        rawText: '',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.95,
            category: 'skill'
          } as any,
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['tools'],
            context: 'Docker preferred',
            position: { start: 0, end: 6 },
            importance: 0.4,
            category: 'skill'
          } as any
        ],
        rawText: 'Python required, Docker preferred',
        metadata: {}
      };

      const matches: SemanticMatch[] = [];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify all gaps have importance scores
      expect(result.gaps.length).toBe(2);
      
      result.gaps.forEach(gap => {
        // Each gap must have an importance field
        expect(gap.importance).toBeDefined();
        expect(typeof gap.importance).toBe('number');
        
        // Importance should be in valid range [0.0, 1.0]
        expect(gap.importance).toBeGreaterThanOrEqual(0.0);
        expect(gap.importance).toBeLessThanOrEqual(1.0);
      });

      // Verify specific importance values are preserved
      const pythonGap = result.gaps.find(g => g.element.normalizedText === 'python');
      const dockerGap = result.gaps.find(g => g.element.normalizedText === 'docker');
      
      expect(pythonGap?.importance).toBe(0.95);
      expect(dockerGap?.importance).toBe(0.4);
    });

    it('should allow importance scores to be displayed in output', () => {
      const parsedResume: ParsedResume = {
        elements: [],
        rawText: '',
        metadata: {}
      };

      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Leadership',
            normalizedText: 'leadership',
            tags: ['soft_skill'],
            context: 'Leadership essential',
            position: { start: 0, end: 10 },
            importance: 0.9,
            category: 'attribute'
          } as any
        ],
        rawText: 'Leadership essential',
        metadata: {}
      };

      const matches: SemanticMatch[] = [];

      const result = calculateMatchScore(parsedResume, parsedJob, matches);

      // Verify gap can be formatted for display with importance
      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      
      // Simulate display formatting (as done in examples)
      const displayText = `✗ ${gap.element.text}`;
      const importanceDisplay = `Importance: ${(gap.importance * 100).toFixed(0)}%`;
      const categoryDisplay = `Category: ${gap.category}`;
      const impactDisplay = `Impact on Score: -${(gap.impact * 100).toFixed(1)}%`;
      
      // Verify all display components are available
      expect(displayText).toBe('✗ Leadership');
      expect(importanceDisplay).toBe('Importance: 90%');
      expect(categoryDisplay).toBe('Category: attribute');
      expect(impactDisplay).toContain('Impact on Score:');
    });
  });
});

