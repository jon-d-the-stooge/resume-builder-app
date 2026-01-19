/**
 * Property-Based Tests for Iteration Controller
 * 
 * Tests Properties 24-27:
 * - Property 24: Early Stopping on Stagnation
 * - Property 25: Success Threshold Termination
 * - Property 26: Custom Threshold Respect
 * - Property 27: Termination Summary Completeness
 */

import fc from 'fast-check';
import {
  evaluateTerminationCriteria,
  determineTerminationReason,
  createOptimizationResult
} from '../../ats-agent/controller/iterationController';
import type {
  OptimizationConfig,
  IterationHistory,
  Recommendations,
  Resume
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

function createMockResume(id: string, content: string): Resume {
  return {
    id,
    content,
    format: 'text',
    metadata: {}
  };
}

describe('Feature: ats-agent, Property 24: Early Stopping on Stagnation', () => {
  /**
   * Property 24: Early Stopping on Stagnation
   * 
   * For any optimization loop where two consecutive iterations produce score 
   * improvements less than the minimum threshold (default: 0.01), the loop 
   * should terminate with reason "early_stopping".
   * 
   * Validates: Requirements 7.2
   */

  // Arbitrary for generating optimization config
  const configArbitrary = fc.record({
    targetScore: fc.double({ min: 0.8, max: 1.0 }),
    maxIterations: fc.integer({ min: 5, max: 20 }),
    earlyStoppingRounds: fc.integer({ min: 2, max: 5 }),
    minImprovement: fc.double({ min: 0.005, max: 0.05 })
  });

  it('should terminate when consecutive rounds show no improvement above threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }), // earlyStoppingRounds
        fc.double({ min: 0.3, max: 0.6 }), // base score
        fc.double({ min: 0.001, max: 0.005 }), // small improvement (below 0.01)
        (earlyStoppingRounds, baseScore, smallImprovement) => {
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20, // High enough to not interfere
            earlyStoppingRounds,
            minImprovement: 0.01
          };
          
          // Create history with earlyStoppingRounds + 1 iterations
          // where improvements are below minImprovement threshold
          const scores: number[] = [];
          let currentScore = baseScore;
          
          // Add initial scores with good improvement
          scores.push(currentScore);
          currentScore += 0.05;
          scores.push(currentScore);
          
          // Add earlyStoppingRounds + 1 scores with minimal improvement
          for (let i = 0; i <= earlyStoppingRounds; i++) {
            currentScore += smallImprovement;
            scores.push(Math.min(currentScore, 0.79)); // Keep below target
          }
          
          const history = createMockHistory(scores);
          const finalScore = scores[scores.length - 1];
          
          const decision = evaluateTerminationCriteria(finalScore, history, config);
          
          // Property: Should terminate due to early stopping
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toContain('Early stopping');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not trigger early stopping when improvements meet threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }), // earlyStoppingRounds
        fc.double({ min: 0.3, max: 0.4 }), // base score
        (earlyStoppingRounds, baseScore) => {
          // Skip NaN values
          if (isNaN(baseScore)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds,
            minImprovement: 0.01
          };
          
          // Create history where the LAST improvement meets threshold
          const scores: number[] = [];
          let currentScore = baseScore;
          
          // Add initial score
          scores.push(currentScore);
          
          // Add earlyStoppingRounds - 1 iterations with small improvements
          for (let i = 0; i < earlyStoppingRounds - 1; i++) {
            currentScore += 0.005; // Below threshold
            scores.push(currentScore);
          }
          
          // Add one more iteration with improvement that meets threshold
          currentScore += config.minImprovement;
          scores.push(Math.min(currentScore, 0.7)); // Keep well below target
          
          // Now add the final score (which also has good improvement)
          currentScore = scores[scores.length - 1] + config.minImprovement;
          const finalScore = Math.min(currentScore, 0.75); // Keep well below target
          
          const history = createMockHistory(scores);
          
          const decision = evaluateTerminationCriteria(finalScore, history, config);
          
          // Property: Should continue because recent improvement meets threshold
          expect(decision.shouldContinue).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should respect custom earlyStoppingRounds value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }), // earlyStoppingRounds
        fc.double({ min: 0.3, max: 0.6 }), // base score
        (earlyStoppingRounds, baseScore) => {
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds,
            minImprovement: 0.01
          };
          
          // Create history with exactly earlyStoppingRounds + 1 iterations of no improvement
          const scores: number[] = [baseScore];
          for (let i = 0; i <= earlyStoppingRounds; i++) {
            scores.push(baseScore + 0.001 * i); // Tiny improvements below threshold
          }
          
          const history = createMockHistory(scores);
          const finalScore = scores[scores.length - 1];
          
          const decision = evaluateTerminationCriteria(finalScore, history, config);
          
          // Property: Should terminate after earlyStoppingRounds of no improvement
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toContain('Early stopping');
          expect(decision.reason).toContain(earlyStoppingRounds.toString());
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: ats-agent, Property 25: Success Threshold Termination', () => {
  /**
   * Property 25: Success Threshold Termination
   * 
   * For any optimization iteration where the match score >= configured threshold 
   * (default: 0.8), the loop should terminate with reason "target_reached".
   * 
   * Validates: Requirements 7.3
   */

  it('should terminate when score reaches or exceeds target threshold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1.0 }), // target score
        fc.double({ min: 0.0, max: 0.3 }), // score offset (to ensure we reach target)
        fc.integer({ min: 1, max: 10 }), // number of iterations
        (targetScore, offset, numIterations) => {
          // Skip NaN values
          if (isNaN(targetScore) || isNaN(offset)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          // Create history leading up to target
          const scores: number[] = [];
          const startScore = Math.max(0.3, targetScore - 0.5);
          const increment = (targetScore - startScore) / numIterations;
          for (let i = 0; i < numIterations; i++) {
            scores.push(startScore + increment * i);
          }
          
          const history = createMockHistory(scores);
          
          // Current score meets or exceeds target
          const currentScore = Math.min(targetScore + offset, 1.0);
          
          const decision = evaluateTerminationCriteria(currentScore, history, config);
          
          // Property: Should terminate with target reached
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toContain('Target score');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should continue when score is below target threshold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.6, max: 1.0 }), // target score
        fc.double({ min: 0.01, max: 0.2 }), // gap below target
        (targetScore, gap) => {
          const config: OptimizationConfig = {
            targetScore,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const currentScore = targetScore - gap;
          const history = createMockHistory([currentScore - 0.1, currentScore - 0.05]);
          
          // Ensure we're not at max iterations
          if (history.length >= config.maxIterations) {
            return true; // Skip
          }
          
          const decision = evaluateTerminationCriteria(currentScore, history, config);
          
          // Property: Should continue because score is below target
          expect(decision.shouldContinue).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should terminate at exactly the target threshold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1.0 }), // target score
        (targetScore) => {
          // Skip NaN values
          if (isNaN(targetScore)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const history = createMockHistory([targetScore - 0.2, targetScore - 0.1]);
          const currentScore = targetScore; // Exactly at target
          
          const decision = evaluateTerminationCriteria(currentScore, history, config);
          
          // Property: Should terminate at exactly target score
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toContain('Target score');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: ats-agent, Property 26: Custom Threshold Respect', () => {
  /**
   * Property 26: Custom Threshold Respect
   * 
   * For any optimization configuration with a custom target score, the 
   * termination logic should use that custom value instead of the default 0.8.
   * 
   * Validates: Requirements 7.4
   */

  it('should use custom target threshold instead of default', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 0.95 }), // custom target (not 0.8)
        fc.double({ min: 0.3, max: 0.5 }), // base score
        (customTarget, baseScore) => {
          // Ensure custom target is different from default
          const adjustedTarget = customTarget === 0.8 ? 0.85 : customTarget;
          
          const config: OptimizationConfig = {
            targetScore: adjustedTarget,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const history = createMockHistory([baseScore, baseScore + 0.1]);
          
          // Test score that would meet default (0.8) but not custom target
          const testScore = 0.8;
          
          if (testScore >= adjustedTarget) {
            // If test score meets custom target, should terminate
            const decision = evaluateTerminationCriteria(testScore, history, config);
            expect(decision.shouldContinue).toBe(false);
            expect(decision.reason).toContain(adjustedTarget.toString());
          } else {
            // If test score doesn't meet custom target, should continue
            const decision = evaluateTerminationCriteria(testScore, history, config);
            expect(decision.shouldContinue).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should respect custom threshold in termination reason determination', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.6, max: 0.95 }), // custom target
        fc.integer({ min: 1, max: 15 }), // iteration count
        (customTarget, iterationCount) => {
          // Skip NaN values
          if (isNaN(customTarget)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore: customTarget,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          // Test with score at custom target
          const finalScore = customTarget;
          const reason = determineTerminationReason(finalScore, iterationCount, config);
          
          // Property: Should recognize target_reached with custom threshold
          expect(reason).toBe('target_reached');
          
          // Test with score below custom target
          const belowScore = customTarget - 0.05;
          const reasonBelow = determineTerminationReason(belowScore, iterationCount, config);
          
          // Property: Should not be target_reached when below custom threshold
          expect(reasonBelow).not.toBe('target_reached');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply custom threshold consistently across all termination checks', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 0.95 }), // custom target
        fc.array(fc.double({ min: 0.3, max: 0.7 }), { minLength: 2, maxLength: 8 }), // history scores
        (customTarget, historyScores) => {
          // Skip NaN values
          if (isNaN(customTarget) || historyScores.some(isNaN)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore: customTarget,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const history = createMockHistory(historyScores);
          
          // Test with score at custom target
          const decision1 = evaluateTerminationCriteria(customTarget, history, config);
          expect(decision1.shouldContinue).toBe(false);
          expect(decision1.reason).toContain(customTarget.toString());
          
          // Test with score slightly above custom target
          const decision2 = evaluateTerminationCriteria(customTarget + 0.01, history, config);
          expect(decision2.shouldContinue).toBe(false);
          expect(decision2.reason).toContain('Target score');
          
          // Test with score slightly below custom target
          if (history.length < config.maxIterations) {
            const decision3 = evaluateTerminationCriteria(customTarget - 0.01, history, config);
            // Should continue or stop for other reasons, but not target reached
            if (!decision3.shouldContinue) {
              expect(decision3.reason).not.toContain('Target score');
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: ats-agent, Property 27: Termination Summary Completeness', () => {
  /**
   * Property 27: Termination Summary Completeness
   * 
   * For any terminated optimization loop, the final result should include 
   * match score, iteration count, termination reason, initial score, final 
   * score, and improvement delta.
   * 
   * Validates: Requirements 7.5, 10.3
   */

  it('should include all required fields in optimization result', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.0, max: 1.0 }), { minLength: 1, maxLength: 15 }), // scores
        fc.string({ minLength: 1, maxLength: 100 }), // resume content
        (scores, content) => {
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const history = createMockHistory(scores);
          const finalResume = createMockResume('final', content);
          
          const result = createOptimizationResult(finalResume, history, config);
          
          // Property: All required fields must be present
          expect(result).toHaveProperty('finalResume');
          expect(result).toHaveProperty('finalScore');
          expect(result).toHaveProperty('iterations');
          expect(result).toHaveProperty('terminationReason');
          expect(result).toHaveProperty('metrics');
          
          // Property: Metrics must include all required sub-fields
          expect(result.metrics).toHaveProperty('initialScore');
          expect(result.metrics).toHaveProperty('finalScore');
          expect(result.metrics).toHaveProperty('improvement');
          expect(result.metrics).toHaveProperty('iterationCount');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate metrics correctly from history', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.0, max: 1.0 }), { minLength: 1, maxLength: 15 }), // scores
        (scores) => {
          // Skip if any scores are NaN
          if (scores.some(isNaN)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const history = createMockHistory(scores);
          const finalResume = createMockResume('final', 'content');
          
          const result = createOptimizationResult(finalResume, history, config);
          
          // Property: Initial score must match first iteration
          expect(result.metrics.initialScore).toBe(scores[0]);
          
          // Property: Final score must match last iteration
          expect(result.metrics.finalScore).toBe(scores[scores.length - 1]);
          
          // Property: Iteration count must match history length
          expect(result.metrics.iterationCount).toBe(scores.length);
          
          // Property: Improvement must be final - initial
          const expectedImprovement = scores[scores.length - 1] - scores[0];
          expect(result.metrics.improvement).toBeCloseTo(expectedImprovement, 10);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should set correct termination reason based on final state', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1.0 }), // target score
        fc.integer({ min: 5, max: 20 }), // max iterations
        fc.double({ min: 0.3, max: 0.95 }), // base score
        (targetScore, maxIterations, baseScore) => {
          const config: OptimizationConfig = {
            targetScore,
            maxIterations,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          // Test case 1: Target reached
          const scoresTargetReached = [baseScore, baseScore + 0.1, targetScore];
          const historyTargetReached = createMockHistory(scoresTargetReached);
          const resultTargetReached = createOptimizationResult(
            createMockResume('final', 'content'),
            historyTargetReached,
            config
          );
          
          // Property: Should be target_reached when score >= target
          if (scoresTargetReached[scoresTargetReached.length - 1] >= targetScore) {
            expect(resultTargetReached.terminationReason).toBe('target_reached');
          }
          
          // Test case 2: Max iterations
          const scoresMaxIterations: number[] = [];
          for (let i = 0; i < maxIterations; i++) {
            scoresMaxIterations.push(Math.min(baseScore + i * 0.01, targetScore - 0.1));
          }
          const historyMaxIterations = createMockHistory(scoresMaxIterations);
          const resultMaxIterations = createOptimizationResult(
            createMockResume('final', 'content'),
            historyMaxIterations,
            config
          );
          
          // Property: Should be max_iterations when at limit and below target
          if (scoresMaxIterations.length >= maxIterations && 
              scoresMaxIterations[scoresMaxIterations.length - 1] < targetScore) {
            expect(resultMaxIterations.terminationReason).toBe('max_iterations');
          }
          
          // Test case 3: Early stopping
          const scoresEarlyStopping = [baseScore, baseScore + 0.05, baseScore + 0.05, baseScore + 0.05];
          const historyEarlyStopping = createMockHistory(scoresEarlyStopping);
          const resultEarlyStopping = createOptimizationResult(
            createMockResume('final', 'content'),
            historyEarlyStopping,
            config
          );
          
          // Property: Should be early_stopping when stagnant, below target, and below max
          const finalScore = scoresEarlyStopping[scoresEarlyStopping.length - 1];
          if (finalScore < targetScore && scoresEarlyStopping.length < maxIterations) {
            expect(resultEarlyStopping.terminationReason).toBe('early_stopping');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve complete iteration history', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.0, max: 1.0 }), { minLength: 1, maxLength: 15 }), // scores
        (scores) => {
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const history = createMockHistory(scores);
          const finalResume = createMockResume('final', 'content');
          
          const result = createOptimizationResult(finalResume, history, config);
          
          // Property: Iteration history must be preserved completely
          expect(result.iterations).toHaveLength(scores.length);
          expect(result.iterations).toEqual(history);
          
          // Property: Each iteration must have all required fields
          for (let i = 0; i < result.iterations.length; i++) {
            const iteration = result.iterations[i];
            expect(iteration).toHaveProperty('round');
            expect(iteration).toHaveProperty('score');
            expect(iteration).toHaveProperty('recommendations');
            expect(iteration).toHaveProperty('resumeVersion');
            
            // Property: Round numbers should be sequential
            expect(iteration.round).toBe(i + 1);
            
            // Property: Scores should match input
            expect(iteration.score).toBe(scores[i]);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge cases in termination summary', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0, max: 1.0 }), // single score
        (score) => {
          // Skip NaN values
          if (isNaN(score)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          // Test with single iteration
          const history = createMockHistory([score]);
          const finalResume = createMockResume('final', 'content');
          
          const result = createOptimizationResult(finalResume, history, config);
          
          // Property: Should handle single iteration correctly
          expect(result.metrics.initialScore).toBe(score);
          expect(result.metrics.finalScore).toBe(score);
          expect(result.metrics.improvement).toBe(0);
          expect(result.metrics.iterationCount).toBe(1);
          
          // Property: Should have valid termination reason
          expect(['target_reached', 'early_stopping', 'max_iterations']).toContain(
            result.terminationReason
          );
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle negative improvement (regression)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 0.9 }), // initial score
        fc.double({ min: 0.05, max: 0.3 }), // regression amount
        (initialScore, regression) => {
          // Skip NaN values
          if (isNaN(initialScore) || isNaN(regression)) {
            return true;
          }
          
          const config: OptimizationConfig = {
            targetScore: 0.8,
            maxIterations: 20,
            earlyStoppingRounds: 2,
            minImprovement: 0.01
          };
          
          const finalScore = Math.max(0, initialScore - regression);
          const scores = [initialScore, initialScore - regression * 0.5, finalScore];
          const history = createMockHistory(scores);
          const finalResume = createMockResume('final', 'content');
          
          const result = createOptimizationResult(finalResume, history, config);
          
          // Property: Improvement should be negative when score decreases
          expect(result.metrics.improvement).toBeLessThan(0);
          expect(result.metrics.improvement).toBeCloseTo(finalScore - initialScore, 10);
          
          // Property: All other fields should still be valid
          expect(result.metrics.initialScore).toBe(initialScore);
          expect(result.metrics.finalScore).toBe(finalScore);
          expect(result.metrics.iterationCount).toBe(3);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
