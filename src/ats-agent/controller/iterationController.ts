/**
 * Iteration Controller
 * 
 * Manages the optimization loop and evaluates termination criteria.
 * Implements Requirements 7.2, 7.3, 7.4, 7.1, 7.5 from the design document.
 */

import type {
  OptimizationConfig,
  IterationDecision,
  IterationHistory,
  TerminationReason,
  Resume,
  ParsedJob,
  ParsedResume,
  Element,
  SemanticMatch,
  MatchResult,
  Recommendations,
  OptimizationResult,
  OptimizationState,
  OptimizationStatus,
  WeightedJob,
  TaggedResume,
  JobPosting
} from '../types';

/**
 * Evaluates whether the optimization loop should terminate based on:
 * 1. Target score threshold reached (Requirement 7.3)
 * 2. Early stopping due to no improvement (Requirement 7.2)
 * 3. Maximum iterations reached
 * 
 * @param currentScore - The match score from the current iteration
 * @param history - Array of previous iteration results
 * @param config - Optimization configuration with thresholds
 * @returns IterationDecision with shouldContinue flag and reason
 */
export function evaluateTerminationCriteria(
  currentScore: number,
  history: IterationHistory[],
  config: OptimizationConfig
): IterationDecision {
  const currentIteration = history.length;

  // Check 1: Target threshold reached (Requirement 7.3, 7.4)
  if (currentScore >= config.targetScore) {
    return {
      shouldContinue: false,
      reason: `Target score of ${config.targetScore} reached with score ${currentScore.toFixed(3)}`
    };
  }

  // Check 2: Max iterations reached
  if (currentIteration >= config.maxIterations) {
    return {
      shouldContinue: false,
      reason: `Maximum iterations (${config.maxIterations}) reached`
    };
  }

  // Check 3: Early stopping - N rounds with no improvement (Requirement 7.2)
  if (shouldEarlyStop(history, config)) {
    return {
      shouldContinue: false,
      reason: `Early stopping: no improvement for ${config.earlyStoppingRounds} consecutive rounds`
    };
  }

  // Continue optimization
  return {
    shouldContinue: true,
    reason: `Continuing optimization (iteration ${currentIteration + 1}/${config.maxIterations}, score: ${currentScore.toFixed(3)})`
  };
}

/**
 * Determines if early stopping criteria are met.
 * Early stopping occurs when N consecutive rounds show no significant improvement.
 * 
 * @param history - Array of previous iteration results
 * @param config - Configuration with earlyStoppingRounds and minImprovement thresholds
 * @returns true if early stopping criteria are met
 */
function shouldEarlyStop(
  history: IterationHistory[],
  config: OptimizationConfig
): boolean {
  // Need at least earlyStoppingRounds + 1 iterations to check for stagnation
  if (history.length < config.earlyStoppingRounds + 1) {
    return false;
  }

  // Check the last N rounds for improvement
  const recentHistory = history.slice(-config.earlyStoppingRounds - 1);
  
  // Compare each consecutive pair of scores
  for (let i = 1; i < recentHistory.length; i++) {
    const improvement = recentHistory[i].score - recentHistory[i - 1].score;
    
    // If any round showed significant improvement, don't stop
    if (improvement >= config.minImprovement) {
      return false;
    }
  }

  // All recent rounds showed no significant improvement
  return true;
}

/**
 * Determines the termination reason based on the final state.
 * 
 * @param finalScore - The final match score
 * @param iterationCount - Total number of iterations completed
 * @param config - Optimization configuration
 * @returns TerminationReason enum value
 */
export function determineTerminationReason(
  finalScore: number,
  iterationCount: number,
  config: OptimizationConfig
): TerminationReason {
  // Check target reached first (highest priority)
  if (finalScore >= config.targetScore) {
    return 'target_reached';
  }

  // Check max iterations
  if (iterationCount >= config.maxIterations) {
    return 'max_iterations';
  }

  // Otherwise, must be early stopping
  return 'early_stopping';
}

/**
 * Process a single iteration of the optimization loop.
 * 
 * This function orchestrates the complete iteration processing:
 * 1. Parse the new resume draft
 * 2. Perform semantic analysis to find matches
 * 3. Calculate match score
 * 4. Evaluate termination criteria
 * 5. Generate recommendations if continuing
 * 
 * Requirements: 7.1, 7.5
 * 
 * @param resumeDraft - The new resume draft to process
 * @param parsedJob - The parsed job posting (with importance scores)
 * @param history - Array of previous iteration results
 * @param config - Optimization configuration
 * @param components - Required components (parser, analyzer, scorer, recommender)
 * @returns IterationDecision with shouldContinue flag, reason, and optional recommendations
 */
export async function processIteration(
  resumeDraft: Resume,
  parsedJob: ParsedJob,
  history: IterationHistory[],
  config: OptimizationConfig,
  components: {
    parseResume: (resume: Resume) => Promise<ParsedResume>;
    findSemanticMatches: (resumeElements: Element[], jobElements: Element[]) => Promise<SemanticMatch[]>;
    calculateMatchScore: (parsedResume: ParsedResume, parsedJob: ParsedJob, matches: SemanticMatch[]) => MatchResult;
    generateRecommendations: (matchResult: MatchResult, matches: SemanticMatch[], iterationRound: number, targetScore: number) => Recommendations;
  }
): Promise<IterationDecision> {
  try {
    // Step 1: Parse the new resume draft
    const parsedResume = await components.parseResume(resumeDraft);

    // Step 2: Perform semantic analysis to find matches between resume and job elements
    const matches = await components.findSemanticMatches(
      parsedResume.elements,
      parsedJob.elements
    );

    // Step 3: Calculate match score
    const matchResult = components.calculateMatchScore(
      parsedResume,
      parsedJob,
      matches
    );

    const currentScore = matchResult.overallScore;
    const currentIteration = history.length + 1;

    // Step 4: Evaluate termination criteria
    const terminationDecision = evaluateTerminationCriteria(
      currentScore,
      history,
      config
    );

    // If we should terminate, return without recommendations
    if (!terminationDecision.shouldContinue) {
      return terminationDecision;
    }

    // Step 5: Generate recommendations for the next iteration
    const recommendations = components.generateRecommendations(
      matchResult,
      matches,
      currentIteration,
      config.targetScore
    );

    // Return decision to continue with recommendations
    return {
      shouldContinue: true,
      reason: terminationDecision.reason,
      recommendations
    };

  } catch (error) {
    // Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to process iteration: ${errorMessage}`);
  }
}

/**
 * Create the final optimization result structure.
 * 
 * This function builds a comprehensive result object that includes:
 * - Final resume and score
 * - Complete iteration history
 * - Termination reason
 * - Calculated metrics for transparency
 * 
 * Requirements: 7.5, 10.3
 * 
 * @param finalResume - The final optimized resume
 * @param history - Complete array of iteration results
 * @param config - Optimization configuration used
 * @returns OptimizationResult with all metrics and history
 */
export function createOptimizationResult(
  finalResume: Resume,
  history: IterationHistory[],
  config: OptimizationConfig
): OptimizationResult {
  // Validate that we have at least one iteration
  if (history.length === 0) {
    throw new Error('Cannot create optimization result: no iterations in history');
  }

  // Extract scores from history
  const initialScore = history[0].score;
  const finalScore = history[history.length - 1].score;
  const iterationCount = history.length;

  // Calculate improvement (can be negative if score decreased)
  const improvement = finalScore - initialScore;

  // Determine termination reason based on final state
  const terminationReason = determineTerminationReason(
    finalScore,
    iterationCount,
    config
  );

  // Build the complete result structure
  const result: OptimizationResult = {
    finalResume,
    finalScore,
    iterations: history,
    terminationReason,
    metrics: {
      initialScore,
      finalScore,
      improvement,
      iterationCount
    }
  };

  return result;
}

// ============================================================================
// State Management Functions
// ============================================================================

/**
 * Initialize optimization state for a new optimization loop.
 * 
 * Creates the initial state structure with:
 * - Job posting (parsed with importance scores)
 * - Initial resume (parsed with semantic tags)
 * - Empty iteration history
 * - Configuration settings
 * - Status set to 'running'
 * 
 * Requirement 7.1: Track iteration history and maintain current state
 * 
 * @param jobPosting - The parsed job posting with weighted elements
 * @param initialResume - The parsed initial resume with tagged elements
 * @param config - Optimization configuration
 * @returns OptimizationState initialized for the first iteration
 */
export function initializeOptimizationState(
  jobPosting: WeightedJob,
  initialResume: TaggedResume,
  config: OptimizationConfig
): OptimizationState {
  return {
    jobPosting,
    currentResume: initialResume,
    history: [],
    config,
    status: 'running'
  };
}

/**
 * Update optimization state after processing an iteration.
 * 
 * Updates the state with:
 * - New current resume (from the latest iteration)
 * - Appends iteration result to history
 * - Maintains job posting and config unchanged
 * - Status remains 'running' (caller should update to 'completed' or 'failed' when done)
 * 
 * Requirement 7.1: Track iteration history (scores, recommendations, resume versions)
 * 
 * @param state - Current optimization state
 * @param newResume - The new resume from this iteration
 * @param iterationResult - The complete iteration result to add to history
 * @returns Updated OptimizationState with new resume and history entry
 */
export function updateOptimizationState(
  state: OptimizationState,
  newResume: TaggedResume,
  iterationResult: IterationHistory
): OptimizationState {
  return {
    ...state,
    currentResume: newResume,
    history: [...state.history, iterationResult]
  };
}

/**
 * Mark optimization state as completed.
 * 
 * Updates the status to 'completed' when the optimization loop terminates successfully.
 * 
 * @param state - Current optimization state
 * @returns Updated OptimizationState with status set to 'completed'
 */
export function completeOptimizationState(
  state: OptimizationState
): OptimizationState {
  return {
    ...state,
    status: 'completed'
  };
}

/**
 * Mark optimization state as failed.
 * 
 * Updates the status to 'failed' when an error occurs during optimization.
 * 
 * @param state - Current optimization state
 * @returns Updated OptimizationState with status set to 'failed'
 */
export function failOptimizationState(
  state: OptimizationState
): OptimizationState {
  return {
    ...state,
    status: 'failed'
  };
}

/**
 * Get the current iteration number from the state.
 * 
 * @param state - Current optimization state
 * @returns The current iteration number (1-based)
 */
export function getCurrentIteration(state: OptimizationState): number {
  return state.history.length + 1;
}

/**
 * Get the latest score from the iteration history.
 * 
 * @param state - Current optimization state
 * @returns The most recent score, or 0 if no iterations yet
 */
export function getLatestScore(state: OptimizationState): number {
  if (state.history.length === 0) {
    return 0;
  }
  return state.history[state.history.length - 1].score;
}

/**
 * Get all scores from the iteration history.
 * 
 * @param state - Current optimization state
 * @returns Array of all scores in chronological order
 */
export function getScoreHistory(state: OptimizationState): number[] {
  return state.history.map(iteration => iteration.score);
}

/**
 * Check if the optimization is still running.
 * 
 * @param state - Current optimization state
 * @returns true if status is 'running', false otherwise
 */
export function isOptimizationRunning(state: OptimizationState): boolean {
  return state.status === 'running';
}

/**
 * Create an iteration history entry.
 * 
 * Helper function to create a properly structured IterationHistory object
 * for adding to the state's history array.
 * 
 * @param round - The iteration round number (1-based)
 * @param score - The match score for this iteration
 * @param recommendations - The recommendations generated for this iteration
 * @param resumeVersion - Identifier for the resume version (e.g., resume ID or hash)
 * @returns IterationHistory object ready to be added to state
 */
export function createIterationHistoryEntry(
  round: number,
  score: number,
  recommendations: Recommendations,
  resumeVersion: string
): IterationHistory {
  return {
    round,
    score,
    recommendations,
    resumeVersion
  };
}

/**
 * Start the optimization loop.
 * 
 * This is the main entry point for the optimization process. It:
 * 1. Parses the initial job posting and resume
 * 2. Runs the optimization loop, iterating until termination criteria are met
 * 3. Calls the onRecommendations callback to get updated resumes
 * 4. Returns the final optimization result
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 * 
 * @param jobPosting - The job posting to optimize against
 * @param initialResume - The initial resume to optimize
 * @param config - Optimization configuration
 * @param llmClient - LLM client for parsing and semantic analysis
 * @param onRecommendations - Callback function to get updated resume from recommendations
 * @returns OptimizationResult with final resume, score, history, and metrics
 */
export async function startOptimization(
  jobPosting: JobPosting,
  initialResume: Resume,
  config: OptimizationConfig,
  llmClient: any, // LLMClient type
  onRecommendations?: (recommendations: Recommendations, iteration: number) => Promise<Resume>
): Promise<OptimizationResult> {
  // Import required components
  const { parseJobDescription } = await import('../parser/jobParser');
  const { parseResume } = await import('../parser/resumeParser');
  const { createSemanticAnalyzer } = await import('../parser/semanticAnalyzer');
  const { extractJobThemes } = await import('../parser/themeExtractor');
  const { calculateMatchScore, assignImportanceScores } = await import('../parser/scorer');
  const { generateRecommendations } = await import('../parser/recommendationGenerator');

  // Create semantic analyzer instance
  const semanticAnalyzer = createSemanticAnalyzer(llmClient);

  // Step 1: Parse the job posting
  const parsedJob = await parseJobDescription(jobPosting, llmClient);
  
  // Assign importance scores to job elements
  const jobWithImportance = assignImportanceScores(parsedJob);

  const jobThemes = await extractJobThemes(jobPosting, jobWithImportance, llmClient);

  // Step 2: Parse the initial resume
  let currentResume = initialResume;
  let parsedResume = await parseResume(currentResume, llmClient);

  // Initialize iteration history
  const history: IterationHistory[] = [];

  // Step 3: Calculate initial match score - batched semantic matching
  const allMatches = await semanticAnalyzer.findSemanticMatchesBatch(
    parsedResume.elements,
    jobWithImportance.elements
  );
  
  if (process.env.LLM_DEBUG === '1') {
    console.log(
      `[MATCH] resumeElements=${parsedResume.elements.length} ` +
      `jobElements=${jobWithImportance.elements.length} matches=${allMatches.length}`
    );
    console.log(
      `[MATCH] sample=${allMatches.slice(0, 5).map(match => `${match.jobElement.text}<=${match.resumeElement.text}(${match.matchType}:${match.confidence.toFixed(2)})`).join(' | ')}`
    );
  }

  let matchResult = calculateMatchScore(parsedResume, jobWithImportance, allMatches);
  let currentScore = matchResult.overallScore;

  // Add initial iteration to history
  const initialRecommendations = generateRecommendations(
    matchResult,
    allMatches,
    1,
    config.targetScore,
    jobThemes,
    parsedResume
  );
  
  history.push({
    round: 1,
    score: currentScore,
    recommendations: initialRecommendations,
    resumeVersion: currentResume.id
  });

  // Step 4: Run optimization loop
  let iteration = 1;
  let shouldContinue = true;

  while (shouldContinue && iteration < config.maxIterations) {
    // Evaluate termination criteria
    const decision = evaluateTerminationCriteria(currentScore, history, config);
    
    if (!decision.shouldContinue) {
      shouldContinue = false;
      break;
    }

    // If no callback provided, we can't continue (single-shot analysis)
    if (!onRecommendations) {
      break;
    }

    // Get updated resume from callback
    const recommendations = history[history.length - 1].recommendations;
    currentResume = await onRecommendations(recommendations, iteration);
    
    // Parse the updated resume
    parsedResume = await parseResume(currentResume, llmClient);

    // Calculate new match score - batched semantic matching
    const newMatches = await semanticAnalyzer.findSemanticMatchesBatch(
      parsedResume.elements,
      jobWithImportance.elements
    );
    
    matchResult = calculateMatchScore(parsedResume, jobWithImportance, newMatches);
    currentScore = matchResult.overallScore;

    // Generate recommendations for next iteration
    iteration++;
    const newRecommendations = generateRecommendations(
      matchResult,
      newMatches,
      iteration,
      config.targetScore,
      jobThemes,
      parsedResume
    );

    // Add to history
    history.push({
      round: iteration,
      score: currentScore,
      recommendations: newRecommendations,
      resumeVersion: currentResume.id
    });
  }

  // Step 5: Create final result
  const result = createOptimizationResult(currentResume, history, config);

  return result;
}
