/**
 * Graceful Degradation Utilities
 * 
 * Implements fallback strategies when components fail.
 * 
 * Strategy:
 * - If semantic analysis fails, fall back to basic keyword matching
 * - If importance scoring fails, use default importance (0.5)
 * - If one dimension of scoring fails, calculate score from remaining dimensions
 */

import { ATSLogger } from '../logging/logger';
import { ATSError, ATSErrorFactory } from './types';
import type {
  Element,
  TaggedElement,
  SemanticMatch,
  ScoreBreakdown
} from '../types';

/**
 * Default importance score when scoring fails
 */
export const DEFAULT_IMPORTANCE = 0.5;

/**
 * Fallback semantic tags when analysis fails
 */
export const FALLBACK_TAGS = ['generic'];

/**
 * Graceful degradation handler
 */
export class GracefulDegradation {
  /**
   * Handle semantic analysis failure - fall back to basic keyword matching
   */
  static handleSemanticAnalysisFailure(
    element: Element,
    error: Error
  ): TaggedElement {
    ATSLogger.logError(error, {
      operation: 'semantic_analysis',
      element: element.text,
      fallback: 'basic_keyword_matching'
    });

    // Fall back to basic tagging
    return {
      ...element,
      importance: DEFAULT_IMPORTANCE,
      semanticTags: FALLBACK_TAGS,
      category: 'keyword' as const
    };
  }

  /**
   * Handle importance scoring failure - use default importance
   */
  static handleImportanceScoringFailure(
    element: Element,
    error: Error
  ): number {
    ATSLogger.logError(error, {
      operation: 'importance_scoring',
      element: element.text,
      fallback: `default_importance_${DEFAULT_IMPORTANCE}`
    });

    return DEFAULT_IMPORTANCE;
  }

  /**
   * Handle semantic matching failure - return empty matches
   */
  static handleSemanticMatchingFailure(
    error: Error
  ): SemanticMatch[] {
    ATSLogger.logError(error, {
      operation: 'semantic_matching',
      fallback: 'empty_matches'
    });

    return [];
  }

  /**
   * Handle dimension scoring failure - calculate from remaining dimensions
   */
  static handleDimensionScoringFailure(
    breakdown: Partial<ScoreBreakdown>,
    failedDimension: string,
    error: Error
  ): ScoreBreakdown {
    ATSLogger.logError(error, {
      operation: 'dimension_scoring',
      failedDimension,
      fallback: 'calculate_from_remaining_dimensions'
    });

    // Default weights
    const defaultWeights = {
      keywords: 0.20,
      skills: 0.35,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10
    };

    // Fill in missing scores with 0
    const completeBreakdown: ScoreBreakdown = {
      keywordScore: breakdown.keywordScore ?? 0,
      skillsScore: breakdown.skillsScore ?? 0,
      attributesScore: breakdown.attributesScore ?? 0,
      experienceScore: breakdown.experienceScore ?? 0,
      levelScore: breakdown.levelScore ?? 0,
      weights: breakdown.weights ?? defaultWeights
    };

    // Recalculate weights to exclude failed dimension
    const remainingWeights = { ...completeBreakdown.weights };
    const failedWeight = remainingWeights[failedDimension as keyof typeof remainingWeights] || 0;
    
    if (failedWeight > 0) {
      // Set failed dimension weight to 0
      (remainingWeights as any)[failedDimension] = 0;
      
      // Redistribute weight proportionally to remaining dimensions
      const totalRemainingWeight = 1.0 - failedWeight;
      const scaleFactor = 1.0 / totalRemainingWeight;
      
      for (const key in remainingWeights) {
        if (key !== failedDimension) {
          (remainingWeights as any)[key] *= scaleFactor;
        }
      }
    }

    completeBreakdown.weights = remainingWeights;

    return completeBreakdown;
  }

  /**
   * Handle parsing failure - return minimal parsed structure
   */
  static handleParsingFailure(
    type: 'job' | 'resume',
    rawText: string,
    error: Error
  ): { elements: TaggedElement[]; rawText: string; metadata: Record<string, any> } {
    ATSLogger.logError(error, {
      operation: 'parsing',
      type,
      fallback: 'minimal_structure'
    });

    // Return minimal structure with no elements
    return {
      elements: [],
      rawText,
      metadata: {
        parsingFailed: true,
        error: error.message
      }
    };
  }

  /**
   * Handle recommendation generation failure - return minimal recommendations
   */
  static handleRecommendationGenerationFailure(
    error: Error,
    iterationRound: number,
    currentScore: number,
    targetScore: number
  ): any {
    ATSLogger.logError(error, {
      operation: 'recommendation_generation',
      fallback: 'minimal_recommendations'
    });

    return {
      summary: 'Unable to generate detailed recommendations due to an error. Please review manually.',
      priority: [],
      optional: [],
      rewording: [],
      metadata: {
        iterationRound,
        currentScore,
        targetScore,
        generationFailed: true
      }
    };
  }

  /**
   * Wrap operation with graceful degradation
   */
  static async withGracefulDegradation<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    operationName: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: operationName,
          fallback: 'using_fallback_value'
        }
      );
      return fallback();
    }
  }

  /**
   * Wrap synchronous operation with graceful degradation
   */
  static withGracefulDegradationSync<T>(
    operation: () => T,
    fallback: () => T,
    operationName: string
  ): T {
    try {
      return operation();
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: operationName,
          fallback: 'using_fallback_value'
        }
      );
      return fallback();
    }
  }
}
