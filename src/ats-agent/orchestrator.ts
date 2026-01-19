/**
 * ATS Agent Orchestrator
 * 
 * Main entry point that wires together all components and manages the optimization loop.
 * 
 * Requirements: All (main integration point)
 */

import { parseJobDescription } from './parser/jobParser';
import { parseResume } from './parser/resumeParser';
import { findSemanticMatches } from './parser/semanticAnalyzer';
import { calculateMatchScore, assignImportanceScores } from './parser/scorer';
import { generateRecommendations } from './parser/recommendationGenerator';
import { processIteration, startOptimization } from './controller/iterationController';
import { ATSLogger } from './logging/logger';
import { ATSErrorFactory } from './errors/types';
import { GracefulDegradation } from './errors/gracefulDegradation';
import { LLMClient } from '../shared/llm/client';
import type {
  JobPosting,
  Resume,
  OptimizationConfig,
  OptimizationResult,
  ParsedJob,
  ParsedResume,
  MatchResult,
  Recommendations
} from './types';

/**
 * ATS Agent Orchestrator class
 * 
 * Coordinates all components to perform resume-job matching and optimization.
 */
export class ATSAgentOrchestrator {
  private config: OptimizationConfig;
  private llmClient: LLMClient;

  constructor(config?: Partial<OptimizationConfig>, llmClient?: LLMClient) {
    this.config = {
      targetScore: config?.targetScore ?? 0.8,
      maxIterations: config?.maxIterations ?? 10,
      earlyStoppingRounds: config?.earlyStoppingRounds ?? 2,
      minImprovement: config?.minImprovement ?? 0.01
    };

    // Use provided LLM client or create a new one
    if (llmClient) {
      this.llmClient = llmClient;
    } else {
      // Initialize LLM client
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        throw new Error('LLM API key not found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
      }

      this.llmClient = new LLMClient({ apiKey });
    }

    ATSLogger.logInfo('ATS Agent Orchestrator initialized', {
      config: this.config
    });
  }

  /**
   * Analyze a resume against a job posting
   * 
   * Single-shot analysis without iteration.
   */
  async analyzeMatch(
    jobPosting: JobPosting,
    resume: Resume
  ): Promise<{
    matchResult: MatchResult;
    recommendations: Recommendations;
    parsedJob: ParsedJob;
    parsedResume: ParsedResume;
  }> {
    const startTime = Date.now();

    try {
      ATSLogger.logInfo('Starting match analysis', {
        jobId: jobPosting.id,
        resumeId: resume.id
      });

      // Step 1: Parse job description
      const parsedJob = await GracefulDegradation.withGracefulDegradation(
        async () => {
          const parsed = await parseJobDescription(jobPosting, this.llmClient);
          ATSLogger.logParsing('job', jobPosting.id, parsed.elements.length);
          return assignImportanceScores(parsed);
        },
        () => GracefulDegradation.handleParsingFailure('job', jobPosting.description, new Error('Job parsing failed')),
        'parse_job_description'
      );

      // Step 2: Parse resume
      const parsedResume = await GracefulDegradation.withGracefulDegradation(
        async () => {
          const parsed = await parseResume(resume, this.llmClient);
          ATSLogger.logParsing('resume', resume.id, parsed.elements.length);
          return parsed;
        },
        () => GracefulDegradation.handleParsingFailure('resume', resume.content, new Error('Resume parsing failed')),
        'parse_resume'
      );

      // Step 3: Find semantic matches
      const matches = await GracefulDegradation.withGracefulDegradation(
        async () => {
          const semanticMatches = await findSemanticMatches(
            parsedResume.elements,
            parsedJob.elements,
            this.llmClient
          );
          ATSLogger.logSemanticAnalysis(
            parsedResume.elements.length + parsedJob.elements.length,
            semanticMatches.length
          );
          return semanticMatches;
        },
        () => GracefulDegradation.handleSemanticMatchingFailure(new Error('Semantic matching failed')),
        'find_semantic_matches'
      );

      // Step 4: Calculate match score
      const matchResult = calculateMatchScore(parsedResume, parsedJob, matches);
      ATSLogger.logScoring(jobPosting.id, resume.id, matchResult, matches);

      // Step 5: Generate recommendations
      const recommendations = generateRecommendations(matchResult, matches, 1, this.config.targetScore);
      ATSLogger.logRecommendations(jobPosting.id, resume.id, recommendations);

      const duration = Date.now() - startTime;
      ATSLogger.logInfo('Match analysis complete', {
        jobId: jobPosting.id,
        resumeId: resume.id,
        score: matchResult.overallScore,
        durationMs: duration
      });

      return {
        matchResult,
        recommendations,
        parsedJob,
        parsedResume
      };
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'analyze_match',
          jobId: jobPosting.id,
          resumeId: resume.id
        }
      );
      throw error;
    }
  }

  /**
   * Start optimization loop
   * 
   * Iteratively improves resume until target score is reached or termination criteria are met.
   */
  async optimize(
    jobPosting: JobPosting,
    initialResume: Resume,
    onRecommendations?: (recommendations: Recommendations, iteration: number) => Promise<Resume>
  ): Promise<OptimizationResult> {
    try {
      ATSLogger.logInfo('Starting optimization loop', {
        jobId: jobPosting.id,
        resumeId: initialResume.id,
        config: this.config
      });

      // Use iteration controller for optimization
      const result = await startOptimization(
        jobPosting,
        initialResume,
        this.config,
        this.llmClient,
        onRecommendations
      );

      ATSLogger.logOptimizationComplete(result);

      return result;
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'optimize',
          jobId: jobPosting.id,
          resumeId: initialResume.id
        }
      );
      throw error;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    ATSLogger.logInfo('Configuration updated', {
      config: this.config
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): OptimizationConfig {
    return { ...this.config };
  }

  /**
   * Get analysis logs
   */
  getLogs() {
    return ATSLogger.getLogs();
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    ATSLogger.clearLogs();
  }
}

/**
 * Create a new ATS Agent Orchestrator instance
 */
export function createATSAgent(config?: Partial<OptimizationConfig>): ATSAgentOrchestrator {
  return new ATSAgentOrchestrator(config);
}

/**
 * Convenience function for single-shot analysis
 */
export async function analyzeResume(
  jobPosting: JobPosting,
  resume: Resume,
  config?: Partial<OptimizationConfig>
): Promise<{
  matchResult: MatchResult;
  recommendations: Recommendations;
}> {
  const agent = createATSAgent(config);
  const result = await agent.analyzeMatch(jobPosting, resume);
  
  return {
    matchResult: result.matchResult,
    recommendations: result.recommendations
  };
}

/**
 * Convenience function for optimization loop
 */
export async function optimizeResume(
  jobPosting: JobPosting,
  initialResume: Resume,
  onRecommendations: (recommendations: Recommendations, iteration: number) => Promise<Resume>,
  config?: Partial<OptimizationConfig>
): Promise<OptimizationResult> {
  const agent = createATSAgent(config);
  return agent.optimize(jobPosting, initialResume, onRecommendations);
}
