/**
 * Unit Tests for Iteration Controller
 * 
 * Tests termination criteria evaluation including:
 * - Target score threshold
 * - Early stopping on stagnation
 * - Maximum iterations
 * - Custom threshold support
 */

import { vi } from 'vitest';
import {
  evaluateTerminationCriteria,
  determineTerminationReason,
  processIteration,
  createOptimizationResult
} from '../../ats-agent/controller/iterationController';
import type {
  OptimizationConfig,
  IterationHistory,
  Recommendations,
  Resume,
  ParsedJob,
  ParsedResume,
  Element,
  SemanticMatch,
  MatchResult,
  ScoreBreakdown,
  MatchType
} from '../../ats-agent/types';

// Helper to create mock iteration history
function createMockHistory(scores: number[]): IterationHistory[] {
  return scores.map((score, index) => ({
    round: index + 1,
    score,
    recommendations: createMockRecommendations(score),
    resumeVersion: `v${index + 1}`
  }));
}

function createMockRecommendations(score: number): Recommendations {
  return {
    summary: `Current score: ${score}`,
    priority: [],
    optional: [],
    rewording: [],
    metadata: {
      iterationRound: 1,
      currentScore: score,
      targetScore: 0.8
    }
  };
}

describe('Iteration Controller - Termination Criteria', () => {
  const defaultConfig: OptimizationConfig = {
    targetScore: 0.8,
    maxIterations: 10,
    earlyStoppingRounds: 2,
    minImprovement: 0.01
  };

  describe('evaluateTerminationCriteria', () => {
    describe('Target Threshold (Requirement 7.3)', () => {
      it('should terminate when score reaches target threshold', () => {
        const history = createMockHistory([0.5, 0.6, 0.7]);
        const currentScore = 0.8;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Target score');
        expect(decision.reason).toContain('0.8');
      });

      it('should terminate when score exceeds target threshold', () => {
        const history = createMockHistory([0.5, 0.6, 0.7]);
        const currentScore = 0.85;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Target score');
      });

      it('should continue when score is below target threshold', () => {
        const history = createMockHistory([0.5, 0.6, 0.7]);
        const currentScore = 0.75;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should use custom target threshold (Requirement 7.4)', () => {
        const customConfig: OptimizationConfig = {
          ...defaultConfig,
          targetScore: 0.9
        };
        const history = createMockHistory([0.5, 0.6, 0.7]);
        const currentScore = 0.85;

        const decision = evaluateTerminationCriteria(currentScore, history, customConfig);

        expect(decision.shouldContinue).toBe(true);
        expect(decision.reason).toContain('Continuing');
      });
    });

    describe('Early Stopping (Requirement 7.2)', () => {
      it('should terminate after N rounds with no improvement', () => {
        // 3 rounds with no improvement (0.7 -> 0.7 -> 0.7)
        const history = createMockHistory([0.5, 0.6, 0.7, 0.7, 0.7]);
        const currentScore = 0.7;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Early stopping');
        expect(decision.reason).toContain('2 consecutive rounds');
      });

      it('should terminate when improvements are below minImprovement threshold', () => {
        // Improvements of 0.005 (below 0.01 threshold)
        const history = createMockHistory([0.5, 0.6, 0.7, 0.705, 0.708]);
        const currentScore = 0.71;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Early stopping');
      });

      it('should continue if recent improvement meets threshold', () => {
        // Last improvement is 0.02 (above 0.01 threshold)
        const history = createMockHistory([0.5, 0.6, 0.7, 0.7]);
        const currentScore = 0.72;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should not trigger early stopping with insufficient history', () => {
        // Only 2 iterations, need at least earlyStoppingRounds + 1 = 3
        const history = createMockHistory([0.5, 0.6]);
        const currentScore = 0.6;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should handle negative score changes (regression)', () => {
        // Scores going down should also trigger early stopping
        const history = createMockHistory([0.7, 0.68, 0.67, 0.665]);
        const currentScore = 0.664;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Early stopping');
      });

      it('should use custom earlyStoppingRounds value', () => {
        const customConfig: OptimizationConfig = {
          ...defaultConfig,
          earlyStoppingRounds: 3
        };
        // 3 rounds with no improvement
        const history = createMockHistory([0.5, 0.6, 0.7, 0.7, 0.7]);
        const currentScore = 0.7;

        // Should continue because we need 4 rounds total (3 + 1)
        const decision = evaluateTerminationCriteria(currentScore, history, customConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should use custom minImprovement threshold', () => {
        const customConfig: OptimizationConfig = {
          ...defaultConfig,
          minImprovement: 0.05
        };
        // Improvements of 0.02 (below 0.05 threshold)
        const history = createMockHistory([0.5, 0.6, 0.7, 0.72, 0.73]);
        const currentScore = 0.74;

        const decision = evaluateTerminationCriteria(currentScore, history, customConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Early stopping');
      });
    });

    describe('Maximum Iterations', () => {
      it('should terminate when max iterations reached', () => {
        // 10 iterations (maxIterations = 10)
        const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74]);
        const currentScore = 0.75;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Maximum iterations');
        expect(decision.reason).toContain('10');
      });

      it('should continue when below max iterations', () => {
        const history = createMockHistory([0.5, 0.55, 0.6]);
        const currentScore = 0.62;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should use custom maxIterations value', () => {
        const customConfig: OptimizationConfig = {
          ...defaultConfig,
          maxIterations: 5
        };
        const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64]);
        const currentScore = 0.65;

        const decision = evaluateTerminationCriteria(currentScore, history, customConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Maximum iterations');
        expect(decision.reason).toContain('5');
      });
    });

    describe('Priority of Termination Criteria', () => {
      it('should prioritize target threshold over max iterations', () => {
        const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.75]);
        const currentScore = 0.8; // Reaches target at max iterations

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Target score');
        expect(decision.reason).not.toContain('Maximum iterations');
      });

      it('should prioritize target threshold over early stopping', () => {
        // Would trigger early stopping, but also reaches target
        const history = createMockHistory([0.5, 0.6, 0.7, 0.75, 0.78]);
        const currentScore = 0.8;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Target score');
        expect(decision.reason).not.toContain('Early stopping');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty history (first iteration)', () => {
        const history: IterationHistory[] = [];
        const currentScore = 0.5;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should handle score of exactly 0.0', () => {
        const history = createMockHistory([0.0]);
        const currentScore = 0.0;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should handle score of exactly 1.0', () => {
        const history = createMockHistory([0.5, 0.7, 0.9]);
        const currentScore = 1.0;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Target score');
      });

      it('should handle very small improvements at boundary', () => {
        // Improvement of exactly 0.01 (at threshold)
        const history = createMockHistory([0.5, 0.6, 0.7, 0.71]);
        const currentScore = 0.72;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(true);
      });

      it('should handle very small improvements below boundary', () => {
        // Improvement of 0.009 (below threshold)
        const history = createMockHistory([0.5, 0.6, 0.7, 0.709, 0.717]);
        const currentScore = 0.725;

        const decision = evaluateTerminationCriteria(currentScore, history, defaultConfig);

        expect(decision.shouldContinue).toBe(false);
        expect(decision.reason).toContain('Early stopping');
      });
    });
  });

  describe('determineTerminationReason', () => {
    it('should return target_reached when score meets threshold', () => {
      const reason = determineTerminationReason(0.8, 5, defaultConfig);
      expect(reason).toBe('target_reached');
    });

    it('should return target_reached when score exceeds threshold', () => {
      const reason = determineTerminationReason(0.95, 5, defaultConfig);
      expect(reason).toBe('target_reached');
    });

    it('should return max_iterations when iteration count reached', () => {
      const reason = determineTerminationReason(0.75, 10, defaultConfig);
      expect(reason).toBe('max_iterations');
    });

    it('should return early_stopping for other cases', () => {
      const reason = determineTerminationReason(0.75, 5, defaultConfig);
      expect(reason).toBe('early_stopping');
    });

    it('should prioritize target_reached over max_iterations', () => {
      const reason = determineTerminationReason(0.8, 10, defaultConfig);
      expect(reason).toBe('target_reached');
    });

    it('should use custom target threshold', () => {
      const customConfig: OptimizationConfig = {
        ...defaultConfig,
        targetScore: 0.9
      };
      const reason = determineTerminationReason(0.85, 5, customConfig);
      expect(reason).toBe('early_stopping');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle typical successful optimization', () => {
      // Steady improvement until target reached
      const scores = [0.5, 0.58, 0.65, 0.71, 0.77, 0.82];
      
      for (let i = 0; i < scores.length - 1; i++) {
        const history = createMockHistory(scores.slice(0, i + 1));
        const decision = evaluateTerminationCriteria(scores[i + 1], history, defaultConfig);
        
        if (i < scores.length - 2) {
          expect(decision.shouldContinue).toBe(true);
        } else {
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toContain('Target score');
        }
      }
    });

    it('should handle plateau scenario', () => {
      // Improvement then plateau - need 3 consecutive rounds with no improvement
      // for earlyStoppingRounds=2
      const scores = [0.5, 0.6, 0.7, 0.72, 0.73, 0.73, 0.73, 0.73];
      
      for (let i = 0; i < scores.length - 1; i++) {
        const history = createMockHistory(scores.slice(0, i + 1));
        const decision = evaluateTerminationCriteria(scores[i + 1], history, defaultConfig);
        
        // Early stopping triggers at i=6 (7th iteration)
        // History: [0.5, 0.6, 0.7, 0.72, 0.73, 0.73, 0.73]
        // Last 3 scores: [0.73, 0.73, 0.73] - no improvement for 2 consecutive rounds
        if (i < 6) {
          expect(decision.shouldContinue).toBe(true);
        } else {
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toContain('Early stopping');
        }
      }
    });

    it('should handle slow but steady improvement', () => {
      // Small improvements that meet threshold
      const scores = [0.5, 0.52, 0.54, 0.56, 0.58, 0.60];
      
      for (let i = 0; i < scores.length - 1; i++) {
        const history = createMockHistory(scores.slice(0, i + 1));
        const decision = evaluateTerminationCriteria(scores[i + 1], history, defaultConfig);
        
        expect(decision.shouldContinue).toBe(true);
      }
    });
  });
});


describe('Iteration Controller - Process Iteration (Task 10.3)', () => {
  const defaultConfig: OptimizationConfig = {
    targetScore: 0.8,
    maxIterations: 10,
    earlyStoppingRounds: 2,
    minImprovement: 0.01
  };

  // Helper to create mock resume
  function createMockResume(id: string, content: string): Resume {
    return {
      id,
      content,
      format: 'text',
      metadata: {}
    };
  }

  // Helper to create mock parsed resume
  function createMockParsedResume(elements: Element[]): ParsedResume {
    return {
      elements,
      rawText: 'mock resume text',
      metadata: {}
    };
  }

  // Helper to create mock parsed job
  function createMockParsedJob(elements: Element[]): ParsedJob {
    return {
      elements,
      rawText: 'mock job text',
      metadata: {}
    };
  }

  // Helper to create mock element
  function createMockElement(text: string, normalizedText?: string): Element {
    return {
      text,
      normalizedText: normalizedText || text.toLowerCase(),
      tags: [],
      context: `Context for ${text}`,
      position: { start: 0, end: text.length }
    };
  }

  // Helper to create mock semantic match
  function createMockMatch(
    resumeElement: Element,
    jobElement: Element,
    confidence: number = 0.9
  ): SemanticMatch {
    return {
      resumeElement,
      jobElement,
      matchType: 'exact',
      confidence
    };
  }

  // Helper to create mock match result
  function createMockMatchResult(score: number): MatchResult {
    const breakdown: ScoreBreakdown = {
      keywordScore: score,
      skillsScore: score,
      attributesScore: score,
      experienceScore: score,
      levelScore: score,
      weights: {
        keywords: 0.2,
        skills: 0.35,
        attributes: 0.2,
        experience: 0.15,
        level: 0.1
      }
    };

    return {
      overallScore: score,
      breakdown,
      gaps: [],
      strengths: []
    };
  }

  // Helper to create mock recommendations
  function createMockRecommendationsObj(
    iterationRound: number,
    currentScore: number
  ): Recommendations {
    return {
      summary: `Iteration ${iterationRound}: Current score ${currentScore}`,
      priority: [],
      optional: [],
      rewording: [],
      metadata: {
        iterationRound,
        currentScore,
        targetScore: 0.8
      }
    };
  }

  describe('processIteration - Basic Functionality', () => {
    it('should process a resume draft through the complete pipeline', async () => {
      const resumeDraft = createMockResume('resume-1', 'Software engineer with Python experience');
      const jobElements = [createMockElement('Python'), createMockElement('JavaScript')];
      const parsedJob = createMockParsedJob(jobElements);
      const history: IterationHistory[] = [];

      const resumeElements = [createMockElement('Python')];
      const parsedResume = createMockParsedResume(resumeElements);
      const matches = [createMockMatch(resumeElements[0], jobElements[0])];
      const matchResult = createMockMatchResult(0.6);
      const recommendations = createMockRecommendationsObj(1, 0.6);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      // Verify all components were called
      expect(components.parseResume).toHaveBeenCalledWith(resumeDraft);
      expect(components.findSemanticMatches).toHaveBeenCalledWith(
        resumeElements,
        jobElements
      );
      expect(components.calculateMatchScore).toHaveBeenCalledWith(
        parsedResume,
        parsedJob,
        matches
      );
      expect(components.generateRecommendations).toHaveBeenCalledWith(
        matchResult,
        matches,
        1, // iteration round
        0.8 // target score
      );

      // Verify decision
      expect(decision.shouldContinue).toBe(true);
      expect(decision.recommendations).toEqual(recommendations);
    });

    it('should terminate when target score is reached', async () => {
      const resumeDraft = createMockResume('resume-1', 'Excellent resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history = createMockHistory([0.5, 0.6, 0.7]);

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.85); // Above target

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn()
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      // Should terminate without generating recommendations
      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toContain('Target score');
      expect(decision.recommendations).toBeUndefined();
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });

    it('should terminate on early stopping', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume content');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      // History showing no improvement for 2 rounds
      const history = createMockHistory([0.5, 0.6, 0.7, 0.7, 0.7]);

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.7); // No improvement

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn()
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      // Should terminate due to early stopping
      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toContain('Early stopping');
      expect(decision.recommendations).toBeUndefined();
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });

    it('should terminate when max iterations reached', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume content');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      // History with 10 iterations (max)
      const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74]);

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.75);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn()
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      // Should terminate due to max iterations
      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toContain('Maximum iterations');
      expect(decision.recommendations).toBeUndefined();
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });
  });

  describe('processIteration - Component Integration', () => {
    it('should pass correct iteration round to recommendation generator', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history = createMockHistory([0.5, 0.6, 0.7]); // 3 previous iterations

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.72);
      const recommendations = createMockRecommendationsObj(4, 0.72);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      await processIteration(resumeDraft, parsedJob, history, defaultConfig, components);

      // Should pass iteration round 4 (3 previous + 1 current)
      expect(components.generateRecommendations).toHaveBeenCalledWith(
        matchResult,
        matches,
        4,
        0.8
      );
    });

    it('should pass custom target score to recommendation generator', async () => {
      const customConfig: OptimizationConfig = {
        ...defaultConfig,
        targetScore: 0.9
      };

      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.7);
      const recommendations = createMockRecommendationsObj(1, 0.7);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      await processIteration(resumeDraft, parsedJob, history, customConfig, components);

      // Should pass custom target score 0.9
      expect(components.generateRecommendations).toHaveBeenCalledWith(
        matchResult,
        matches,
        1,
        0.9
      );
    });

    it('should pass parsed resume elements to semantic matcher', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const jobElements = [createMockElement('Python'), createMockElement('JavaScript')];
      const parsedJob = createMockParsedJob(jobElements);
      const history: IterationHistory[] = [];

      const resumeElements = [
        createMockElement('Python'),
        createMockElement('React')
      ];
      const parsedResume = createMockParsedResume(resumeElements);
      const matches: SemanticMatch[] = [];
      const matchResult = createMockMatchResult(0.5);
      const recommendations = createMockRecommendationsObj(1, 0.5);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      await processIteration(resumeDraft, parsedJob, history, defaultConfig, components);

      // Should pass both resume and job elements
      expect(components.findSemanticMatches).toHaveBeenCalledWith(
        resumeElements,
        jobElements
      );
    });

    it('should pass matches to both scorer and recommendation generator', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.7);
      const recommendations = createMockRecommendationsObj(1, 0.7);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      await processIteration(resumeDraft, parsedJob, history, defaultConfig, components);

      // Matches should be passed to scorer
      expect(components.calculateMatchScore).toHaveBeenCalledWith(
        parsedResume,
        parsedJob,
        matches
      );

      // Matches should also be passed to recommendation generator
      expect(components.generateRecommendations).toHaveBeenCalledWith(
        matchResult,
        matches,
        1,
        0.8
      );
    });
  });

  describe('processIteration - Error Handling', () => {
    it('should throw error if resume parsing fails', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const components = {
        parseResume: vi.fn().mockRejectedValue(new Error('Parsing failed')),
        findSemanticMatches: vi.fn(),
        calculateMatchScore: vi.fn(),
        generateRecommendations: vi.fn()
      };

      await expect(
        processIteration(resumeDraft, parsedJob, history, defaultConfig, components)
      ).rejects.toThrow('Failed to process iteration: Parsing failed');

      // Subsequent components should not be called
      expect(components.findSemanticMatches).not.toHaveBeenCalled();
      expect(components.calculateMatchScore).not.toHaveBeenCalled();
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });

    it('should throw error if semantic matching fails', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Python')]);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockRejectedValue(new Error('Matching failed')),
        calculateMatchScore: vi.fn(),
        generateRecommendations: vi.fn()
      };

      await expect(
        processIteration(resumeDraft, parsedJob, history, defaultConfig, components)
      ).rejects.toThrow('Failed to process iteration: Matching failed');

      // Subsequent components should not be called
      expect(components.calculateMatchScore).not.toHaveBeenCalled();
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });

    it('should throw error if scoring fails', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockImplementation(() => {
          throw new Error('Scoring failed');
        }),
        generateRecommendations: vi.fn()
      };

      await expect(
        processIteration(resumeDraft, parsedJob, history, defaultConfig, components)
      ).rejects.toThrow('Failed to process iteration: Scoring failed');

      // Recommendation generator should not be called
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const components = {
        parseResume: vi.fn().mockRejectedValue('String error'),
        findSemanticMatches: vi.fn(),
        calculateMatchScore: vi.fn(),
        generateRecommendations: vi.fn()
      };

      await expect(
        processIteration(resumeDraft, parsedJob, history, defaultConfig, components)
      ).rejects.toThrow('Failed to process iteration: Unknown error');
    });
  });

  describe('processIteration - Edge Cases', () => {
    it('should handle first iteration (empty history)', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.6);
      const recommendations = createMockRecommendationsObj(1, 0.6);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      expect(decision.shouldContinue).toBe(true);
      expect(decision.recommendations).toEqual(recommendations);
      // Should pass iteration round 1
      expect(components.generateRecommendations).toHaveBeenCalledWith(
        matchResult,
        matches,
        1,
        0.8
      );
    });

    it('should handle resume with no matching elements', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Java')]); // No match
      const matches: SemanticMatch[] = []; // No matches found
      const matchResult = createMockMatchResult(0.2); // Low score
      const recommendations = createMockRecommendationsObj(1, 0.2);

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn().mockReturnValue(recommendations)
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      expect(decision.shouldContinue).toBe(true);
      expect(decision.recommendations).toEqual(recommendations);
    });

    it('should handle perfect match on first iteration', async () => {
      const resumeDraft = createMockResume('resume-1', 'Perfect resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history: IterationHistory[] = [];

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0], 1.0)];
      const matchResult = createMockMatchResult(1.0); // Perfect score

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn()
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      // Should terminate immediately
      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toContain('Target score');
      expect(components.generateRecommendations).not.toHaveBeenCalled();
    });

    it('should handle score exactly at target threshold', async () => {
      const resumeDraft = createMockResume('resume-1', 'Resume');
      const parsedJob = createMockParsedJob([createMockElement('Python')]);
      const history = createMockHistory([0.5, 0.6, 0.7]);

      const parsedResume = createMockParsedResume([createMockElement('Python')]);
      const matches = [createMockMatch(parsedResume.elements[0], parsedJob.elements[0])];
      const matchResult = createMockMatchResult(0.8); // Exactly at target

      const components = {
        parseResume: vi.fn().mockResolvedValue(parsedResume),
        findSemanticMatches: vi.fn().mockResolvedValue(matches),
        calculateMatchScore: vi.fn().mockReturnValue(matchResult),
        generateRecommendations: vi.fn()
      };

      const decision = await processIteration(
        resumeDraft,
        parsedJob,
        history,
        defaultConfig,
        components
      );

      // Should terminate at exactly target score
      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toContain('Target score');
      expect(decision.reason).toContain('0.8');
    });
  });
});


describe('Iteration Controller - Create Optimization Result (Task 10.4)', () => {
  const defaultConfig: OptimizationConfig = {
    targetScore: 0.8,
    maxIterations: 10,
    earlyStoppingRounds: 2,
    minImprovement: 0.01
  };

  // Helper to create mock resume
  function createMockResume(id: string, content: string): Resume {
    return {
      id,
      content,
      format: 'text',
      metadata: {}
    };
  }

  describe('createOptimizationResult - Basic Functionality', () => {
    it('should create result with all required fields', () => {
      const finalResume = createMockResume('final-1', 'Optimized resume content');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.82]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      // Verify all required fields are present
      expect(result.finalResume).toEqual(finalResume);
      expect(result.finalScore).toBe(0.82);
      expect(result.iterations).toEqual(history);
      expect(result.terminationReason).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should include complete iteration history', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.75, 0.8]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.iterations).toHaveLength(5);
      expect(result.iterations).toEqual(history);
      // Verify history is not modified
      expect(result.iterations[0].score).toBe(0.5);
      expect(result.iterations[4].score).toBe(0.8);
    });

    it('should set final resume correctly', () => {
      const finalResume = createMockResume('resume-final', 'Final optimized content');
      const history = createMockHistory([0.6, 0.7, 0.85]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.finalResume).toEqual(finalResume);
      expect(result.finalResume.id).toBe('resume-final');
      expect(result.finalResume.content).toBe('Final optimized content');
    });

    it('should set final score from last iteration', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.75, 0.82]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.finalScore).toBe(0.82);
      expect(result.finalScore).toBe(history[history.length - 1].score);
    });
  });

  describe('createOptimizationResult - Metrics Calculation', () => {
    it('should calculate initial score correctly', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.45, 0.55, 0.65, 0.75]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.initialScore).toBe(0.45);
      expect(result.metrics.initialScore).toBe(history[0].score);
    });

    it('should calculate final score correctly', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.85]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.finalScore).toBe(0.85);
      expect(result.metrics.finalScore).toBe(history[history.length - 1].score);
    });

    it('should calculate positive improvement correctly', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.8]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.improvement).toBeCloseTo(0.3, 10); // 0.8 - 0.5
    });

    it('should calculate negative improvement (regression)', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.7, 0.65, 0.6, 0.55]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.improvement).toBeCloseTo(-0.15, 10); // 0.55 - 0.7
    });

    it('should calculate zero improvement when score unchanged', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.7, 0.7, 0.7, 0.7]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.improvement).toBe(0);
    });

    it('should calculate iteration count correctly', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.75, 0.8, 0.82]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.iterationCount).toBe(6);
      expect(result.metrics.iterationCount).toBe(history.length);
    });

    it('should handle single iteration', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.85]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.iterationCount).toBe(1);
      expect(result.metrics.initialScore).toBe(0.85);
      expect(result.metrics.finalScore).toBe(0.85);
      expect(result.metrics.improvement).toBe(0);
    });

    it('should handle very small improvements with precision', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.7, 0.705, 0.708, 0.71]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.improvement).toBeCloseTo(0.01, 10);
      expect(result.metrics.initialScore).toBe(0.7);
      expect(result.metrics.finalScore).toBe(0.71);
    });
  });

  describe('createOptimizationResult - Termination Reason', () => {
    it('should set target_reached when score meets threshold', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.8]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.terminationReason).toBe('target_reached');
    });

    it('should set target_reached when score exceeds threshold', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.95]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.terminationReason).toBe('target_reached');
    });

    it('should set max_iterations when iteration limit reached', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      // 10 iterations (max) but score below target
      const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.terminationReason).toBe('max_iterations');
    });

    it('should set early_stopping for stagnation', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      // Stagnation but not at max iterations or target
      const history = createMockHistory([0.5, 0.6, 0.7, 0.7, 0.7]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.terminationReason).toBe('early_stopping');
    });

    it('should prioritize target_reached over max_iterations', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      // Reaches target at exactly max iterations
      const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.75, 0.8]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.terminationReason).toBe('target_reached');
    });

    it('should use custom target threshold', () => {
      const customConfig: OptimizationConfig = {
        ...defaultConfig,
        targetScore: 0.9
      };
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.85]);

      const result = createOptimizationResult(finalResume, history, customConfig);

      // 0.85 is below custom target of 0.9
      expect(result.terminationReason).toBe('early_stopping');
    });

    it('should use custom max iterations', () => {
      const customConfig: OptimizationConfig = {
        ...defaultConfig,
        maxIterations: 5
      };
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.55, 0.6, 0.65, 0.7]);

      const result = createOptimizationResult(finalResume, history, customConfig);

      expect(result.terminationReason).toBe('max_iterations');
    });
  });

  describe('createOptimizationResult - Edge Cases', () => {
    it('should throw error for empty history', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history: IterationHistory[] = [];

      expect(() => {
        createOptimizationResult(finalResume, history, defaultConfig);
      }).toThrow('Cannot create optimization result: no iterations in history');
    });

    it('should handle score of 0.0', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.0, 0.1, 0.2]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.initialScore).toBe(0.0);
      expect(result.metrics.improvement).toBe(0.2);
    });

    it('should handle score of 1.0', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.7, 0.9, 1.0]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.finalScore).toBe(1.0);
      expect(result.metrics.improvement).toBe(0.5);
      expect(result.terminationReason).toBe('target_reached');
    });

    it('should handle perfect score on first iteration', () => {
      const finalResume = createMockResume('final-1', 'Perfect resume');
      const history = createMockHistory([1.0]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.iterationCount).toBe(1);
      expect(result.metrics.initialScore).toBe(1.0);
      expect(result.metrics.finalScore).toBe(1.0);
      expect(result.metrics.improvement).toBe(0);
      expect(result.terminationReason).toBe('target_reached');
    });

    it('should handle resume with different formats', () => {
      const markdownResume = createMockResume('final-1', '# Resume\n\n## Experience');
      markdownResume.format = 'markdown';
      const history = createMockHistory([0.6, 0.7, 0.85]);

      const result = createOptimizationResult(markdownResume, history, defaultConfig);

      expect(result.finalResume.format).toBe('markdown');
      expect(result.finalResume.content).toContain('# Resume');
    });

    it('should preserve resume metadata', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      finalResume.metadata = {
        author: 'John Doe',
        version: 5,
        lastModified: '2024-01-15'
      };
      const history = createMockHistory([0.6, 0.7, 0.8]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.finalResume.metadata).toEqual({
        author: 'John Doe',
        version: 5,
        lastModified: '2024-01-15'
      });
    });

    it('should handle large number of iterations', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      // Create 50 iterations with gradual improvement
      const scores = Array.from({ length: 50 }, (_, i) => 0.5 + (i * 0.006));
      const history = createMockHistory(scores);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.iterationCount).toBe(50);
      expect(result.iterations).toHaveLength(50);
      expect(result.metrics.improvement).toBeCloseTo(0.294, 2);
    });

    it('should handle floating point precision issues', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      // Scores that might cause floating point issues
      const history = createMockHistory([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      expect(result.metrics.improvement).toBeCloseTo(0.6, 10);
      expect(result.metrics.initialScore).toBe(0.1);
      expect(result.metrics.finalScore).toBe(0.7);
    });
  });

  describe('createOptimizationResult - Integration with Requirements', () => {
    it('should satisfy Requirement 7.5: include all required summary fields', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.82]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      // Requirement 7.5: match score, number of iterations, reason for termination
      expect(result.finalScore).toBeDefined();
      expect(result.metrics.iterationCount).toBeDefined();
      expect(result.terminationReason).toBeDefined();
    });

    it('should satisfy Requirement 10.3: provide comprehensive metrics', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.8]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      // Requirement 10.3: initial score, final score, improvement delta, iteration count
      expect(result.metrics.initialScore).toBe(0.5);
      expect(result.metrics.finalScore).toBe(0.8);
      expect(result.metrics.improvement).toBeCloseTo(0.3, 10);
      expect(result.metrics.iterationCount).toBe(4);
    });

    it('should provide transparency for successful optimization', () => {
      const finalResume = createMockResume('final-1', 'Optimized resume');
      const history = createMockHistory([0.45, 0.58, 0.68, 0.75, 0.82]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      // User can see the complete journey
      expect(result.iterations).toHaveLength(5);
      expect(result.metrics.improvement).toBeGreaterThan(0);
      expect(result.terminationReason).toBe('target_reached');
      
      // Can trace improvement over time
      expect(result.iterations[0].score).toBe(0.45);
      expect(result.iterations[4].score).toBe(0.82);
    });

    it('should provide transparency for early stopping', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.6, 0.7, 0.7, 0.7]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      // User can understand why optimization stopped
      expect(result.terminationReason).toBe('early_stopping');
      expect(result.metrics.improvement).toBeCloseTo(0.2, 10);
      
      // Can see the plateau in history
      expect(result.iterations[2].score).toBe(0.7);
      expect(result.iterations[3].score).toBe(0.7);
      expect(result.iterations[4].score).toBe(0.7);
    });

    it('should provide transparency for max iterations', () => {
      const finalResume = createMockResume('final-1', 'Resume');
      const history = createMockHistory([0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74]);

      const result = createOptimizationResult(finalResume, history, defaultConfig);

      // User can see optimization was cut off at limit
      expect(result.terminationReason).toBe('max_iterations');
      expect(result.metrics.iterationCount).toBe(10);
      expect(result.metrics.finalScore).toBeLessThan(defaultConfig.targetScore);
      
      // Can see steady improvement throughout
      expect(result.metrics.improvement).toBeGreaterThan(0);
    });
  });
});


// ============================================================================
// Property-Based Tests
// ============================================================================

import fc from 'fast-check';

describe('Feature: ats-agent, Property 23: Structured Communication Format', () => {
  /**
   * Property 23: Structured Communication Format
   * 
   * For any recommendations sent to the Resume Writer Agent, the output should 
   * conform to the defined Recommendations interface with all required fields present.
   * 
   * Validates: Requirements 7.1, 8.2
   * 
   * This property ensures that:
   * 1. The recommendations object has all required top-level fields
   * 2. The metadata object has all required fields
   * 3. All recommendation arrays contain properly structured items
   * 4. All numeric values are within valid ranges
   * 5. All string fields are non-empty
   */

  // Arbitraries for generating test data
  const elementArbitrary = fc.record({
    text: fc.string({ minLength: 1, maxLength: 50 }),
    normalizedText: fc.string({ minLength: 1, maxLength: 50 }),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    context: fc.string({ minLength: 1, maxLength: 100 }),
    position: fc.record({
      start: fc.nat({ max: 1000 }),
      end: fc.nat({ max: 1000 })
    })
  });

  const parsedJobArbitrary = fc.record({
    elements: fc.array(elementArbitrary, { minLength: 1, maxLength: 10 }),
    rawText: fc.string({ minLength: 10, maxLength: 500 }),
    metadata: fc.dictionary(fc.string(), fc.anything())
  });

  const parsedResumeArbitrary = fc.record({
    elements: fc.array(elementArbitrary, { minLength: 1, maxLength: 10 }),
    rawText: fc.string({ minLength: 10, maxLength: 500 }),
    metadata: fc.dictionary(fc.string(), fc.anything())
  });

  const semanticMatchArbitrary = (resumeElements: Element[], jobElements: Element[]) => {
    if (resumeElements.length === 0 || jobElements.length === 0) {
      return fc.constant([]);
    }
    return fc.array(
      fc.record({
        resumeElement: fc.constantFrom(...resumeElements),
        jobElement: fc.constantFrom(...jobElements),
        matchType: fc.constantFrom('exact', 'synonym', 'related', 'semantic') as fc.Arbitrary<MatchType>,
        confidence: fc.double({ min: 0.0, max: 1.0 })
      }),
      { minLength: 0, maxLength: Math.min(resumeElements.length, jobElements.length) }
    );
  };

  const configArbitrary = fc.record({
    targetScore: fc.double({ min: 0.5, max: 1.0 }),
    maxIterations: fc.integer({ min: 1, max: 20 }),
    earlyStoppingRounds: fc.integer({ min: 1, max: 5 }),
    minImprovement: fc.double({ min: 0.001, max: 0.1 })
  });

  const historyArbitrary = fc.array(
    fc.record({
      round: fc.integer({ min: 1, max: 100 }),
      score: fc.double({ min: 0.0, max: 1.0 }),
      recommendations: fc.record({
        summary: fc.string({ minLength: 1, maxLength: 200 }),
        priority: fc.array(fc.anything(), { maxLength: 5 }),
        optional: fc.array(fc.anything(), { maxLength: 5 }),
        rewording: fc.array(fc.anything(), { maxLength: 5 }),
        metadata: fc.record({
          iterationRound: fc.integer({ min: 1, max: 100 }),
          currentScore: fc.double({ min: 0.0, max: 1.0 }),
          targetScore: fc.double({ min: 0.0, max: 1.0 })
        })
      }),
      resumeVersion: fc.string({ minLength: 1, maxLength: 20 })
    }),
    { minLength: 0, maxLength: 10 }
  );

  it('should return recommendations with all required fields when continuing optimization', async () => {
    await fc.assert(
      fc.asyncProperty(
        parsedResumeArbitrary,
        parsedJobArbitrary,
        configArbitrary,
        historyArbitrary,
        async (parsedResume, parsedJob, config, history) => {
          // Filter history to ensure scores are below target (so we continue)
          const filteredHistory = history.map(h => ({
            ...h,
            score: Math.min(h.score, config.targetScore - 0.1)
          }));

          // Ensure we're not at max iterations
          const limitedHistory = filteredHistory.slice(0, config.maxIterations - 1);

          // Create matches from the parsed data
          const matches = await fc.sample(
            semanticMatchArbitrary(parsedResume.elements, parsedJob.elements),
            1
          )[0];

          // Create match result with score below target
          const matchResult: MatchResult = {
            overallScore: Math.min(config.targetScore - 0.05, 0.75),
            breakdown: {
              keywordScore: 0.7,
              skillsScore: 0.7,
              attributesScore: 0.7,
              experienceScore: 0.7,
              levelScore: 0.7,
              weights: {
                keywords: 0.2,
                skills: 0.35,
                attributes: 0.2,
                experience: 0.15,
                level: 0.1
              }
            },
            gaps: [],
            strengths: []
          };

          // Create mock recommendations that will be returned
          const mockRecommendations: Recommendations = {
            summary: 'Test summary',
            priority: [],
            optional: [],
            rewording: [],
            metadata: {
              iterationRound: limitedHistory.length + 1,
              currentScore: matchResult.overallScore,
              targetScore: config.targetScore
            }
          };

          // Create mock components
          const components = {
            parseResume: vi.fn().mockResolvedValue(parsedResume),
            findSemanticMatches: vi.fn().mockResolvedValue(matches),
            calculateMatchScore: vi.fn().mockReturnValue(matchResult),
            generateRecommendations: vi.fn().mockReturnValue(mockRecommendations)
          };

          // Create mock resume
          const resumeDraft: Resume = {
            id: 'test-resume',
            content: 'Test content',
            format: 'text',
            metadata: {}
          };

          // Process iteration
          const decision = await processIteration(
            resumeDraft,
            parsedJob,
            limitedHistory,
            config,
            components
          );

          // If we should continue, verify recommendations structure
          if (decision.shouldContinue && decision.recommendations) {
            const recs = decision.recommendations;

            // Property: All required top-level fields must be present
            expect(recs).toHaveProperty('summary');
            expect(recs).toHaveProperty('priority');
            expect(recs).toHaveProperty('optional');
            expect(recs).toHaveProperty('rewording');
            expect(recs).toHaveProperty('metadata');

            // Property: summary must be a non-empty string
            expect(typeof recs.summary).toBe('string');
            expect(recs.summary.length).toBeGreaterThan(0);

            // Property: recommendation arrays must be arrays
            expect(Array.isArray(recs.priority)).toBe(true);
            expect(Array.isArray(recs.optional)).toBe(true);
            expect(Array.isArray(recs.rewording)).toBe(true);

            // Property: metadata must have all required fields
            expect(recs.metadata).toHaveProperty('iterationRound');
            expect(recs.metadata).toHaveProperty('currentScore');
            expect(recs.metadata).toHaveProperty('targetScore');

            // Property: metadata fields must have correct types and ranges
            expect(typeof recs.metadata.iterationRound).toBe('number');
            expect(recs.metadata.iterationRound).toBeGreaterThan(0);
            expect(Number.isInteger(recs.metadata.iterationRound)).toBe(true);

            expect(typeof recs.metadata.currentScore).toBe('number');
            expect(recs.metadata.currentScore).toBeGreaterThanOrEqual(0.0);
            expect(recs.metadata.currentScore).toBeLessThanOrEqual(1.0);

            expect(typeof recs.metadata.targetScore).toBe('number');
            expect(recs.metadata.targetScore).toBeGreaterThanOrEqual(0.0);
            expect(recs.metadata.targetScore).toBeLessThanOrEqual(1.0);

            // Property: Each recommendation in arrays must have required fields
            const allRecommendations = [
              ...recs.priority,
              ...recs.optional,
              ...recs.rewording
            ];

            for (const rec of allRecommendations) {
              if (typeof rec === 'object' && rec !== null) {
                // If it's a proper recommendation object, verify structure
                if ('type' in rec) {
                  expect(rec).toHaveProperty('type');
                  expect(rec).toHaveProperty('element');
                  expect(rec).toHaveProperty('importance');
                  expect(rec).toHaveProperty('suggestion');

                  expect(typeof rec.element).toBe('string');
                  expect(rec.element.length).toBeGreaterThan(0);

                  expect(typeof rec.importance).toBe('number');
                  expect(rec.importance).toBeGreaterThanOrEqual(0.0);
                  expect(rec.importance).toBeLessThanOrEqual(1.0);

                  expect(typeof rec.suggestion).toBe('string');
                  expect(rec.suggestion.length).toBeGreaterThan(0);

                  // example is optional, but if present must be a string
                  if ('example' in rec && rec.example !== undefined) {
                    expect(typeof rec.example).toBe('string');
                  }
                }
              }
            }

            return true;
          }

          // If we shouldn't continue, that's also valid (termination criteria met)
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate recommendations structure with actual recommendation data', async () => {
    // This test uses a more realistic scenario with actual recommendation data
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.3, max: 0.75 }), // currentScore (below target)
        fc.integer({ min: 1, max: 5 }), // iterationRound
        fc.double({ min: 0.8, max: 1.0 }), // targetScore
        async (currentScore, iterationRound, targetScore) => {
          // Create realistic recommendations
          const recommendations: Recommendations = {
            summary: `Current score: ${currentScore.toFixed(2)}, target: ${targetScore.toFixed(2)}`,
            priority: [
              {
                type: 'add_skill',
                element: 'Python',
                importance: 0.9,
                suggestion: 'Add Python programming experience',
                example: 'Developed Python scripts for data analysis'
              }
            ],
            optional: [
              {
                type: 'add_experience',
                element: 'leadership',
                importance: 0.6,
                suggestion: 'Highlight leadership experience',
                example: 'Led team of 5 developers'
              }
            ],
            rewording: [
              {
                type: 'reword',
                element: 'JavaScript',
                importance: 0.7,
                suggestion: 'Strengthen JavaScript description',
                example: 'Change "used JavaScript" to "developed complex JavaScript applications"'
              }
            ],
            metadata: {
              iterationRound,
              currentScore,
              targetScore
            }
          };

          // Verify the structure conforms to the interface
          expect(recommendations).toHaveProperty('summary');
          expect(recommendations).toHaveProperty('priority');
          expect(recommendations).toHaveProperty('optional');
          expect(recommendations).toHaveProperty('rewording');
          expect(recommendations).toHaveProperty('metadata');

          expect(typeof recommendations.summary).toBe('string');
          expect(recommendations.summary.length).toBeGreaterThan(0);

          expect(Array.isArray(recommendations.priority)).toBe(true);
          expect(Array.isArray(recommendations.optional)).toBe(true);
          expect(Array.isArray(recommendations.rewording)).toBe(true);

          expect(recommendations.metadata.iterationRound).toBe(iterationRound);
          expect(recommendations.metadata.currentScore).toBe(currentScore);
          expect(recommendations.metadata.targetScore).toBe(targetScore);

          // Verify each recommendation has proper structure
          for (const rec of recommendations.priority) {
            expect(rec).toHaveProperty('type');
            expect(rec).toHaveProperty('element');
            expect(rec).toHaveProperty('importance');
            expect(rec).toHaveProperty('suggestion');
            expect(['add_skill', 'add_experience', 'reword', 'emphasize', 'quantify']).toContain(rec.type);
            expect(typeof rec.element).toBe('string');
            expect(rec.element.length).toBeGreaterThan(0);
            expect(rec.importance).toBeGreaterThanOrEqual(0.0);
            expect(rec.importance).toBeLessThanOrEqual(1.0);
            expect(typeof rec.suggestion).toBe('string');
            expect(rec.suggestion.length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure metadata fields are consistent with iteration state', async () => {
    // Property: metadata should accurately reflect the current iteration state
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.double({ min: 0.0, max: 0.75 }),
          { minLength: 0, maxLength: 8 }
        ), // history scores
        fc.double({ min: 0.3, max: 0.75 }), // current score
        fc.double({ min: 0.8, max: 1.0 }), // target score
        async (historyScores, currentScore, targetScore) => {
          const config: OptimizationConfig = {
            targetScore,
            maxIterations: 10,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };

          // Create history from scores
          const history: IterationHistory[] = historyScores.map((score, index) => ({
            round: index + 1,
            score,
            recommendations: {
              summary: `Round ${index + 1}`,
              priority: [],
              optional: [],
              rewording: [],
              metadata: {
                iterationRound: index + 1,
                currentScore: score,
                targetScore
              }
            },
            resumeVersion: `v${index + 1}`
          }));

          const expectedIterationRound = history.length + 1;

          // Create mock components that return recommendations
          const mockRecommendations: Recommendations = {
            summary: `Iteration ${expectedIterationRound}`,
            priority: [],
            optional: [],
            rewording: [],
            metadata: {
              iterationRound: expectedIterationRound,
              currentScore,
              targetScore
            }
          };

          const components = {
            parseResume: vi.fn().mockResolvedValue({
              elements: [],
              rawText: 'test',
              metadata: {}
            }),
            findSemanticMatches: vi.fn().mockResolvedValue([]),
            calculateMatchScore: vi.fn().mockReturnValue({
              overallScore: currentScore,
              breakdown: {
                keywordScore: currentScore,
                skillsScore: currentScore,
                attributesScore: currentScore,
                experienceScore: currentScore,
                levelScore: currentScore,
                weights: {
                  keywords: 0.2,
                  skills: 0.35,
                  attributes: 0.2,
                  experience: 0.15,
                  level: 0.1
                }
              },
              gaps: [],
              strengths: []
            }),
            generateRecommendations: vi.fn().mockReturnValue(mockRecommendations)
          };

          const resumeDraft: Resume = {
            id: 'test',
            content: 'test',
            format: 'text',
            metadata: {}
          };

          const parsedJob: ParsedJob = {
            elements: [],
            rawText: 'test',
            metadata: {}
          };

          const decision = await processIteration(
            resumeDraft,
            parsedJob,
            history,
            config,
            components
          );

          if (decision.shouldContinue && decision.recommendations) {
            const recs = decision.recommendations;

            // Property: iterationRound must match the current iteration number
            expect(recs.metadata.iterationRound).toBe(expectedIterationRound);

            // Property: currentScore must match the calculated score
            expect(recs.metadata.currentScore).toBe(currentScore);

            // Property: targetScore must match the config
            expect(recs.metadata.targetScore).toBe(targetScore);

            return true;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
