/**
 * Committee Moderator
 *
 * Orchestrates the dialogue between Advocate, Critic, and Writer agents.
 * Manages:
 * - Turn-taking between agents
 * - Context passing (each agent sees previous messages)
 * - Consensus tracking (are Advocate and Critic converging?)
 * - Termination decisions (when to stop iterating)
 *
 * The Moderator does NOT have opinions - it facilitates the process.
 */

import { LLMClient, LLMConfig } from '../../shared/llm/client';
import type { JobPosting, Resume } from '../types';
import { runAdvocate } from './advocate';
import { runCritic } from './critic';
import { runWriter } from './writer';
import {
  DEFAULT_COMMITTEE_CONFIG,
  DEFAULT_MODEL_CONFIG,
  FAST_MODEL_CONFIG
} from './types';
import type {
  CommitteeConfig,
  CommitteeResult,
  CommitteeRound,
  ConsensusState,
  RoundContext,
  AdvocateAnalysis,
  CriticAnalysis,
  WriterOutput,
  ModelConfig
} from './types';

/**
 * Determines the provider for a model based on its name
 */
function getProviderForModel(model: string): 'anthropic' | 'openai' {
  if (model.startsWith('claude-') || model.startsWith('anthropic')) {
    return 'anthropic';
  }
  return 'openai';
}

/**
 * API keys configuration for multi-provider support
 */
export interface APIKeys {
  openai?: string;
  anthropic?: string;
}

/**
 * Creates or returns an LLM client for the specified model
 * Caches clients by provider to avoid re-creating them
 */
function getClientForModel(
  model: string,
  apiKeys: APIKeys,
  clientCache: Map<string, LLMClient>
): LLMClient {
  const provider = getProviderForModel(model);

  // Check cache first
  if (clientCache.has(provider)) {
    return clientCache.get(provider)!;
  }

  // Get appropriate API key
  const apiKey = provider === 'anthropic' ? apiKeys.anthropic : apiKeys.openai;
  if (!apiKey) {
    throw new Error(`No API key provided for ${provider} (required for model: ${model})`);
  }

  // Create new client
  const client = new LLMClient(
    { apiKey, provider, model },
    { enabled: false }
  );

  clientCache.set(provider, client);
  return client;
}

/**
 * Run the full committee optimization process
 * @param jobPosting - The job to optimize for
 * @param resume - The resume to optimize
 * @param llmClientOrKeys - Either a single LLMClient (legacy) or API keys for multi-provider
 * @param config - Committee configuration
 */
export async function runCommittee(
  jobPosting: JobPosting,
  resume: Resume,
  llmClientOrKeys: LLMClient | APIKeys,
  config: Partial<CommitteeConfig> = {}
): Promise<CommitteeResult> {
  const cfg: CommitteeConfig = {
    ...DEFAULT_COMMITTEE_CONFIG,
    ...config,
    models: config.models || DEFAULT_MODEL_CONFIG
  };
  const rounds: CommitteeRound[] = [];
  let currentResume = resume;
  let previousRound: CommitteeRound | undefined;

  // Determine if we have API keys or a legacy single client
  const isMultiProvider = !(llmClientOrKeys instanceof LLMClient);
  const apiKeys: APIKeys = isMultiProvider ? llmClientOrKeys as APIKeys : {};
  const legacyClient: LLMClient | undefined = isMultiProvider ? undefined : llmClientOrKeys as LLMClient;
  const clientCache = new Map<string, LLMClient>();

  // Helper to get appropriate client for a model
  const getClient = (model: string): LLMClient => {
    if (legacyClient) {
      return legacyClient;
    }
    return getClientForModel(model, apiKeys, clientCache);
  };

  console.log('\n=== COMMITTEE SESSION START ===');
  console.log(`Config: maxRounds=${cfg.maxRounds}, consensusThreshold=${cfg.consensusThreshold}, targetFit=${cfg.targetFit}, fastMode=${cfg.fastMode}`);
  console.log(`Models: advocate=${cfg.models.advocate}, critic=${cfg.models.critic}, writer=${cfg.models.writer}`);
  console.log(`Multi-provider: ${isMultiProvider ? 'YES' : 'NO (legacy single client)'}`);

  for (let roundNum = 1; roundNum <= cfg.maxRounds; roundNum++) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`ROUND ${roundNum}`);
    console.log('='.repeat(50));

    // Build context for this round
    const context: RoundContext = {
      round: roundNum,
      jobPosting,
      currentResume,
      previousRound,
      previousAdvocateAnalysis: previousRound?.advocateAnalysis,
      previousCriticAnalysis: previousRound?.criticAnalysis
    };

    // Step 1: Advocate analyzes (using appropriate client for its model)
    console.log(`\n[ADVOCATE] Analyzing resume for connections... (${cfg.models.advocate})`);
    const advocateClient = getClient(cfg.models.advocate);
    const advocateAnalysis = await runAdvocate(context, advocateClient, cfg.models.advocate);
    console.log(`[ADVOCATE] Fit Score: ${(advocateAnalysis.fitScore * 100).toFixed(1)}%`);
    console.log(`[ADVOCATE] Found ${advocateAnalysis.connections.length} connections, ${advocateAnalysis.strengths.length} strengths`);
    console.log(`[ADVOCATE] Proposed ${advocateAnalysis.reframingOpportunities.length} reframings`);

    // Step 2: Critic reviews Advocate's analysis (using appropriate client for its model)
    console.log(`\n[CRITIC] Reviewing Advocate's claims... (${cfg.models.critic})`);
    const criticClient = getClient(cfg.models.critic);
    const criticAnalysis = await runCritic(context, advocateAnalysis, criticClient, cfg.models.critic);
    console.log(`[CRITIC] Fit Score: ${(criticAnalysis.fitScore * 100).toFixed(1)}%`);
    console.log(`[CRITIC] Agreements: ${criticAnalysis.agreements.length}`);
    console.log(`[CRITIC] Challenges: ${criticAnalysis.challenges.length} (${criticAnalysis.challenges.filter(c => c.severity === 'critical').length} critical)`);
    console.log(`[CRITIC] Genuine gaps: ${criticAnalysis.genuineGaps.length}`);

    // Calculate consensus
    const consensus = calculateConsensus(
      advocateAnalysis.fitScore,
      criticAnalysis.fitScore,
      roundNum,
      cfg.consensusThreshold
    );

    console.log(`\n[CONSENSUS] Advocate: ${(consensus.advocateScore * 100).toFixed(1)}% | Critic: ${(consensus.criticScore * 100).toFixed(1)}%`);
    console.log(`[CONSENSUS] Delta: ${(consensus.scoreDelta * 100).toFixed(1)}% | Consensus: ${consensus.isConsensus ? 'YES' : 'NO'}`);

    // Build round record
    const round: CommitteeRound = {
      round: roundNum,
      advocateAnalysis,
      criticAnalysis,
      consensus
    };

    // Check termination conditions BEFORE writing
    const shouldTerminate = checkTermination(cfg, rounds, consensus, advocateAnalysis.fitScore, criticAnalysis.fitScore);

    // Step 3: Writer synthesizes (if not terminating or if this is last round)
    if (!shouldTerminate.terminate || roundNum === cfg.maxRounds) {
      if (roundNum < cfg.maxRounds || !shouldTerminate.terminate) {
        console.log(`\n[WRITER] Synthesizing perspectives... (${cfg.models.writer})`);
        const writerClient = getClient(cfg.models.writer);
        const writerOutput = await runWriter(context, advocateAnalysis, criticAnalysis, writerClient, cfg.models.writer);
        console.log(`[WRITER] Changes applied: ${writerOutput.changesApplied.length}`);
        console.log(`[WRITER] Advocate points adopted: ${writerOutput.advocatePointsAdopted.length}`);
        console.log(`[WRITER] Critic corrections: ${writerOutput.criticCorrectionsApplied.length}`);

        round.writerOutput = writerOutput;
        currentResume = writerOutput.rewrittenResume;
      }
    }

    rounds.push(round);
    previousRound = round;

    // Check if we should stop
    if (shouldTerminate.terminate) {
      console.log(`\n[MODERATOR] Stopping: ${shouldTerminate.reason}`);
      return buildResult(resume, currentResume, rounds, shouldTerminate.reason);
    }

    // Check for no improvement between rounds
    if (roundNum > 1) {
      const prevScore = rounds[roundNum - 2].criticAnalysis.fitScore;
      const currScore = criticAnalysis.fitScore;
      if (currScore <= prevScore) {
        console.log(`\n[MODERATOR] No improvement (${(prevScore * 100).toFixed(1)}% → ${(currScore * 100).toFixed(1)}%)`);
        return buildResult(resume, currentResume, rounds, 'no_improvement');
      }
    }
  }

  console.log('\n[MODERATOR] Max rounds reached');
  return buildResult(resume, currentResume, rounds, 'max_rounds');
}

/**
 * Calculate consensus state between Advocate and Critic
 */
function calculateConsensus(
  advocateScore: number,
  criticScore: number,
  round: number,
  threshold: number
): ConsensusState {
  const scoreDelta = Math.abs(advocateScore - criticScore);

  return {
    advocateScore,
    criticScore,
    scoreDelta,
    isConsensus: scoreDelta <= threshold,
    round
  };
}

/**
 * Check if we should terminate the committee process
 */
function checkTermination(
  config: CommitteeConfig,
  rounds: CommitteeRound[],
  consensus: ConsensusState,
  advocateScore: number,
  criticScore: number
): { terminate: boolean; reason: CommitteeResult['terminationReason'] } {
  // Fast mode: stop after first round if consensus is close (within 15%)
  if (config.fastMode && rounds.length === 0 && consensus.scoreDelta <= 0.15) {
    console.log('[FAST MODE] Early consensus detected, stopping after round 1');
    return { terminate: true, reason: 'consensus' };
  }

  // Both agents agree on a high score
  if (consensus.isConsensus && config.earlyStopOnConsensus) {
    // Use the lower score (Critic's) as the authoritative score
    const effectiveScore = Math.min(advocateScore, criticScore);
    if (effectiveScore >= config.targetFit) {
      return { terminate: true, reason: 'target_reached' };
    }
    // Consensus but below target - still might want to continue if we can improve
    // Only stop on consensus if we've done at least 2 rounds
    if (rounds.length >= 1) {
      return { terminate: true, reason: 'consensus' };
    }
  }

  return { terminate: false, reason: 'max_rounds' };
}

/**
 * Build the final result
 */
function buildResult(
  originalResume: Resume,
  finalResume: Resume,
  rounds: CommitteeRound[],
  terminationReason: CommitteeResult['terminationReason']
): CommitteeResult {
  const firstRound = rounds[0];
  const lastRound = rounds[rounds.length - 1];

  // Use the Critic's score as authoritative (more conservative)
  const initialFit = firstRound.criticAnalysis.fitScore;
  const finalFit = lastRound.criticAnalysis.fitScore;

  // Calculate dialogue summary
  const totalConnections = rounds.reduce(
    (sum, r) => sum + r.advocateAnalysis.connections.length, 0
  );
  const totalChallenges = rounds.reduce(
    (sum, r) => sum + r.criticAnalysis.challenges.length, 0
  );
  const addressableChallenges = rounds.reduce(
    (sum, r) => sum + r.criticAnalysis.challenges.filter(c => c.canBeAddressed).length, 0
  );
  const totalGaps = new Set(
    rounds.flatMap(r => r.criticAnalysis.genuineGaps.map(g => g.requirement))
  ).size;
  const totalChanges = rounds.reduce(
    (sum, r) => sum + (r.writerOutput?.changesApplied.length || 0), 0
  );

  console.log('\n=== COMMITTEE SESSION COMPLETE ===');
  console.log(`Rounds: ${rounds.length}`);
  console.log(`Initial Fit (Critic): ${(initialFit * 100).toFixed(1)}%`);
  console.log(`Final Fit (Critic): ${(finalFit * 100).toFixed(1)}%`);
  console.log(`Improvement: +${((finalFit - initialFit) * 100).toFixed(1)}%`);
  console.log(`Termination: ${terminationReason}`);

  return {
    finalResume,
    initialFit,
    finalFit,
    improvement: finalFit - initialFit,
    rounds,
    terminationReason,
    dialogueSummary: {
      totalConnectionsFound: totalConnections,
      challengesRaised: totalChallenges,
      challengesResolved: addressableChallenges,
      genuineGapsIdentified: totalGaps,
      changesApplied: totalChanges
    },
    finalConsensus: lastRound.consensus
  };
}

/**
 * Run a single analysis round without rewriting (for evaluation only)
 * @param llmClientOrKeys - Either a single LLMClient (legacy) or API keys for multi-provider
 */
export async function analyzeWithCommittee(
  jobPosting: JobPosting,
  resume: Resume,
  llmClientOrKeys: LLMClient | APIKeys,
  config: Partial<CommitteeConfig> = {}
): Promise<{ advocate: AdvocateAnalysis; critic: CriticAnalysis; consensus: ConsensusState }> {
  const models = config.models || DEFAULT_MODEL_CONFIG;

  // Determine if we have API keys or a legacy single client
  const isMultiProvider = !(llmClientOrKeys instanceof LLMClient);
  const apiKeys: APIKeys = isMultiProvider ? llmClientOrKeys as APIKeys : {};
  const legacyClient: LLMClient | undefined = isMultiProvider ? undefined : llmClientOrKeys as LLMClient;
  const clientCache = new Map<string, LLMClient>();

  // Helper to get appropriate client for a model
  const getClient = (model: string): LLMClient => {
    if (legacyClient) {
      return legacyClient;
    }
    return getClientForModel(model, apiKeys, clientCache);
  };

  console.log('\n=== COMMITTEE ANALYSIS (NO REWRITING) ===');
  console.log(`Models: advocate=${models.advocate}, critic=${models.critic}`);
  console.log(`Multi-provider: ${isMultiProvider ? 'YES' : 'NO (legacy single client)'}`);

  const context: RoundContext = {
    round: 1,
    jobPosting,
    currentResume: resume
  };

  console.log(`\n[ADVOCATE] Analyzing... (${models.advocate})`);
  const advocateClient = getClient(models.advocate);
  const advocate = await runAdvocate(context, advocateClient, models.advocate);
  console.log(`[ADVOCATE] Score: ${(advocate.fitScore * 100).toFixed(1)}%`);

  console.log(`\n[CRITIC] Reviewing... (${models.critic})`);
  const criticClient = getClient(models.critic);
  const critic = await runCritic(context, advocate, criticClient, models.critic);
  console.log(`[CRITIC] Score: ${(critic.fitScore * 100).toFixed(1)}%`);

  const consensus = calculateConsensus(advocate.fitScore, critic.fitScore, 1, 0.1);

  console.log(`\n[RESULT] Advocate: ${(consensus.advocateScore * 100).toFixed(1)}% | Critic: ${(consensus.criticScore * 100).toFixed(1)}%`);
  console.log(`[RESULT] Consensus: ${consensus.isConsensus ? 'YES' : 'NO'} (delta: ${(consensus.scoreDelta * 100).toFixed(1)}%)`);

  return { advocate, critic, consensus };
}
