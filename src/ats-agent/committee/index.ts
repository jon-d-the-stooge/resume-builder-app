/**
 * Committee Module
 *
 * Multi-agent committee architecture for resume optimization.
 *
 * Instead of a single agent both generating and evaluating improvements,
 * this module uses three agents with different perspectives:
 *
 * - **Advocate**: Pro-candidate, finds connections generously
 * - **Critic**: Quality control, verifies claims and catches overclaims
 * - **Writer**: Synthesizes both perspectives into optimized resume
 *
 * The key insight is that the agent generating recommendations (Advocate)
 * is NOT the one evaluating the results (Critic). This prevents
 * "grading your own homework" and provides genuine verification.
 *
 * Usage:
 * ```typescript
 * import { runCommittee } from './committee';
 *
 * const result = await runCommittee(jobPosting, resume, llmClient, {
 *   maxRounds: 3,
 *   consensusThreshold: 0.1,
 *   targetFit: 0.8
 * });
 *
 * console.log(`Final fit: ${result.finalFit}`);
 * console.log(`Improvement: ${result.improvement}`);
 * console.log(`Final resume: ${result.finalResume.content}`);
 * ```
 */

// Main entry points
export { runCommittee, analyzeWithCommittee } from './moderator';

// Individual agents (for testing or custom orchestration)
export { runAdvocate } from './advocate';
export { runCritic } from './critic';
export { runWriter } from './writer';

// Types
export type {
  // Agent roles
  AgentRole,
  ConnectionStrength,
  IssueType,

  // Advocate types
  AdvocateAnalysis,
  AdvocateConnection,
  ReframingOpportunity,

  // Critic types
  CriticAnalysis,
  CriticChallenge,
  GenuineGap,

  // Writer types
  WriterOutput,

  // Committee orchestration
  CommitteeConfig,
  CommitteeResult,
  CommitteeRound,
  CommitteeMessage,
  ConsensusState,
  RoundContext,
  ModelConfig
} from './types';

// Configuration presets
export {
  DEFAULT_COMMITTEE_CONFIG,
  DEFAULT_MODEL_CONFIG,
  FAST_MODEL_CONFIG
} from './types';
