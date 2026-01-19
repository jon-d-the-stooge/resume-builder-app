/**
 * Unit Tests for Transparency Features
 * 
 * Tests Requirements 10.1, 10.2, 10.4
 */

import { describe, it, expect } from 'vitest';
import { calculateMatchScore } from '../../ats-agent/parser/scorer';
import { generateRecommendations } from '../../ats-agent/parser/recommendationGenerator';
import type {
  ParsedJob,
  ParsedResume,
  SemanticMatch,
  TaggedElement
} from '../../ats-agent/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTaggedElement(
  text: string,
  importance: number = 0.5,
  category: 'keyword' | 'skill' | 'attribute' | 'experience' | 'concept' = 'skill'
): TaggedElement {
  return {
    text,
    normalizedText: text.toLowerCase(),
    tags: [category],
    context: `Context for ${text}`,
    position: { start: 0, end: text.length },
    importance,
    semanticTags: [category],
    category
  };
}

// ============================================================================
// Score Breakdown Tests (Requirement 10.1)
// ============================================================================

describe('Score Breakdown Generation', () => {
  it('should include all dimension scores in breakdown', () => {
    const parsedResume: ParsedResume = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('Leadership', 0.7, 'attribute')
      ],
      rawText: 'Python Leadership',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('JavaScript', 0.8, 'skill'),
        createTaggedElement('Leadership', 0.7, 'attribute')
      ],
      rawText: 'Python JavaScript Leadership',
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
        jobElement: parsedJob.elements[2],
        matchType: 'exact',
        confidence: 1.0
      }
    ];

    const result = calculateMatchScore(parsedResume, parsedJob, matches);

    // All dimension scores must be present
    expect(result.breakdown.keywordScore).toBeDefined();
    expect(result.breakdown.skillsScore).toBeDefined();
    expect(result.breakdown.attributesScore).toBeDefined();
    expect(result.breakdown.experienceScore).toBeDefined();
    expect(result.breakdown.levelScore).toBeDefined();

    // All scores must be numbers
    expect(typeof result.breakdown.keywordScore).toBe('number');
    expect(typeof result.breakdown.skillsScore).toBe('number');
    expect(typeof result.breakdown.attributesScore).toBe('number');
    expect(typeof result.breakdown.experienceScore).toBe('number');
    expect(typeof result.breakdown.levelScore).toBe('number');
  });

  it('should include all dimension weights in breakdown', () => {
    const parsedResume: ParsedResume = {
      elements: [createTaggedElement('Python', 0.9, 'skill')],
      rawText: 'Python',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [createTaggedElement('Python', 0.9, 'skill')],
      rawText: 'Python',
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

    // All weights must be present
    expect(result.breakdown.weights).toBeDefined();
    expect(result.breakdown.weights.keywords).toBeDefined();
    expect(result.breakdown.weights.skills).toBeDefined();
    expect(result.breakdown.weights.attributes).toBeDefined();
    expect(result.breakdown.weights.experience).toBeDefined();
    expect(result.breakdown.weights.level).toBeDefined();

    // Weights should sum to approximately 1.0
    const weightSum =
      result.breakdown.weights.keywords +
      result.breakdown.weights.skills +
      result.breakdown.weights.attributes +
      result.breakdown.weights.experience +
      result.breakdown.weights.level;

    expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.01);
  });

  it('should show contribution from matched elements', () => {
    const parsedResume: ParsedResume = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('Java', 0.8, 'skill')
      ],
      rawText: 'Python Java',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('Java', 0.8, 'skill')
      ],
      rawText: 'Python Java',
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

    // Should have strengths showing contributions
    expect(result.strengths).toBeDefined();
    expect(result.strengths.length).toBeGreaterThan(0);

    // Each strength should have contribution value
    for (const strength of result.strengths) {
      expect(strength.contribution).toBeDefined();
      expect(typeof strength.contribution).toBe('number');
      expect(strength.contribution).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Recommendation Explanation Tests (Requirement 10.2)
// ============================================================================

describe('Recommendation Explanations', () => {
  it('should include job requirement reference in recommendations', () => {
    const parsedResume: ParsedResume = {
      elements: [createTaggedElement('Python', 0.9, 'skill')],
      rawText: 'Python',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('JavaScript', 0.8, 'skill'),
        createTaggedElement('React', 0.7, 'skill')
      ],
      rawText: 'Python JavaScript React',
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

    const matchResult = calculateMatchScore(parsedResume, parsedJob, matches);
    const recommendations = generateRecommendations(matchResult, matches, 1, 0.8);

    // All recommendations should have element references
    const allRecommendations = [
      ...recommendations.priority,
      ...recommendations.optional,
      ...recommendations.rewording
    ];

    for (const rec of allRecommendations) {
      expect(rec.element).toBeDefined();
      expect(typeof rec.element).toBe('string');
      expect(rec.element.length).toBeGreaterThan(0);
    }
  });

  it('should include explanation in recommendation suggestions', () => {
    const parsedResume: ParsedResume = {
      elements: [createTaggedElement('Python', 0.9, 'skill')],
      rawText: 'Python',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('JavaScript', 0.9, 'skill')
      ],
      rawText: 'Python JavaScript',
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

    const matchResult = calculateMatchScore(parsedResume, parsedJob, matches);
    const recommendations = generateRecommendations(matchResult, matches, 1, 0.8);

    // All recommendations should have suggestions (explanations)
    const allRecommendations = [
      ...recommendations.priority,
      ...recommendations.optional,
      ...recommendations.rewording
    ];

    for (const rec of allRecommendations) {
      expect(rec.suggestion).toBeDefined();
      expect(typeof rec.suggestion).toBe('string');
      expect(rec.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('should prioritize high-importance gaps in recommendations', () => {
    const parsedResume: ParsedResume = {
      elements: [createTaggedElement('Python', 0.5, 'skill')],
      rawText: 'Python',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.5, 'skill'),
        createTaggedElement('JavaScript', 0.9, 'skill'), // High importance
        createTaggedElement('CSS', 0.3, 'skill') // Low importance
      ],
      rawText: 'Python JavaScript CSS',
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

    const matchResult = calculateMatchScore(parsedResume, parsedJob, matches);
    const recommendations = generateRecommendations(matchResult, matches, 1, 0.8);

    // Priority recommendations should include high-importance gaps
    expect(recommendations.priority.length).toBeGreaterThan(0);

    // Check that high-importance element is in priority recommendations
    const hasHighImportanceGap = recommendations.priority.some(
      rec => rec.element.toLowerCase().includes('javascript')
    );
    expect(hasHighImportanceGap).toBe(true);
  });
});

// ============================================================================
// Gap Importance Display Tests (Requirement 10.4)
// ============================================================================

describe('Gap Importance Transparency', () => {
  it('should include importance score in all gaps', () => {
    const parsedResume: ParsedResume = {
      elements: [createTaggedElement('Python', 0.9, 'skill')],
      rawText: 'Python',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.9, 'skill'),
        createTaggedElement('JavaScript', 0.8, 'skill'),
        createTaggedElement('React', 0.7, 'skill')
      ],
      rawText: 'Python JavaScript React',
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

    // All gaps should have importance scores
    expect(result.gaps.length).toBeGreaterThan(0);

    for (const gap of result.gaps) {
      expect(gap.importance).toBeDefined();
      expect(typeof gap.importance).toBe('number');
      expect(gap.importance).toBeGreaterThanOrEqual(0);
      expect(gap.importance).toBeLessThanOrEqual(1);
    }
  });

  it('should show impact of each gap', () => {
    const parsedResume: ParsedResume = {
      elements: [createTaggedElement('Python', 0.5, 'skill')],
      rawText: 'Python',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('Python', 0.5, 'skill'),
        createTaggedElement('JavaScript', 0.9, 'skill'),
        createTaggedElement('CSS', 0.3, 'skill')
      ],
      rawText: 'Python JavaScript CSS',
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

    // All gaps should have impact scores
    for (const gap of result.gaps) {
      expect(gap.impact).toBeDefined();
      expect(typeof gap.impact).toBe('number');
    }
  });

  it('should sort gaps by importance', () => {
    const parsedResume: ParsedResume = {
      elements: [],
      rawText: '',
      metadata: {}
    };

    const parsedJob: ParsedJob = {
      elements: [
        createTaggedElement('JavaScript', 0.9, 'skill'),
        createTaggedElement('CSS', 0.3, 'skill'),
        createTaggedElement('React', 0.7, 'skill')
      ],
      rawText: 'JavaScript CSS React',
      metadata: {}
    };

    const matches: SemanticMatch[] = [];

    const result = calculateMatchScore(parsedResume, parsedJob, matches);

    // Gaps should be sorted by importance (descending)
    for (let i = 0; i < result.gaps.length - 1; i++) {
      const currentGap = result.gaps[i];
      const nextGap = result.gaps[i + 1];

      // Current gap should have importance >= next gap
      expect(currentGap.importance).toBeGreaterThanOrEqual(nextGap.importance);
    }
  });
});
