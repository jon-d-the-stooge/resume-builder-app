/**
 * Property-Based Tests for Transparency Features
 * 
 * Tests Properties 34-36: Transparency
 * Validates Requirements 10.1, 10.2, 10.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateMatchScore } from '../../ats-agent/parser/scorer';
import { generateRecommendations } from '../../ats-agent/parser/recommendationGenerator';
import type {
  ParsedJob,
  ParsedResume,
  SemanticMatch,
  MatchResult,
  Element,
  TaggedElement
} from '../../ats-agent/types';

// ============================================================================
// Custom Arbitraries (Generators)
// ============================================================================

/**
 * Generates a tagged element
 */
const taggedElementArbitrary = (): fc.Arbitrary<TaggedElement> => {
  return fc.record({
    text: fc.string({ minLength: 1, maxLength: 50 }),
    normalizedText: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.toLowerCase()),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
    context: fc.string({ maxLength: 200 }),
    position: fc.record({
      start: fc.nat(1000),
      end: fc.nat(1000)
    }),
    importance: fc.double({ min: 0.0, max: 1.0 }),
    semanticTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
    category: fc.constantFrom('keyword', 'skill', 'attribute', 'experience', 'concept')
  });
};

/**
 * Generates a parsed job with elements
 */
const parsedJobArbitrary = (): fc.Arbitrary<ParsedJob> => {
  return fc.record({
    elements: fc.array(taggedElementArbitrary(), { minLength: 1, maxLength: 20 }),
    rawText: fc.string({ minLength: 10, maxLength: 500 }),
    metadata: fc.dictionary(fc.string(), fc.anything())
  });
};

/**
 * Generates a parsed resume with elements
 */
const parsedResumeArbitrary = (): fc.Arbitrary<ParsedResume> => {
  return fc.record({
    elements: fc.array(taggedElementArbitrary(), { minLength: 1, maxLength: 20 }),
    rawText: fc.string({ minLength: 10, maxLength: 500 }),
    metadata: fc.dictionary(fc.string(), fc.anything())
  });
};

/**
 * Generates semantic matches between resume and job elements
 */
const semanticMatchesArbitrary = (
  resumeElements: TaggedElement[],
  jobElements: TaggedElement[]
): fc.Arbitrary<SemanticMatch[]> => {
  if (resumeElements.length === 0 || jobElements.length === 0) {
    return fc.constant([]);
  }

  return fc.array(
    fc.record({
      resumeElement: fc.constantFrom(...resumeElements),
      jobElement: fc.constantFrom(...jobElements),
      matchType: fc.constantFrom('exact', 'synonym', 'related', 'semantic'),
      confidence: fc.double({ min: 0.0, max: 1.0 })
    }),
    { maxLength: Math.min(resumeElements.length, jobElements.length, 10) }
  );
};

// ============================================================================
// Property 34: Score Breakdown Completeness
// ============================================================================

describe('Feature: ats-agent, Property 34: Score Breakdown Completeness', () => {
  it('should include complete breakdown with all dimensions and weights for any match calculation', () => {
    fc.assert(
      fc.property(
        parsedResumeArbitrary(),
        parsedJobArbitrary(),
        (parsedResume, parsedJob) => {
          // Generate semantic matches
          const matches: SemanticMatch[] = [];
          const minMatches = Math.min(parsedResume.elements.length, parsedJob.elements.length, 5);
          
          for (let i = 0; i < minMatches; i++) {
            matches.push({
              resumeElement: parsedResume.elements[i],
              jobElement: parsedJob.elements[i],
              matchType: 'semantic',
              confidence: 0.7
            });
          }

          // Calculate match score
          const matchResult = calculateMatchScore(
            parsedResume,
            parsedJob,
            matches
          );

          // Property: Score breakdown must be complete
          expect(matchResult.breakdown).toBeDefined();
          
          // All dimension scores must be present
          expect(matchResult.breakdown.keywordScore).toBeDefined();
          expect(matchResult.breakdown.skillsScore).toBeDefined();
          expect(matchResult.breakdown.attributesScore).toBeDefined();
          expect(matchResult.breakdown.experienceScore).toBeDefined();
          expect(matchResult.breakdown.levelScore).toBeDefined();
          
          // All dimension scores must be numbers in [0, 1]
          expect(typeof matchResult.breakdown.keywordScore).toBe('number');
          expect(typeof matchResult.breakdown.skillsScore).toBe('number');
          expect(typeof matchResult.breakdown.attributesScore).toBe('number');
          expect(typeof matchResult.breakdown.experienceScore).toBe('number');
          expect(typeof matchResult.breakdown.levelScore).toBe('number');
          
          expect(matchResult.breakdown.keywordScore).toBeGreaterThanOrEqual(0);
          expect(matchResult.breakdown.keywordScore).toBeLessThanOrEqual(1);
          expect(matchResult.breakdown.skillsScore).toBeGreaterThanOrEqual(0);
          expect(matchResult.breakdown.skillsScore).toBeLessThanOrEqual(1);
          expect(matchResult.breakdown.attributesScore).toBeGreaterThanOrEqual(0);
          expect(matchResult.breakdown.attributesScore).toBeLessThanOrEqual(1);
          expect(matchResult.breakdown.experienceScore).toBeGreaterThanOrEqual(0);
          expect(matchResult.breakdown.experienceScore).toBeLessThanOrEqual(1);
          expect(matchResult.breakdown.levelScore).toBeGreaterThanOrEqual(0);
          expect(matchResult.breakdown.levelScore).toBeLessThanOrEqual(1);
          
          // All weights must be present
          expect(matchResult.breakdown.weights).toBeDefined();
          expect(matchResult.breakdown.weights.keywords).toBeDefined();
          expect(matchResult.breakdown.weights.skills).toBeDefined();
          expect(matchResult.breakdown.weights.attributes).toBeDefined();
          expect(matchResult.breakdown.weights.experience).toBeDefined();
          expect(matchResult.breakdown.weights.level).toBeDefined();
          
          // All weights must be numbers
          expect(typeof matchResult.breakdown.weights.keywords).toBe('number');
          expect(typeof matchResult.breakdown.weights.skills).toBe('number');
          expect(typeof matchResult.breakdown.weights.attributes).toBe('number');
          expect(typeof matchResult.breakdown.weights.experience).toBe('number');
          expect(typeof matchResult.breakdown.weights.level).toBe('number');
          
          // Weights should sum to approximately 1.0 (allowing for floating point precision)
          const weightSum = 
            matchResult.breakdown.weights.keywords +
            matchResult.breakdown.weights.skills +
            matchResult.breakdown.weights.attributes +
            matchResult.breakdown.weights.experience +
            matchResult.breakdown.weights.level;
          
          expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.01);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 35: Recommendation Explanations
// ============================================================================

describe('Feature: ats-agent, Property 35: Recommendation Explanations', () => {
  it('should include job requirement reference in every recommendation', () => {
    fc.assert(
      fc.property(
        parsedResumeArbitrary(),
        parsedJobArbitrary(),
        (parsedResume, parsedJob) => {
          // Generate semantic matches (partial matches to create gaps)
          const matches: SemanticMatch[] = [];
          const matchCount = Math.min(
            Math.floor(parsedResume.elements.length / 2),
            Math.floor(parsedJob.elements.length / 2),
            3
          );
          
          for (let i = 0; i < matchCount; i++) {
            matches.push({
              resumeElement: parsedResume.elements[i],
              jobElement: parsedJob.elements[i],
              matchType: 'semantic',
              confidence: 0.5
            });
          }

          // Calculate match score
          const matchResult = calculateMatchScore(
            parsedResume,
            parsedJob,
            matches
          );

          // Generate recommendations
          const recommendations = generateRecommendations(
            matchResult,
            matches,
            1,
            0.8
          );

          // Property: Every recommendation must have an explanation
          const allRecommendations = [
            ...recommendations.priority,
            ...recommendations.optional,
            ...recommendations.rewording
          ];

          for (const rec of allRecommendations) {
            // Each recommendation must have a suggestion (explanation)
            expect(rec.suggestion).toBeDefined();
            expect(typeof rec.suggestion).toBe('string');
            expect(rec.suggestion.length).toBeGreaterThan(0);
            
            // Each recommendation must reference an element (job requirement)
            expect(rec.element).toBeDefined();
            expect(typeof rec.element).toBe('string');
            expect(rec.element.length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 36: Gap Importance Transparency
// ============================================================================

describe('Feature: ats-agent, Property 36: Gap Importance Transparency', () => {
  it('should include importance score in every identified gap', () => {
    fc.assert(
      fc.property(
        parsedResumeArbitrary(),
        parsedJobArbitrary(),
        (parsedResume, parsedJob) => {
          // Generate semantic matches (fewer matches to create gaps)
          const matches: SemanticMatch[] = [];
          const matchCount = Math.min(
            Math.floor(parsedResume.elements.length / 3),
            Math.floor(parsedJob.elements.length / 3),
            2
          );
          
          for (let i = 0; i < matchCount; i++) {
            matches.push({
              resumeElement: parsedResume.elements[i],
              jobElement: parsedJob.elements[i],
              matchType: 'semantic',
              confidence: 0.6
            });
          }

          // Calculate match score
          const matchResult = calculateMatchScore(
            parsedResume,
            parsedJob,
            matches
          );

          // Property: Every gap must have an importance score
          for (const gap of matchResult.gaps) {
            // Importance must be defined
            expect(gap.importance).toBeDefined();
            
            // Importance must be a number
            expect(typeof gap.importance).toBe('number');
            
            // Importance must be in range [0, 1]
            expect(gap.importance).toBeGreaterThanOrEqual(0);
            expect(gap.importance).toBeLessThanOrEqual(1);
            
            // Gap must have an element
            expect(gap.element).toBeDefined();
            expect(gap.element.text).toBeDefined();
            
            // Gap must have a category
            expect(gap.category).toBeDefined();
            expect(typeof gap.category).toBe('string');
            
            // Gap must have an impact score
            expect(gap.impact).toBeDefined();
            expect(typeof gap.impact).toBe('number');
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
