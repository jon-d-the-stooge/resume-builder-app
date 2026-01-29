/**
 * Holistic Optimization Orchestrator
 *
 * Simple orchestration that:
 * 1. Runs holistic analysis (single LLM call)
 * 2. Rewrites resume based on recommendations
 * 3. Verifies improvement with a second analysis
 * 4. Optionally iterates if improvement is insufficient
 */

import { LLMClient } from '../../shared/llm/client';
import type { JobPosting, Resume } from '../types';
import { analyzeHolistically, HolisticAnalysisResult } from './holisticAnalyzer';
import { rewriteResume, RewriteResult } from './resumeWriter';

export interface OptimizationConfig {
  targetFit: number;       // Target fit score (default 0.8)
  maxIterations: number;   // Maximum rewrite iterations (default 3)
  minImprovement: number;  // Minimum improvement to continue (default 0.05)
}

/**
 * Callback for progress updates during optimization
 */
export type ProgressCallback = (phase: string, message: string) => void;

export interface OptimizationIteration {
  round: number;
  fitScore: number;
  analysis: HolisticAnalysisResult;
  rewrite?: RewriteResult;
}

export interface HolisticOptimizationResult {
  finalResume: Resume;
  initialFit: number;
  finalFit: number;
  improvement: number;
  iterations: OptimizationIteration[];
  terminationReason: 'target_reached' | 'max_iterations' | 'no_improvement';
  noChangesReason?: 'GREAT_FIT' | 'POOR_FIT';
}

const DEFAULT_CONFIG: OptimizationConfig = {
  targetFit: 0.8,
  maxIterations: 3,
  minImprovement: 0.05
};

/**
 * Run the complete holistic optimization loop
 */
export async function optimizeResume(
  jobPosting: JobPosting,
  resume: Resume,
  llmClient: LLMClient,
  config: Partial<OptimizationConfig> = {},
  onProgress?: ProgressCallback
): Promise<HolisticOptimizationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const iterations: OptimizationIteration[] = [];

  let currentResume = resume;
  let previousFit = 0;

  console.log('\n=== HOLISTIC OPTIMIZATION START ===');

  // Build company display string
  const companyName = jobPosting.metadata?.company || 'the company';

  for (let round = 1; round <= cfg.maxIterations; round++) {
    console.log(`\n--- Round ${round} ---`);

    // Progress: Starting analysis
    onProgress?.('analyzing', `Analyzing ${jobPosting.title} role at ${companyName}...`);

    // Step 1: Analyze current resume
    console.log('[ANALYZE] Running holistic analysis...');
    const analysis = await analyzeHolistically(jobPosting, currentResume, llmClient);

    console.log(`[ANALYZE] Fit: ${(analysis.overallFit * 100).toFixed(1)}%`);
    console.log(`[ANALYZE] Connections: ${analysis.connections.length} identified`);
    console.log(`[ANALYZE] Strengths: ${analysis.strengths.length}, Gaps: ${analysis.gaps.length}`);
    console.log(`[ANALYZE] Recommendations: ${analysis.recommendations.length}`);

    // Progress: Identifying strengths
    const topStrengths = analysis.strengths.slice(0, 3);
    if (topStrengths.length > 0) {
      onProgress?.('identifying', `Identifying relevant experience: ${topStrengths.join(', ')}...`);
    }

    const iteration: OptimizationIteration = {
      round,
      fitScore: analysis.overallFit,
      analysis
    };

    // Check for "great fit" - already excellent, no changes needed
    if (round === 1 && analysis.overallFit >= 0.85 && analysis.recommendations.length <= 1) {
      console.log('[DONE] Already a great fit, no changes needed');
      onProgress?.('complete', "No notes! You're already a solid fit for this role—we believe making changes could actually hurt your chances. Nicely done!");
      iterations.push(iteration);
      return {
        ...buildResult(resume, currentResume, iterations, 'target_reached'),
        noChangesReason: 'GREAT_FIT'
      };
    }

    // Check for improvement stagnation (after first round)
    if (round > 1) {
      const improvement = analysis.overallFit - previousFit;
      console.log(`[PROGRESS] Improvement: +${(improvement * 100).toFixed(1)}%`);

      if (improvement < cfg.minImprovement) {
        console.log(`[DONE] Improvement below threshold (${cfg.minImprovement})`);
        iterations.push(iteration);
        return buildResult(resume, currentResume, iterations, 'no_improvement');
      }
    }

    // Step 2: Rewrite resume when we have recommendations (including final iteration)
    if (analysis.recommendations.length > 0) {
      // Progress: Starting rewrite
      const sectionsToModify = analysis.recommendations
        .map(r => r.jobRequirementAddressed)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 2);
      if (sectionsToModify.length > 0) {
        onProgress?.('rewriting', `Optimizing content for ${sectionsToModify.join(' and ')}...`);
      } else {
        onProgress?.('rewriting', 'Applying recommendations to your resume...');
      }

      console.log('[REWRITE] Applying recommendations...');
      const rewrite = await rewriteResume(currentResume, analysis, llmClient);

      console.log(`[REWRITE] Changes applied: ${rewrite.changesApplied.length}`);
      console.log(`[REWRITE] Sections modified: ${rewrite.sectionsModified.join(', ')}`);

      // Progress: Refining
      if (rewrite.sectionsModified.length > 0) {
        onProgress?.('refining', `Refined ${rewrite.sectionsModified[0]}...`);
      }

      iteration.rewrite = rewrite;
      currentResume = rewrite.rewrittenResume;
    }

    iterations.push(iteration);
    previousFit = analysis.overallFit;
  }

  console.log(`[DONE] Max iterations (${cfg.maxIterations}) reached`);
  onProgress?.('complete', 'Optimization complete!');
  return buildResult(resume, currentResume, iterations, 'max_iterations');
}

function buildResult(
  originalResume: Resume,
  finalResume: Resume,
  iterations: OptimizationIteration[],
  terminationReason: 'target_reached' | 'max_iterations' | 'no_improvement'
): HolisticOptimizationResult {
  const initialFit = iterations[0]?.fitScore || 0;
  const finalFit = iterations[iterations.length - 1]?.fitScore || 0;

  return {
    finalResume,
    initialFit,
    finalFit,
    improvement: finalFit - initialFit,
    iterations,
    terminationReason
  };
}

/**
 * Run single-shot analysis without rewriting (for evaluation only)
 */
export async function analyzeOnly(
  jobPosting: JobPosting,
  resume: Resume,
  llmClient: LLMClient
): Promise<HolisticAnalysisResult> {
  return analyzeHolistically(jobPosting, resume, llmClient);
}
