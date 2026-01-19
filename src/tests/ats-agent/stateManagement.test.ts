/**
 * Unit Tests for Optimization State Management
 * 
 * Tests the state management functions that track iteration history,
 * maintain current state (job, resume, config), and manage optimization status.
 * 
 * Task 11.1: Create optimization state management
 * Requirements: 7.1 - Track iteration history and maintain current state
 */

import {
  initializeOptimizationState,
  updateOptimizationState,
  completeOptimizationState,
  failOptimizationState,
  getCurrentIteration,
  getLatestScore,
  getScoreHistory,
  isOptimizationRunning,
  createIterationHistoryEntry
} from '../../ats-agent/controller/iterationController';
import type {
  OptimizationState,
  OptimizationConfig,
  WeightedJob,
  TaggedResume,
  TaggedElement,
  IterationHistory,
  Recommendations,
  ElementCategory
} from '../../ats-agent/types';

// ============================================================================
// Helper Functions
// ============================================================================

function createMockTaggedElement(text: string, importance: number = 0.5): TaggedElement {
  return {
    text,
    normalizedText: text.toLowerCase(),
    tags: ['test-tag'],
    context: `Context for ${text}`,
    position: { start: 0, end: text.length },
    importance,
    semanticTags: ['test-semantic'],
    category: 'skill' as ElementCategory
  };
}

function createMockWeightedJob(id: string, elements: TaggedElement[]): WeightedJob {
  const totalImportance = elements.reduce((sum, el) => sum + el.importance, 0);
  const criticalElements = elements.filter(el => el.importance > 0.8);

  return {
    id,
    elements,
    totalImportance,
    criticalElements,
    metadata: {}
  };
}

function createMockTaggedResume(id: string, elements: TaggedElement[]): TaggedResume {
  return {
    id,
    elements,
    sections: [],
    metadata: {}
  };
}

function createMockConfig(): OptimizationConfig {
  return {
    targetScore: 0.8,
    maxIterations: 10,
    earlyStoppingRounds: 2,
    minImprovement: 0.01
  };
}

function createMockRecommendations(round: number, score: number): Recommendations {
  return {
    summary: `Iteration ${round}: Score ${score}`,
    priority: [],
    optional: [],
    rewording: [],
    metadata: {
      iterationRound: round,
      currentScore: score,
      targetScore: 0.8
    }
  };
}

// ============================================================================
// Tests for initializeOptimizationState
// ============================================================================

describe('State Management - initializeOptimizationState', () => {
  it('should create initial state with all required fields', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state).toHaveProperty('jobPosting');
    expect(state).toHaveProperty('currentResume');
    expect(state).toHaveProperty('history');
    expect(state).toHaveProperty('config');
    expect(state).toHaveProperty('status');
  });

  it('should set job posting correctly', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.jobPosting).toEqual(jobPosting);
    expect(state.jobPosting.id).toBe('job-1');
    expect(state.jobPosting.elements).toHaveLength(1);
  });

  it('should set initial resume correctly', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.currentResume).toEqual(initialResume);
    expect(state.currentResume.id).toBe('resume-1');
    expect(state.currentResume.elements).toHaveLength(1);
  });

  it('should initialize with empty history', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.history).toEqual([]);
    expect(state.history).toHaveLength(0);
  });

  it('should set config correctly', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);

    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.config).toEqual(config);
    expect(state.config.targetScore).toBe(0.8);
    expect(state.config.maxIterations).toBe(10);
  });

  it('should set status to running', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.status).toBe('running');
  });

  it('should handle job with multiple elements', () => {
    const jobElements = [
      createMockTaggedElement('Python', 0.9),
      createMockTaggedElement('JavaScript', 0.8),
      createMockTaggedElement('React', 0.7)
    ];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('Python', 0.8)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.jobPosting.elements).toHaveLength(3);
    expect(state.jobPosting.totalImportance).toBeCloseTo(2.4, 10);
  });

  it('should handle resume with multiple elements', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [
      createMockTaggedElement('Python', 0.8),
      createMockTaggedElement('JavaScript', 0.7),
      createMockTaggedElement('React', 0.6)
    ];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.currentResume.elements).toHaveLength(3);
  });

  it('should handle custom config values', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const customConfig: OptimizationConfig = {
      targetScore: 0.9,
      maxIterations: 15,
      earlyStoppingRounds: 3,
      minImprovement: 0.02
    };

    const state = initializeOptimizationState(jobPosting, initialResume, customConfig);

    expect(state.config.targetScore).toBe(0.9);
    expect(state.config.maxIterations).toBe(15);
    expect(state.config.earlyStoppingRounds).toBe(3);
    expect(state.config.minImprovement).toBe(0.02);
  });

  it('should preserve job metadata', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    jobPosting.metadata = { company: 'TechCorp', location: 'Remote' };
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.jobPosting.metadata).toEqual({ company: 'TechCorp', location: 'Remote' });
  });

  it('should preserve resume metadata', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const resumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', resumeElements);
    initialResume.metadata = { author: 'John Doe', version: 1 };
    const config = createMockConfig();

    const state = initializeOptimizationState(jobPosting, initialResume, config);

    expect(state.currentResume.metadata).toEqual({ author: 'John Doe', version: 1 });
  });
});


// ============================================================================
// Tests for updateOptimizationState
// ============================================================================

describe('State Management - updateOptimizationState', () => {
  it('should update current resume', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const newResumeElements = [createMockTaggedElement('Python', 0.8)];
    const newResume = createMockTaggedResume('resume-2', newResumeElements);
    const iterationResult = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');

    const updatedState = updateOptimizationState(state, newResume, iterationResult);

    expect(updatedState.currentResume).toEqual(newResume);
    expect(updatedState.currentResume.id).toBe('resume-2');
  });

  it('should append iteration to history', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const newResumeElements = [createMockTaggedElement('Python', 0.8)];
    const newResume = createMockTaggedResume('resume-2', newResumeElements);
    const iterationResult = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');

    const updatedState = updateOptimizationState(state, newResume, iterationResult);

    expect(updatedState.history).toHaveLength(1);
    expect(updatedState.history[0]).toEqual(iterationResult);
  });

  it('should preserve job posting', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const newResumeElements = [createMockTaggedElement('Python', 0.8)];
    const newResume = createMockTaggedResume('resume-2', newResumeElements);

    const iterationResult = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');

    const updatedState = updateOptimizationState(state, newResume, iterationResult);

    expect(updatedState.jobPosting).toEqual(jobPosting);
    expect(updatedState.jobPosting.id).toBe('job-1');
  });

  it('should preserve config', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const newResumeElements = [createMockTaggedElement('Python', 0.8)];
    const newResume = createMockTaggedResume('resume-2', newResumeElements);
    const iterationResult = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');

    const updatedState = updateOptimizationState(state, newResume, iterationResult);

    expect(updatedState.config).toEqual(config);
  });

  it('should preserve status', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const newResumeElements = [createMockTaggedElement('Python', 0.8)];
    const newResume = createMockTaggedResume('resume-2', newResumeElements);
    const iterationResult = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');

    const updatedState = updateOptimizationState(state, newResume, iterationResult);

    expect(updatedState.status).toBe('running');
  });

  it('should handle multiple updates', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    let state = initializeOptimizationState(jobPosting, initialResume, config);

    // First update
    const resume2Elements = [createMockTaggedElement('Python', 0.8)];
    const resume2 = createMockTaggedResume('resume-2', resume2Elements);

    const iteration1 = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');
    state = updateOptimizationState(state, resume2, iteration1);

    // Second update
    const resume3Elements = [createMockTaggedElement('Python', 0.9), createMockTaggedElement('React', 0.7)];
    const resume3 = createMockTaggedResume('resume-3', resume3Elements);
    const iteration2 = createIterationHistoryEntry(2, 0.7, createMockRecommendations(2, 0.7), 'resume-3');
    state = updateOptimizationState(state, resume3, iteration2);

    // Third update
    const resume4Elements = [createMockTaggedElement('Python', 0.9), createMockTaggedElement('React', 0.8)];
    const resume4 = createMockTaggedResume('resume-4', resume4Elements);
    const iteration3 = createIterationHistoryEntry(3, 0.8, createMockRecommendations(3, 0.8), 'resume-4');
    state = updateOptimizationState(state, resume4, iteration3);

    expect(state.history).toHaveLength(3);
    expect(state.currentResume.id).toBe('resume-4');
    expect(state.history[0].round).toBe(1);
    expect(state.history[1].round).toBe(2);
    expect(state.history[2].round).toBe(3);
  });

  it('should not mutate original state', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const newResumeElements = [createMockTaggedElement('Python', 0.8)];
    const newResume = createMockTaggedResume('resume-2', newResumeElements);
    const iterationResult = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');

    const updatedState = updateOptimizationState(state, newResume, iterationResult);

    // Original state should be unchanged
    expect(state.currentResume.id).toBe('resume-1');
    expect(state.history).toHaveLength(0);
    
    // Updated state should have new values
    expect(updatedState.currentResume.id).toBe('resume-2');
    expect(updatedState.history).toHaveLength(1);
  });

  it('should track score progression in history', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    let state = initializeOptimizationState(jobPosting, initialResume, config);

    const scores = [0.5, 0.6, 0.7, 0.75, 0.8];
    for (let i = 0; i < scores.length; i++) {
      const newResume = createMockTaggedResume(`resume-${i + 2}`, [createMockTaggedElement('Python', 0.8)]);
      const iteration = createIterationHistoryEntry(i + 1, scores[i], createMockRecommendations(i + 1, scores[i]), `resume-${i + 2}`);
      state = updateOptimizationState(state, newResume, iteration);
    }

    expect(state.history).toHaveLength(5);
    expect(state.history.map(h => h.score)).toEqual([0.5, 0.6, 0.7, 0.75, 0.8]);
  });
});


// ============================================================================
// Tests for completeOptimizationState and failOptimizationState
// ============================================================================

describe('State Management - Status Updates', () => {
  it('should mark state as completed', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const completedState = completeOptimizationState(state);

    expect(completedState.status).toBe('completed');
  });

  it('should preserve all other fields when marking as completed', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    let state = initializeOptimizationState(jobPosting, initialResume, config);

    // Add some history
    const newResume = createMockTaggedResume('resume-2', [createMockTaggedElement('Python', 0.8)]);
    const iteration = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');
    state = updateOptimizationState(state, newResume, iteration);

    const completedState = completeOptimizationState(state);

    expect(completedState.jobPosting).toEqual(state.jobPosting);
    expect(completedState.currentResume).toEqual(state.currentResume);
    expect(completedState.history).toEqual(state.history);
    expect(completedState.config).toEqual(state.config);
  });

  it('should mark state as failed', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const failedState = failOptimizationState(state);

    expect(failedState.status).toBe('failed');
  });

  it('should preserve all other fields when marking as failed', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    let state = initializeOptimizationState(jobPosting, initialResume, config);

    // Add some history
    const newResume = createMockTaggedResume('resume-2', [createMockTaggedElement('Python', 0.8)]);
    const iteration = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');
    state = updateOptimizationState(state, newResume, iteration);

    const failedState = failOptimizationState(state);

    expect(failedState.jobPosting).toEqual(state.jobPosting);
    expect(failedState.currentResume).toEqual(state.currentResume);
    expect(failedState.history).toEqual(state.history);
    expect(failedState.config).toEqual(state.config);
  });

  it('should not mutate original state when marking as completed', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const completedState = completeOptimizationState(state);

    expect(state.status).toBe('running');
    expect(completedState.status).toBe('completed');
  });

  it('should not mutate original state when marking as failed', () => {
    const jobElements = [createMockTaggedElement('Python', 0.9)];
    const jobPosting = createMockWeightedJob('job-1', jobElements);
    const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
    const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
    const config = createMockConfig();
    const state = initializeOptimizationState(jobPosting, initialResume, config);

    const failedState = failOptimizationState(state);

    expect(state.status).toBe('running');
    expect(failedState.status).toBe('failed');
  });
});


// ============================================================================
// Tests for Helper Functions
// ============================================================================

describe('State Management - Helper Functions', () => {
  describe('getCurrentIteration', () => {
    it('should return 1 for initial state with no history', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      const state = initializeOptimizationState(jobPosting, initialResume, config);

      const iteration = getCurrentIteration(state);

      expect(iteration).toBe(1);
    });

    it('should return correct iteration number after updates', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      // Add 3 iterations
      for (let i = 1; i <= 3; i++) {
        const newResume = createMockTaggedResume(`resume-${i + 1}`, [createMockTaggedElement('Python', 0.8)]);
        const iteration = createIterationHistoryEntry(i, 0.5 + i * 0.1, createMockRecommendations(i, 0.5 + i * 0.1), `resume-${i + 1}`);
        state = updateOptimizationState(state, newResume, iteration);
      }

      const iteration = getCurrentIteration(state);

      expect(iteration).toBe(4); // Next iteration would be 4
    });

    it('should handle large iteration counts', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      // Add 20 iterations
      for (let i = 1; i <= 20; i++) {
        const newResume = createMockTaggedResume(`resume-${i + 1}`, [createMockTaggedElement('Python', 0.8)]);
        const iteration = createIterationHistoryEntry(i, 0.5, createMockRecommendations(i, 0.5), `resume-${i + 1}`);
        state = updateOptimizationState(state, newResume, iteration);
      }

      const iteration = getCurrentIteration(state);

      expect(iteration).toBe(21);
    });
  });

  describe('getLatestScore', () => {
    it('should return 0 for initial state with no history', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      const state = initializeOptimizationState(jobPosting, initialResume, config);

      const score = getLatestScore(state);

      expect(score).toBe(0);
    });

    it('should return latest score after single update', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      const newResume = createMockTaggedResume('resume-2', [createMockTaggedElement('Python', 0.8)]);
      const iteration = createIterationHistoryEntry(1, 0.65, createMockRecommendations(1, 0.65), 'resume-2');
      state = updateOptimizationState(state, newResume, iteration);

      const score = getLatestScore(state);

      expect(score).toBe(0.65);
    });

    it('should return latest score after multiple updates', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      const scores = [0.5, 0.6, 0.7, 0.75, 0.82];
      for (let i = 0; i < scores.length; i++) {
        const newResume = createMockTaggedResume(`resume-${i + 2}`, [createMockTaggedElement('Python', 0.8)]);
        const iteration = createIterationHistoryEntry(i + 1, scores[i], createMockRecommendations(i + 1, scores[i]), `resume-${i + 2}`);
        state = updateOptimizationState(state, newResume, iteration);
      }

      const score = getLatestScore(state);

      expect(score).toBe(0.82);
    });
  });

  describe('getScoreHistory', () => {
    it('should return empty array for initial state', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      const state = initializeOptimizationState(jobPosting, initialResume, config);

      const scores = getScoreHistory(state);

      expect(scores).toEqual([]);
    });

    it('should return all scores in chronological order', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      const expectedScores = [0.5, 0.6, 0.7, 0.75, 0.8];
      for (let i = 0; i < expectedScores.length; i++) {
        const newResume = createMockTaggedResume(`resume-${i + 2}`, [createMockTaggedElement('Python', 0.8)]);
        const iteration = createIterationHistoryEntry(i + 1, expectedScores[i], createMockRecommendations(i + 1, expectedScores[i]), `resume-${i + 2}`);
        state = updateOptimizationState(state, newResume, iteration);
      }

      const scores = getScoreHistory(state);

      expect(scores).toEqual(expectedScores);
    });

    it('should handle score regression', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      const expectedScores = [0.7, 0.65, 0.6, 0.55];
      for (let i = 0; i < expectedScores.length; i++) {
        const newResume = createMockTaggedResume(`resume-${i + 2}`, [createMockTaggedElement('Python', 0.8)]);
        const iteration = createIterationHistoryEntry(i + 1, expectedScores[i], createMockRecommendations(i + 1, expectedScores[i]), `resume-${i + 2}`);
        state = updateOptimizationState(state, newResume, iteration);
      }

      const scores = getScoreHistory(state);

      expect(scores).toEqual(expectedScores);
    });
  });

  describe('isOptimizationRunning', () => {
    it('should return true for initial state', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      const state = initializeOptimizationState(jobPosting, initialResume, config);

      const isRunning = isOptimizationRunning(state);

      expect(isRunning).toBe(true);
    });

    it('should return true after updates', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      let state = initializeOptimizationState(jobPosting, initialResume, config);

      const newResume = createMockTaggedResume('resume-2', [createMockTaggedElement('Python', 0.8)]);
      const iteration = createIterationHistoryEntry(1, 0.6, createMockRecommendations(1, 0.6), 'resume-2');
      state = updateOptimizationState(state, newResume, iteration);

      const isRunning = isOptimizationRunning(state);

      expect(isRunning).toBe(true);
    });

    it('should return false when marked as completed', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      const state = initializeOptimizationState(jobPosting, initialResume, config);

      const completedState = completeOptimizationState(state);
      const isRunning = isOptimizationRunning(completedState);

      expect(isRunning).toBe(false);
    });

    it('should return false when marked as failed', () => {
      const jobElements = [createMockTaggedElement('Python', 0.9)];
      const jobPosting = createMockWeightedJob('job-1', jobElements);
      const initialResumeElements = [createMockTaggedElement('JavaScript', 0.7)];
      const initialResume = createMockTaggedResume('resume-1', initialResumeElements);
      const config = createMockConfig();
      const state = initializeOptimizationState(jobPosting, initialResume, config);

      const failedState = failOptimizationState(state);
      const isRunning = isOptimizationRunning(failedState);

      expect(isRunning).toBe(false);
    });
  });

  describe('createIterationHistoryEntry', () => {
    it('should create entry with all required fields', () => {
      const recommendations = createMockRecommendations(1, 0.6);
      const entry = createIterationHistoryEntry(1, 0.6, recommendations, 'resume-2');

      expect(entry).toHaveProperty('round');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('recommendations');
      expect(entry).toHaveProperty('resumeVersion');
    });

    it('should set round correctly', () => {
      const recommendations = createMockRecommendations(5, 0.75);
      const entry = createIterationHistoryEntry(5, 0.75, recommendations, 'resume-6');

      expect(entry.round).toBe(5);
    });

    it('should set score correctly', () => {
      const recommendations = createMockRecommendations(1, 0.82);
      const entry = createIterationHistoryEntry(1, 0.82, recommendations, 'resume-2');

      expect(entry.score).toBe(0.82);
    });

    it('should set recommendations correctly', () => {
      const recommendations = createMockRecommendations(1, 0.6);
      const entry = createIterationHistoryEntry(1, 0.6, recommendations, 'resume-2');

      expect(entry.recommendations).toEqual(recommendations);
    });

    it('should set resumeVersion correctly', () => {
      const recommendations = createMockRecommendations(1, 0.6);
      const entry = createIterationHistoryEntry(1, 0.6, recommendations, 'resume-v2-final');

      expect(entry.resumeVersion).toBe('resume-v2-final');
    });

    it('should handle score of 0.0', () => {
      const recommendations = createMockRecommendations(1, 0.0);
      const entry = createIterationHistoryEntry(1, 0.0, recommendations, 'resume-2');

      expect(entry.score).toBe(0.0);
    });

    it('should handle score of 1.0', () => {
      const recommendations = createMockRecommendations(1, 1.0);
      const entry = createIterationHistoryEntry(1, 1.0, recommendations, 'resume-2');

      expect(entry.score).toBe(1.0);
    });
  });
});
