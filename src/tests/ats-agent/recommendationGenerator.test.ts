/**
 * Property-Based and Unit Tests for Recommendation Generator
 * 
 * Tests Properties 19-22 from the design document:
 * - Property 19: Recommendation Generation
 * - Property 20: Gap Prioritization
 * - Property 21: High-Importance Gap Inclusion
 * - Property 22: Rewording Suggestions for Partial Matches
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * Task: 8.6-8.10
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  prioritizeGaps,
  generateMissingElementRecommendations,
  generateRewordingRecommendations,
  generateEmphasisRecommendations,
  generateSummary,
  generateRecommendations
} from '../../ats-agent/parser/recommendationGenerator';
import {
  MatchResult,
  Gap,
  Strength,
  ScoreBreakdown,
  SemanticMatch,
  Element,
  Recommendations
} from '../../ats-agent/types';

// ============================================================================
// Custom Generators (Arbitraries)
// ============================================================================

/**
 * Generate an element
 */
const elementArbitrary = (): fc.Arbitrary<Element> => {
  return fc.record({
    text: fc.oneof(
      fc.constant('Python'),
      fc.constant('machine learning'),
      fc.constant('leadership'),
      fc.constant('project management'),
      fc.constant('React.js'),
      fc.constant('communication skills')
    ),
    normalizedText: fc.oneof(
      fc.constant('python'),
      fc.constant('machine learning'),
      fc.constant('leadership'),
      fc.constant('project management'),
      fc.constant('reactjs'),
      fc.constant('communication skills')
    ),
    tags: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
    context: fc.string(),
    position: fc.record({
      start: fc.nat(),
      end: fc.nat()
    })
  });
};

/**
 * Generate a gap with specified importance range
 */
const gapArbitrary = (minImportance: number = 0.0, maxImportance: number = 1.0): fc.Arbitrary<Gap> => {
  return fc.record({
    element: elementArbitrary(),
    importance: fc.double({ min: minImportance, max: maxImportance, noNaN: true }),
    category: fc.oneof(
      fc.constant('skill'),
      fc.constant('experience'),
      fc.constant('attribute'),
      fc.constant('keyword'),
      fc.constant('concept')
    ),
    impact: fc.double({ min: 0.0, max: 1.0, noNaN: true })
  });
};

/**
 * Generate a strength
 */
const strengthArbitrary = (): fc.Arbitrary<Strength> => {
  return fc.record({
    element: elementArbitrary(),
    matchType: fc.oneof(
      fc.constant('exact'),
      fc.constant('synonym'),
      fc.constant('related'),
      fc.constant('semantic')
    ),
    contribution: fc.double({ min: 0.0, max: 1.0 })
  });
};

/**
 * Generate a score breakdown
 */
const scoreBreakdownArbitrary = (): fc.Arbitrary<ScoreBreakdown> => {
  return fc.record({
    keywordScore: fc.double({ min: 0.0, max: 1.0 }),
    skillsScore: fc.double({ min: 0.0, max: 1.0 }),
    attributesScore: fc.double({ min: 0.0, max: 1.0 }),
    experienceScore: fc.double({ min: 0.0, max: 1.0 }),
    levelScore: fc.double({ min: 0.0, max: 1.0 }),
    weights: fc.constant({
      keywords: 0.20,
      skills: 0.35,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10
    })
  });
};

/**
 * Generate a match result
 */
const matchResultArbitrary = (): fc.Arbitrary<MatchResult> => {
  return fc.record({
    overallScore: fc.double({ min: 0.0, max: 1.0 }),
    breakdown: scoreBreakdownArbitrary(),
    gaps: fc.array(gapArbitrary(), { minLength: 0, maxLength: 10 }),
    strengths: fc.array(strengthArbitrary(), { minLength: 0, maxLength: 10 })
  });
};

/**
 * Generate a semantic match with specified confidence range
 */
const semanticMatchArbitrary = (minConfidence: number = 0.0, maxConfidence: number = 1.0): fc.Arbitrary<SemanticMatch> => {
  return fc.record({
    resumeElement: elementArbitrary(),
    jobElement: elementArbitrary(),
    matchType: fc.oneof(
      fc.constant('exact' as const),
      fc.constant('synonym' as const),
      fc.constant('related' as const),
      fc.constant('semantic' as const)
    ),
    confidence: fc.double({ min: minConfidence, max: maxConfidence })
  });
};

// ============================================================================
// Property 19: Recommendation Generation
// ============================================================================

describe('Feature: ats-agent, Property 19: Recommendation Generation', () => {
  it('should generate a structured recommendations object for any match score calculation', () => {
    fc.assert(
      fc.property(
        matchResultArbitrary(),
        fc.array(semanticMatchArbitrary(), { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 1, max: 10 }),
        fc.double({ min: 0.5, max: 1.0 }),
        (matchResult, matches, iterationRound, targetScore) => {
          const recommendations = generateRecommendations(
            matchResult,
            matches,
            iterationRound,
            targetScore
          );

          // Property: Must return a structured Recommendations object
          expect(recommendations).toBeDefined();
          expect(recommendations).toHaveProperty('summary');
          expect(recommendations).toHaveProperty('priority');
          expect(recommendations).toHaveProperty('optional');
          expect(recommendations).toHaveProperty('rewording');
          expect(recommendations).toHaveProperty('metadata');

          // Verify summary is a non-empty string
          expect(typeof recommendations.summary).toBe('string');
          expect(recommendations.summary.length).toBeGreaterThan(0);

          // Verify arrays are present
          expect(Array.isArray(recommendations.priority)).toBe(true);
          expect(Array.isArray(recommendations.optional)).toBe(true);
          expect(Array.isArray(recommendations.rewording)).toBe(true);

          // Verify metadata structure
          expect(recommendations.metadata).toHaveProperty('iterationRound');
          expect(recommendations.metadata).toHaveProperty('currentScore');
          expect(recommendations.metadata).toHaveProperty('targetScore');
          expect(recommendations.metadata.iterationRound).toBe(iterationRound);
          expect(recommendations.metadata.currentScore).toBe(matchResult.overallScore);
          expect(recommendations.metadata.targetScore).toBe(targetScore);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 20: Gap Prioritization
// ============================================================================

describe('Feature: ats-agent, Property 20: Gap Prioritization', () => {
  it('should list gaps in descending order of importance score', () => {
    fc.assert(
      fc.property(
        fc.array(gapArbitrary(), { minLength: 2, maxLength: 20 }),
        (gaps) => {
          const prioritized = prioritizeGaps(gaps);

          // Property: Within each priority level, gaps should be sorted by impact (descending)
          
          // Check high priority gaps
          for (let i = 0; i < prioritized.high.length - 1; i++) {
            expect(prioritized.high[i].impact).toBeGreaterThanOrEqual(prioritized.high[i + 1].impact);
          }

          // Check medium priority gaps
          for (let i = 0; i < prioritized.medium.length - 1; i++) {
            expect(prioritized.medium[i].impact).toBeGreaterThanOrEqual(prioritized.medium[i + 1].impact);
          }

          // Check low priority gaps
          for (let i = 0; i < prioritized.low.length - 1; i++) {
            expect(prioritized.low[i].impact).toBeGreaterThanOrEqual(prioritized.low[i + 1].impact);
          }

          // Verify importance thresholds
          prioritized.high.forEach(gap => {
            expect(gap.importance).toBeGreaterThanOrEqual(0.8);
          });

          prioritized.medium.forEach(gap => {
            expect(gap.importance).toBeGreaterThanOrEqual(0.5);
            expect(gap.importance).toBeLessThan(0.8);
          });

          prioritized.low.forEach(gap => {
            expect(gap.importance).toBeLessThan(0.5);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 21: High-Importance Gap Inclusion
// ============================================================================

describe('Feature: ats-agent, Property 21: High-Importance Gap Inclusion', () => {
  it('should include all gaps with importance >= 0.8 in priority recommendations', () => {
    fc.assert(
      fc.property(
        fc.array(gapArbitrary(0.8, 1.0), { minLength: 1, maxLength: 10 }), // High-importance gaps
        fc.array(gapArbitrary(0.0, 0.79), { minLength: 0, maxLength: 10 }), // Lower-importance gaps
        fc.array(semanticMatchArbitrary(), { minLength: 0, maxLength: 5 }),
        (highGaps, lowGaps, matches) => {
          const allGaps = [...highGaps, ...lowGaps];
          
          const matchResult: MatchResult = {
            overallScore: 0.6,
            breakdown: {
              keywordScore: 0.6,
              skillsScore: 0.6,
              attributesScore: 0.6,
              experienceScore: 0.6,
              levelScore: 0.6,
              weights: {
                keywords: 0.20,
                skills: 0.35,
                attributes: 0.20,
                experience: 0.15,
                level: 0.10
              }
            },
            gaps: allGaps,
            strengths: []
          };

          const recommendations = generateRecommendations(matchResult, matches, 1, 0.8);

          // Property: All high-importance gaps should appear in priority recommendations
          const priorityElements = new Set(
            recommendations.priority.map(rec => rec.element.toLowerCase())
          );

          for (const highGap of highGaps) {
            const elementText = highGap.element.text.toLowerCase();
            expect(priorityElements.has(elementText)).toBe(true);
          }

          // Verify all priority recommendations have importance >= 0.8
          recommendations.priority.forEach(rec => {
            expect(rec.importance).toBeGreaterThanOrEqual(0.8);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 22: Rewording Suggestions for Partial Matches
// ============================================================================

describe('Feature: ats-agent, Property 22: Rewording Suggestions for Partial Matches', () => {
  it('should include rewording suggestions for partial matches (confidence 0.3-0.7)', () => {
    fc.assert(
      fc.property(
        fc.array(semanticMatchArbitrary(0.3, 0.7), { minLength: 1, maxLength: 10 }), // Partial matches
        fc.array(semanticMatchArbitrary(0.0, 0.29), { minLength: 0, maxLength: 5 }), // Very weak matches
        fc.array(semanticMatchArbitrary(0.71, 1.0), { minLength: 0, maxLength: 5 }), // Strong matches
        (partialMatches, weakMatches, strongMatches) => {
          const allMatches = [...partialMatches, ...weakMatches, ...strongMatches];
          
          // Create gaps for all matches
          const gaps: Gap[] = allMatches.map(match => ({
            element: match.jobElement,
            importance: 0.7,
            category: 'skill',
            impact: 0.5
          }));

          const matchResult: MatchResult = {
            overallScore: 0.6,
            breakdown: {
              keywordScore: 0.6,
              skillsScore: 0.6,
              attributesScore: 0.6,
              experienceScore: 0.6,
              levelScore: 0.6,
              weights: {
                keywords: 0.20,
                skills: 0.35,
                attributes: 0.20,
                experience: 0.15,
                level: 0.10
              }
            },
            gaps,
            strengths: []
          };

          const recommendations = generateRecommendations(matchResult, allMatches, 1, 0.8);

          // Property: Rewording recommendations should include partial matches
          const rewordingElements = new Set(
            recommendations.rewording
              .filter(rec => rec.type === 'reword')
              .map(rec => rec.element.toLowerCase())
          );

          // At least some partial matches should have rewording suggestions
          let foundPartialMatch = false;
          for (const partialMatch of partialMatches) {
            const elementText = partialMatch.jobElement.text.toLowerCase();
            if (rewordingElements.has(elementText)) {
              foundPartialMatch = true;
              break;
            }
          }

          // If there are partial matches, at least one should have a rewording suggestion
          if (partialMatches.length > 0) {
            expect(foundPartialMatch).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 35: Recommendation Explanations (Task 15.2)
// ============================================================================

describe('Feature: ats-agent, Property 35: Recommendation Explanations', () => {
  it('should include explanation referencing specific job requirement for any recommendation', () => {
    fc.assert(
      fc.property(
        matchResultArbitrary(),
        fc.array(semanticMatchArbitrary(), { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 1, max: 10 }),
        fc.double({ min: 0.5, max: 1.0 }),
        (matchResult, matches, iterationRound, targetScore) => {
          const recommendations = generateRecommendations(
            matchResult,
            matches,
            iterationRound,
            targetScore
          );

          // Property: Every recommendation must have jobRequirementReference and explanation
          const allRecommendations = [
            ...recommendations.priority,
            ...recommendations.optional,
            ...recommendations.rewording
          ];

          for (const rec of allRecommendations) {
            // Must have jobRequirementReference field
            expect(rec).toHaveProperty('jobRequirementReference');
            expect(typeof rec.jobRequirementReference).toBe('string');
            expect(rec.jobRequirementReference.length).toBeGreaterThan(0);
            
            // jobRequirementReference must reference the element
            expect(rec.jobRequirementReference.toLowerCase()).toContain(rec.element.toLowerCase());
            
            // Must have explanation field
            expect(rec).toHaveProperty('explanation');
            expect(typeof rec.explanation).toBe('string');
            expect(rec.explanation.length).toBeGreaterThan(0);
            
            // Explanation must reference the element
            expect(rec.explanation.toLowerCase()).toContain(rec.element.toLowerCase());
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('Recommendation Generator - Unit Tests', () => {
  describe('prioritizeGaps', () => {
    it('should separate gaps into high, medium, and low priority', () => {
      const gaps: Gap[] = [
        {
          element: { text: 'Python', normalizedText: 'python', tags: [], context: '', position: { start: 0, end: 6 } },
          importance: 0.9,
          category: 'skill',
          impact: 0.9
        },
        {
          element: { text: 'leadership', normalizedText: 'leadership', tags: [], context: '', position: { start: 0, end: 10 } },
          importance: 0.6,
          category: 'attribute',
          impact: 0.6
        },
        {
          element: { text: 'bonus skill', normalizedText: 'bonus skill', tags: [], context: '', position: { start: 0, end: 11 } },
          importance: 0.3,
          category: 'skill',
          impact: 0.3
        },
        {
          element: { text: 'critical', normalizedText: 'critical', tags: [], context: '', position: { start: 0, end: 8 } },
          importance: 0.8,
          category: 'skill',
          impact: 0.8
        }
      ];

      const prioritized = prioritizeGaps(gaps);

      expect(prioritized.high).toHaveLength(2);
      expect(prioritized.high[0].importance).toBe(0.9);
      expect(prioritized.high[1].importance).toBe(0.8);

      expect(prioritized.medium).toHaveLength(1);
      expect(prioritized.medium[0].importance).toBe(0.6);

      expect(prioritized.low).toHaveLength(1);
      expect(prioritized.low[0].importance).toBe(0.3);
    });

    it('should sort gaps within each priority level by impact', () => {
      const gaps: Gap[] = [
        {
          element: { text: 'A', normalizedText: 'a', tags: [], context: '', position: { start: 0, end: 1 } },
          importance: 0.85,
          category: 'skill',
          impact: 0.5
        },
        {
          element: { text: 'B', normalizedText: 'b', tags: [], context: '', position: { start: 0, end: 1 } },
          importance: 0.9,
          category: 'skill',
          impact: 0.8
        },
        {
          element: { text: 'C', normalizedText: 'c', tags: [], context: '', position: { start: 0, end: 1 } },
          importance: 0.95,
          category: 'skill',
          impact: 0.7
        }
      ];

      const prioritized = prioritizeGaps(gaps);

      expect(prioritized.high).toHaveLength(3);
      expect(prioritized.high[0].impact).toBe(0.8);
      expect(prioritized.high[1].impact).toBe(0.7);
      expect(prioritized.high[2].impact).toBe(0.5);
    });
  });

  describe('generateMissingElementRecommendations', () => {
    it('should generate add_skill recommendations for skill gaps', () => {
      const gaps: Gap[] = [
        {
          element: { text: 'Python', normalizedText: 'python', tags: [], context: '', position: { start: 0, end: 6 } },
          importance: 0.9,
          category: 'skill',
          impact: 0.9
        }
      ];

      const recommendations = generateMissingElementRecommendations(gaps);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('add_skill');
      expect(recommendations[0].element).toBe('Python');
      expect(recommendations[0].importance).toBe(0.9);
      expect(recommendations[0].suggestion).toContain('Python');
      expect(recommendations[0].example).toBeDefined();
      
      // Task 15.2: Verify job requirement reference and explanation
      expect(recommendations[0].jobRequirementReference).toBeDefined();
      expect(recommendations[0].jobRequirementReference).toContain('Python');
      expect(recommendations[0].jobRequirementReference).toContain('skill');
      expect(recommendations[0].jobRequirementReference).toContain('0.90');
      
      expect(recommendations[0].explanation).toBeDefined();
      expect(recommendations[0].explanation).toContain('Python');
      expect(recommendations[0].explanation).toContain('critical');
      expect(recommendations[0].explanation).toContain('does not currently demonstrate');
    });

    it('should generate add_experience recommendations for experience gaps', () => {
      const gaps: Gap[] = [
        {
          element: { text: 'project management', normalizedText: 'project management', tags: [], context: '', position: { start: 0, end: 18 } },
          importance: 0.85,
          category: 'experience',
          impact: 0.85
        }
      ];

      const recommendations = generateMissingElementRecommendations(gaps);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('add_experience');
      expect(recommendations[0].element).toBe('project management');
      expect(recommendations[0].suggestion).toContain('project management');
      
      // Task 15.2: Verify job requirement reference and explanation
      expect(recommendations[0].jobRequirementReference).toBeDefined();
      expect(recommendations[0].jobRequirementReference).toContain('project management');
      expect(recommendations[0].explanation).toBeDefined();
      expect(recommendations[0].explanation).toContain('high-priority');
    });
  });

  describe('generateRewordingRecommendations', () => {
    it('should generate reword recommendations for partial matches', () => {
      const matches: SemanticMatch[] = [
        {
          resumeElement: { text: 'coding', normalizedText: 'coding', tags: [], context: '', position: { start: 0, end: 6 } },
          jobElement: { text: 'programming', normalizedText: 'programming', tags: [], context: '', position: { start: 0, end: 11 } },
          matchType: 'related',
          confidence: 0.5
        }
      ];

      const gaps: Gap[] = [
        {
          element: { text: 'programming', normalizedText: 'programming', tags: [], context: '', position: { start: 0, end: 11 } },
          importance: 0.8,
          category: 'skill',
          impact: 0.4
        }
      ];

      const recommendations = generateRewordingRecommendations(matches, gaps);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].type).toBe('reword');
      expect(recommendations[0].element).toBe('programming');
      expect(recommendations[0].suggestion).toContain('programming');
      expect(recommendations[0].example).toBeDefined();
      
      // Task 15.2: Verify job requirement reference and explanation
      expect(recommendations[0].jobRequirementReference).toBeDefined();
      expect(recommendations[0].jobRequirementReference).toContain('programming');
      expect(recommendations[0].jobRequirementReference).toContain('0.80');
      
      expect(recommendations[0].explanation).toBeDefined();
      expect(recommendations[0].explanation).toContain('coding');
      expect(recommendations[0].explanation).toContain('programming');
      expect(recommendations[0].explanation).toContain('50%');
    });

    it('should not generate reword recommendations for strong matches', () => {
      const matches: SemanticMatch[] = [
        {
          resumeElement: { text: 'Python', normalizedText: 'python', tags: [], context: '', position: { start: 0, end: 6 } },
          jobElement: { text: 'Python', normalizedText: 'python', tags: [], context: '', position: { start: 0, end: 6 } },
          matchType: 'exact',
          confidence: 1.0
        }
      ];

      const gaps: Gap[] = [];

      const recommendations = generateRewordingRecommendations(matches, gaps);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('generateSummary', () => {
    it('should generate a summary with current score and target', () => {
      const matchResult: MatchResult = {
        overallScore: 0.65,
        breakdown: {
          keywordScore: 0.6,
          skillsScore: 0.7,
          attributesScore: 0.6,
          experienceScore: 0.7,
          levelScore: 0.6,
          weights: {
            keywords: 0.20,
            skills: 0.35,
            attributes: 0.20,
            experience: 0.15,
            level: 0.10
          }
        },
        gaps: [
          {
            element: { text: 'Python', normalizedText: 'python', tags: [], context: '', position: { start: 0, end: 6 } },
            importance: 0.9,
            category: 'skill',
            impact: 0.9
          }
        ],
        strengths: []
      };

      const topRecommendations = [
        {
          type: 'add_skill' as const,
          element: 'Python',
          importance: 0.9,
          suggestion: 'Add Python',
          example: 'Example'
        }
      ];

      const summary = generateSummary(matchResult, 1, 0.8, topRecommendations);

      expect(summary).toContain('65.0%');
      expect(summary).toContain('80.0%');
      expect(summary).toContain('Iteration 1');
      expect(summary).toContain('Python');
    });

    it('should indicate when target is achieved', () => {
      const matchResult: MatchResult = {
        overallScore: 0.85,
        breakdown: {
          keywordScore: 0.8,
          skillsScore: 0.9,
          attributesScore: 0.8,
          experienceScore: 0.9,
          levelScore: 0.8,
          weights: {
            keywords: 0.20,
            skills: 0.35,
            attributes: 0.20,
            experience: 0.15,
            level: 0.10
          }
        },
        gaps: [],
        strengths: []
      };

      const summary = generateSummary(matchResult, 2, 0.8, []);

      expect(summary).toContain('Target achieved');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate complete recommendations structure', () => {
      const matchResult: MatchResult = {
        overallScore: 0.6,
        breakdown: {
          keywordScore: 0.6,
          skillsScore: 0.6,
          attributesScore: 0.6,
          experienceScore: 0.6,
          levelScore: 0.6,
          weights: {
            keywords: 0.20,
            skills: 0.35,
            attributes: 0.20,
            experience: 0.15,
            level: 0.10
          }
        },
        gaps: [
          {
            element: { text: 'Python', normalizedText: 'python', tags: [], context: '', position: { start: 0, end: 6 } },
            importance: 0.9,
            category: 'skill',
            impact: 0.9
          },
          {
            element: { text: 'leadership', normalizedText: 'leadership', tags: [], context: '', position: { start: 0, end: 10 } },
            importance: 0.6,
            category: 'attribute',
            impact: 0.6
          }
        ],
        strengths: []
      };

      const matches: SemanticMatch[] = [];

      const recommendations = generateRecommendations(matchResult, matches, 1, 0.8);

      expect(recommendations.summary).toBeDefined();
      expect(recommendations.priority.length).toBeGreaterThan(0);
      expect(recommendations.metadata.iterationRound).toBe(1);
      expect(recommendations.metadata.currentScore).toBe(0.6);
      expect(recommendations.metadata.targetScore).toBe(0.8);
    });
  });
});

