/**
 * Committee Types
 *
 * Type definitions for the multi-agent committee architecture.
 *
 * The committee consists of three agents with distinct perspectives:
 * - Advocate: Pro-candidate, finds connections and argues FOR fit
 * - Critic: Skeptical, challenges assumptions and verifies claims
 * - Writer: Synthesizes both perspectives into optimized resume
 */

import type { Resume, JobPosting } from '../types';
import type { ReframingRecommendation } from '../holistic/holisticAnalyzer';
import type { RewriteResult } from '../holistic/resumeWriter';

/**
 * Agent types in the committee
 */
export type AgentRole = 'advocate' | 'critic' | 'writer';

/**
 * Types of connections an advocate can find
 */
export type ConnectionStrength = 'strong' | 'moderate' | 'inferred' | 'transferable';

/**
 * Types of issues a critic can identify
 */
export type IssueType = 'overclaim' | 'unsupported' | 'missing' | 'weak_evidence' | 'terminology_gap' | 'blandification';

/**
 * A connection found by the Advocate
 */
export interface AdvocateConnection {
  jobRequirement: string;
  resumeEvidence: string;
  connectionStrength: ConnectionStrength;
  confidence: number; // 0.0 to 1.0
  reasoning: string;
  suggestedFraming?: string; // How to phrase this in the resume
}

/**
 * A reframing opportunity found by the Advocate
 */
export interface ReframingOpportunity {
  currentContent: string;
  suggestedReframe: string;
  jobRequirementAddressed: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Advocate's analysis output
 */
export interface AdvocateAnalysis {
  fitScore: number; // 0.0 to 1.0
  assessment: string;

  connections: AdvocateConnection[];
  strengths: string[];
  reframingOpportunities: ReframingOpportunity[];
  terminologyAlignments: Array<{
    resumeTerm: string;
    jobTerm: string;
    suggestion: string;
  }>;

  // What the advocate believes the candidate has that matches
  claimedQualifications: string[];
}

/**
 * A challenge raised by the Critic
 */
export interface CriticChallenge {
  type: IssueType;
  claim: string; // What was claimed (by Advocate or in resume)
  issue: string; // What's wrong with it
  evidence?: string; // What the resume actually says (or doesn't)
  severity: 'critical' | 'major' | 'minor';
  canBeAddressed: boolean; // Can this be fixed through reframing?
  suggestedFix?: string;
}

/**
 * A genuine gap identified by the Critic (cannot be reframed away)
 */
export interface GenuineGap {
  requirement: string;
  reason: string;
  isRequired: boolean; // Is this a must-have vs nice-to-have?
}

/**
 * Critic's analysis output
 */
export interface CriticAnalysis {
  fitScore: number; // 0.0 to 1.0
  assessment: string;

  // Response to Advocate
  agreements: string[]; // What the Critic agrees with from Advocate
  challenges: CriticChallenge[];

  // Independent findings
  genuineGaps: GenuineGap[];
  validatedStrengths: string[]; // Strengths that Critic confirms are accurate

  // Factual corrections
  overclaimCorrections: Array<{
    claim: string;
    correction: string;
    resumeEvidence: string;
  }>;

  // Issues that need to be addressed before finalizing
  blockingIssues: string[];
}

/**
 * A single message in the committee dialogue
 */
export interface CommitteeMessage {
  agent: AgentRole;
  round: number;
  fitScore: number;
  content: AdvocateAnalysis | CriticAnalysis | WriterOutput;
  timestamp: Date;
}

/**
 * Writer's output after synthesizing perspectives
 */
export interface WriterOutput {
  rewrittenResume: Resume;
  changesApplied: string[];
  sectionsModified: string[];

  // How tensions were resolved
  advocatePointsAdopted: string[];
  criticCorrectionsApplied: string[];
  issuesNotAddressed: string[]; // Genuine gaps that couldn't be reframed
}

/**
 * State of consensus between agents
 */
export interface ConsensusState {
  advocateScore: number;
  criticScore: number;
  scoreDelta: number;
  isConsensus: boolean;
  round: number;
}

/**
 * Model configuration for each agent
 * Allows using faster/cheaper models for deterministic tasks
 */
export interface ModelConfig {
  advocate: string;  // Creative analysis - use best model
  critic: string;    // Verification - can use faster model
  writer: string;    // Synthesis - can use faster model
}

/**
 * Default model configuration
 * - Advocate (GPT-4o): Creative analysis, finding connections
 * - Critic (Sonnet 4): Quality control, catching overclaims and blandification
 * - Writer (Opus 4.5): Synthesis, producing polished final output
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  advocate: 'gpt-4o',
  critic: 'claude-sonnet-4-20250514',
  writer: 'claude-opus-4-5-20251101'
};

/**
 * Fast model configuration (use mini/smaller models for speed)
 * ~60-70% cost reduction with some quality tradeoff
 */
export const FAST_MODEL_CONFIG: ModelConfig = {
  advocate: 'gpt-4o-mini',
  critic: 'claude-sonnet-4-20250514',
  writer: 'claude-sonnet-4-20250514'
};

/**
 * Configuration for the committee process
 */
export interface CommitteeConfig {
  maxRounds: number;           // Maximum dialogue rounds (default: 3)
  consensusThreshold: number;  // Score delta for consensus (default: 0.1)
  targetFit: number;           // Target fit score (default: 0.8)
  earlyStopOnConsensus: boolean; // Stop when consensus reached (default: true)
  models: ModelConfig;         // Model to use for each agent
  fastMode: boolean;           // Stop after 1 round if consensus is close (default: false)
}

/**
 * Default committee configuration
 */
export const DEFAULT_COMMITTEE_CONFIG: CommitteeConfig = {
  maxRounds: 3,
  consensusThreshold: 0.1,
  targetFit: 0.8,
  earlyStopOnConsensus: true,
  models: DEFAULT_MODEL_CONFIG,
  fastMode: false
};

/**
 * A single round of committee dialogue
 */
export interface CommitteeRound {
  round: number;
  advocateAnalysis: AdvocateAnalysis;
  criticAnalysis: CriticAnalysis;
  writerOutput?: WriterOutput;
  consensus: ConsensusState;
}

/**
 * Final result from the committee process
 */
export interface CommitteeResult {
  finalResume: Resume;
  initialFit: number;
  finalFit: number;
  improvement: number;

  rounds: CommitteeRound[];

  terminationReason: 'consensus' | 'target_reached' | 'max_rounds' | 'no_improvement';

  // Summary of the dialogue
  dialogueSummary: {
    totalConnectionsFound: number;
    challengesRaised: number;
    challengesResolved: number;
    genuineGapsIdentified: number;
    changesApplied: number;
  };

  // Final consensus state
  finalConsensus: ConsensusState;
}

/**
 * Context passed between agents in a round
 */
export interface RoundContext {
  round: number;
  jobPosting: JobPosting;
  currentResume: Resume;
  previousRound?: CommitteeRound;
  previousAdvocateAnalysis?: AdvocateAnalysis;
  previousCriticAnalysis?: CriticAnalysis;
}
