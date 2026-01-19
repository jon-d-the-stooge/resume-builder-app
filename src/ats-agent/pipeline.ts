/**
 * Resume Pipeline Orchestrator
 *
 * Orchestrates the two-stage resume optimization pipeline:
 *
 * Stage 1 (SELECTOR): Pick relevant content from vault for the job
 *   - Parses job requirements
 *   - Searches vault for matching content
 *   - Ranks and selects best experiences
 *   - Assembles into draft resume
 *
 * Stage 2 (COMMITTEE): Optimize the selected content
 *   - Advocate finds additional connections
 *   - Critic validates claims
 *   - Writer reframes to match job language
 *
 * ```
 * Content Vault → [Selector] → Draft Resume → [Committee] → Optimized Resume
 * ```
 *
 * Usage:
 * ```typescript
 * import { buildOptimizedResume } from './pipeline';
 *
 * const result = await buildOptimizedResume(
 *   jobPosting,
 *   vaultItems,
 *   llmClient,
 *   { selector: { maxJobs: 4 }, committee: { fastMode: true } }
 * );
 *
 * console.log(`Final resume: ${result.finalResume.content}`);
 * console.log(`Requirements coverage: ${result.metrics.requirementsCoverage}`);
 * ```
 */

import { LLMClient } from '../shared/llm/client';
import type { ContentItem } from '../types';
import type { JobPosting, Resume } from './types';
import {
  runSelector,
  SelectionResult,
  PipelineConfig,
  PipelineConfigInput,
  PipelineResult,
  DEFAULT_PIPELINE_CONFIG
} from './selector';
import {
  runCommittee,
  CommitteeResult,
  FAST_MODEL_CONFIG
} from './committee';

// ============================================================================
// Pipeline Orchestrator
// ============================================================================

/**
 * Run the full two-stage pipeline to build an optimized resume
 *
 * @param jobPosting - The job posting to optimize for
 * @param vaultItems - All content items from the vault
 * @param llmClient - LLM client for API calls
 * @param config - Pipeline configuration options
 * @returns Pipeline result with final resume and metrics
 */
export async function buildOptimizedResume(
  jobPosting: JobPosting,
  vaultItems: ContentItem[],
  llmClient: LLMClient,
  config: PipelineConfigInput = {}
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Merge configuration with defaults
  const cfg: PipelineConfig = {
    ...DEFAULT_PIPELINE_CONFIG,
    ...config,
    selector: {
      ...DEFAULT_PIPELINE_CONFIG.selector,
      ...config.selector
    },
    committee: {
      ...DEFAULT_PIPELINE_CONFIG.committee,
      ...config.committee
    }
  };

  console.log('\n' + '='.repeat(60));
  console.log('RESUME OPTIMIZATION PIPELINE');
  console.log('='.repeat(60));
  console.log(`Job: ${jobPosting.title}`);
  console.log(`Vault items: ${vaultItems.length}`);
  console.log(`Skip committee: ${cfg.skipCommittee ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));

  // ──────────────────────────────────────────────────────────────
  // STAGE 1: SELECTOR
  // ──────────────────────────────────────────────────────────────
  console.log('\n▶ STAGE 1: SELECTOR');
  console.log('─'.repeat(50));

  const selectionResult = await runSelector(
    jobPosting,
    vaultItems,
    llmClient,
    cfg.selector
  );

  console.log('\n[SELECTOR COMPLETE]');
  console.log(`  Items selected: ${selectionResult.selectedItems.length}`);
  console.log(`  Coverage: ${(selectionResult.coverageScore * 100).toFixed(1)}%`);
  console.log(`  Unmatched requirements: ${selectionResult.unmatchedRequirements.length}`);

  // Calculate initial fit estimate based on coverage and relevance
  const initialFitEstimate = calculateInitialFitEstimate(selectionResult);
  console.log(`  Initial fit estimate: ${(initialFitEstimate * 100).toFixed(1)}%`);

  // If skipping committee, return selection result directly
  if (cfg.skipCommittee) {
    const processingTimeMs = Date.now() - startTime;

    console.log('\n' + '='.repeat(60));
    console.log('PIPELINE COMPLETE (Committee skipped)');
    console.log('='.repeat(60));
    console.log(`Processing time: ${processingTimeMs}ms`);

    return {
      finalResume: selectionResult.draftResume,
      selectionResult,
      committeeResult: undefined,
      metrics: {
        vaultItemsConsidered: vaultItems.length,
        itemsSelected: selectionResult.selectedItems.length,
        requirementsCoverage: selectionResult.coverageScore,
        initialFitEstimate,
        finalFit: initialFitEstimate,
        processingTimeMs
      }
    };
  }

  // ──────────────────────────────────────────────────────────────
  // STAGE 2: COMMITTEE
  // ──────────────────────────────────────────────────────────────
  console.log('\n▶ STAGE 2: COMMITTEE');
  console.log('─'.repeat(50));

  const committeeResult = await runCommittee(
    jobPosting,
    selectionResult.draftResume,
    llmClient,
    {
      maxRounds: cfg.committee.maxRounds,
      consensusThreshold: cfg.committee.consensusThreshold,
      targetFit: cfg.committee.targetFit,
      fastMode: cfg.committee.fastMode,
      models: cfg.committee.models || FAST_MODEL_CONFIG,
      earlyStopOnConsensus: true
    }
  );

  console.log('\n[COMMITTEE COMPLETE]');
  console.log(`  Rounds: ${committeeResult.rounds.length}`);
  console.log(`  Initial fit: ${(committeeResult.initialFit * 100).toFixed(1)}%`);
  console.log(`  Final fit: ${(committeeResult.finalFit * 100).toFixed(1)}%`);
  console.log(`  Improvement: +${(committeeResult.improvement * 100).toFixed(1)}%`);
  console.log(`  Termination: ${committeeResult.terminationReason}`);

  // ──────────────────────────────────────────────────────────────
  // BUILD RESULT
  // ──────────────────────────────────────────────────────────────
  const processingTimeMs = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total processing time: ${processingTimeMs}ms`);
  console.log(`Final fit: ${(committeeResult.finalFit * 100).toFixed(1)}%`);

  return {
    finalResume: committeeResult.finalResume,
    selectionResult,
    committeeResult: {
      initialFit: committeeResult.initialFit,
      finalFit: committeeResult.finalFit,
      improvement: committeeResult.improvement,
      rounds: committeeResult.rounds.length,
      terminationReason: committeeResult.terminationReason
    },
    metrics: {
      vaultItemsConsidered: vaultItems.length,
      itemsSelected: selectionResult.selectedItems.length,
      requirementsCoverage: selectionResult.coverageScore,
      initialFitEstimate,
      finalFit: committeeResult.finalFit,
      processingTimeMs
    }
  };
}

/**
 * Run only the selector stage (useful for testing or preview)
 *
 * @param jobPosting - The job posting to select for
 * @param vaultItems - All content items from the vault
 * @param llmClient - LLM client for API calls
 * @param config - Selector configuration options
 * @returns Selection result with draft resume
 */
export async function selectContentForJob(
  jobPosting: JobPosting,
  vaultItems: ContentItem[],
  llmClient: LLMClient,
  config: Partial<PipelineConfig['selector']> = {}
): Promise<SelectionResult> {
  return runSelector(jobPosting, vaultItems, llmClient, config);
}

/**
 * Run the committee on an already-selected resume (useful for re-optimization)
 *
 * @param jobPosting - The job posting to optimize for
 * @param draftResume - The draft resume to optimize
 * @param llmClient - LLM client for API calls
 * @param config - Committee configuration options
 * @returns Committee result with optimized resume
 */
export async function optimizeResume(
  jobPosting: JobPosting,
  draftResume: Resume,
  llmClient: LLMClient,
  config: Partial<PipelineConfig['committee']> = {}
): Promise<CommitteeResult> {
  const cfg = {
    ...DEFAULT_PIPELINE_CONFIG.committee,
    ...config
  };

  return runCommittee(jobPosting, draftResume, llmClient, {
    maxRounds: cfg.maxRounds,
    consensusThreshold: cfg.consensusThreshold,
    targetFit: cfg.targetFit,
    fastMode: cfg.fastMode,
    models: cfg.models || FAST_MODEL_CONFIG,
    earlyStopOnConsensus: true
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate initial fit estimate from selection result
 * This provides a rough estimate before committee evaluation
 */
function calculateInitialFitEstimate(selection: SelectionResult): number {
  if (selection.selectedItems.length === 0) {
    return 0;
  }

  // Weighted average of:
  // - Coverage score (how many requirements have matching content)
  // - Average relevance of selected items
  const coverageWeight = 0.4;
  const relevanceWeight = 0.6;

  const avgRelevance =
    selection.selectedItems.reduce((sum, item) => sum + item.relevanceScore, 0) /
    selection.selectedItems.length;

  return coverageWeight * selection.coverageScore + relevanceWeight * avgRelevance;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { SelectionResult, PipelineConfig, PipelineConfigInput, PipelineResult } from './selector';
export type { CommitteeResult } from './committee';
export { DEFAULT_PIPELINE_CONFIG } from './selector';
