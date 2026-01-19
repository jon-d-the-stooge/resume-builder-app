/**
 * ATS Agent Logger
 * 
 * Comprehensive logging for scoring calculations, decisions, and operations.
 * Requirement 10.5: Log all scoring calculations for audit and debugging purposes.
 */

import { ErrorLogger } from '../../shared/errors/logger';
import { AppError } from '../../shared/errors/types';
import {
  MatchResult,
  Recommendations,
  IterationDecision,
  OptimizationResult,
  ParsedJob,
  ParsedResume,
  SemanticMatch
} from '../types';

/**
 * Log entry types
 */
export enum LogType {
  PARSING = 'PARSING',
  SEMANTIC_ANALYSIS = 'SEMANTIC_ANALYSIS',
  SCORING = 'SCORING',
  RECOMMENDATION = 'RECOMMENDATION',
  ITERATION = 'ITERATION',
  DECISION = 'DECISION',
  ERROR = 'ERROR',
  INFO = 'INFO'
}

/**
 * Log entry interface
 */
export interface LogEntry {
  type: LogType;
  timestamp: Date;
  message: string;
  context?: Record<string, any>;
}

/**
 * ATS Agent Logger class
 */
export class ATSLogger {
  private static logs: LogEntry[] = [];
  private static maxLogs = 5000;
  private static enabled = true;

  /**
   * Enable or disable logging
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Log a parsing operation
   */
  static logParsing(
    type: 'job' | 'resume',
    id: string,
    elementCount: number,
    duration?: number
  ): void {
    if (!this.enabled) return;

    this.addLog({
      type: LogType.PARSING,
      timestamp: new Date(),
      message: `Parsed ${type} ${id}`,
      context: {
        type,
        id,
        elementCount,
        durationMs: duration
      }
    });
  }

  /**
   * Log semantic analysis
   */
  static logSemanticAnalysis(
    elementCount: number,
    matchCount: number,
    duration?: number
  ): void {
    if (!this.enabled) return;

    this.addLog({
      type: LogType.SEMANTIC_ANALYSIS,
      timestamp: new Date(),
      message: `Semantic analysis: ${matchCount} matches from ${elementCount} elements`,
      context: {
        elementCount,
        matchCount,
        durationMs: duration
      }
    });
  }

  /**
   * Log scoring calculation with full breakdown
   */
  static logScoring(
    jobId: string,
    resumeId: string,
    matchResult: MatchResult,
    matches: SemanticMatch[]
  ): void {
    if (!this.enabled) return;

    this.addLog({
      type: LogType.SCORING,
      timestamp: new Date(),
      message: `Match score calculated: ${matchResult.overallScore.toFixed(3)}`,
      context: {
        jobId,
        resumeId,
        overallScore: matchResult.overallScore,
        breakdown: {
          keywordScore: matchResult.breakdown.keywordScore,
          skillsScore: matchResult.breakdown.skillsScore,
          attributesScore: matchResult.breakdown.attributesScore,
          experienceScore: matchResult.breakdown.experienceScore,
          levelScore: matchResult.breakdown.levelScore,
          weights: matchResult.breakdown.weights
        },
        gapCount: matchResult.gaps.length,
        strengthCount: matchResult.strengths.length,
        matchCount: matches.length,
        topGaps: matchResult.gaps.slice(0, 5).map(g => ({
          element: g.element.text,
          importance: g.importance,
          impact: g.impact
        })),
        topStrengths: matchResult.strengths.slice(0, 5).map(s => ({
          element: s.element.text,
          matchType: s.matchType,
          contribution: s.contribution
        }))
      }
    });
  }

  /**
   * Log recommendation generation
   */
  static logRecommendations(
    jobId: string,
    resumeId: string,
    recommendations: Recommendations
  ): void {
    if (!this.enabled) return;

    this.addLog({
      type: LogType.RECOMMENDATION,
      timestamp: new Date(),
      message: `Generated ${recommendations.priority.length} priority recommendations`,
      context: {
        jobId,
        resumeId,
        iterationRound: recommendations.metadata.iterationRound,
        currentScore: recommendations.metadata.currentScore,
        targetScore: recommendations.metadata.targetScore,
        priorityCount: recommendations.priority.length,
        optionalCount: recommendations.optional.length,
        rewordingCount: recommendations.rewording.length,
        summary: recommendations.summary
      }
    });
  }

  /**
   * Log iteration decision
   */
  static logIterationDecision(
    round: number,
    decision: IterationDecision,
    currentScore: number,
    previousScore?: number
  ): void {
    if (!this.enabled) return;

    const improvement = previousScore !== undefined
      ? currentScore - previousScore
      : 0;

    this.addLog({
      type: LogType.DECISION,
      timestamp: new Date(),
      message: `Iteration ${round}: ${decision.shouldContinue ? 'Continue' : 'Terminate'} - ${decision.reason}`,
      context: {
        round,
        shouldContinue: decision.shouldContinue,
        reason: decision.reason,
        currentScore,
        previousScore,
        improvement
      }
    });
  }

  /**
   * Log optimization completion
   */
  static logOptimizationComplete(result: OptimizationResult): void {
    if (!this.enabled) return;

    this.addLog({
      type: LogType.INFO,
      timestamp: new Date(),
      message: `Optimization complete: ${result.terminationReason}`,
      context: {
        terminationReason: result.terminationReason,
        metrics: result.metrics,
        iterationCount: result.iterations.length,
        scoreHistory: result.iterations.map(i => ({
          round: i.round,
          score: i.score
        }))
      }
    });
  }

  /**
   * Log an error
   */
  static logError(error: AppError | Error, context?: Record<string, any>): void {
    // Use shared error logger
    ErrorLogger.logError(error);

    if (!this.enabled) return;

    this.addLog({
      type: LogType.ERROR,
      timestamp: new Date(),
      message: error.message,
      context: {
        ...context,
        error: error instanceof AppError ? {
          category: error.category,
          severity: error.severity,
          recoverable: error.recoverable
        } : {
          name: error.name,
          stack: error.stack
        }
      }
    });
  }

  /**
   * Log general information
   */
  static logInfo(message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;

    this.addLog({
      type: LogType.INFO,
      timestamp: new Date(),
      message,
      context
    });
  }

  /**
   * Get all logs
   */
  static getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by type
   */
  static getLogsByType(type: LogType): LogEntry[] {
    return this.logs.filter(log => log.type === type);
  }

  /**
   * Get recent logs
   */
  static getRecentLogs(count: number): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs for a specific job/resume pair
   */
  static getLogsForPair(jobId: string, resumeId: string): LogEntry[] {
    return this.logs.filter(log =>
      log.context?.jobId === jobId && log.context?.resumeId === resumeId
    );
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  static exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Add a log entry
   */
  private static addLog(entry: LogEntry): void {
    this.logs.push(entry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${entry.type}] ${entry.message}`, entry.context || '');
    }
  }
}
