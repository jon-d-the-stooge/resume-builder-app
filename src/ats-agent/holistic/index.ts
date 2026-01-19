/**
 * Holistic Resume Optimization Module
 *
 * A simpler, more effective approach to resume-job matching that:
 * - Reads documents holistically rather than fragmenting into elements
 * - Makes semantic connections that element-based matching misses
 * - Focuses on reframing existing content rather than removing it
 */

export { analyzeHolistically } from './holisticAnalyzer';
export type {
  HolisticAnalysisResult,
  SemanticConnection,
  ReframingRecommendation
} from './holisticAnalyzer';

export { rewriteResume } from './resumeWriter';
export type { RewriteResult } from './resumeWriter';

export { optimizeResume, analyzeOnly } from './orchestrator';
export type {
  OptimizationConfig,
  OptimizationIteration,
  HolisticOptimizationResult
} from './orchestrator';
