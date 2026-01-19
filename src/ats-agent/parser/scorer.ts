/**
 * Scorer Engine
 * 
 * Assigns importance scores to job requirements and calculates match scores
 * between resumes and job postings.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.5, 5.1, 5.2, 5.4, 5.5
 * Task: 6 (Implement Scorer Engine)
 */

import {
  Element,
  ParsedJob,
  ParsedResume,
  SemanticMatch,
  MatchResult,
  ScoreBreakdown,
  Gap,
  Strength,
  TaggedElement,
  ElementCategory,
  ElementContribution,
  DimensionBreakdown
} from '../types';
import { DEFAULT_CONFIG } from '../types';

/**
 * Importance indicators and their score ranges
 */
const IMPORTANCE_INDICATORS = {
  high: {
    keywords: ['required', 'must have', 'essential', 'mandatory', 'critical', 'necessary'],
    scoreRange: [0.9, 1.0] as [number, number]
  },
  mediumHigh: {
    keywords: ['strongly preferred', 'highly desired', 'important', 'strongly recommended'],
    scoreRange: [0.7, 0.8] as [number, number]
  },
  medium: {
    keywords: ['desired', 'recommended', 'should have'],
    scoreRange: [0.5, 0.6] as [number, number]
  },
  mediumLow: {
    keywords: ['preferred'],
    scoreRange: [0.4, 0.5] as [number, number]
  },
  low: {
    keywords: ['nice to have', 'bonus', 'plus', 'optional', 'a plus'],
    scoreRange: [0.3, 0.5] as [number, number]
  }
};

/**
 * Assign importance score to an element based on context
 * 
 * Algorithm:
 * 1. Check for explicit importance indicators in context
 * 2. If multiple indicators conflict, use the highest importance level
 * 3. If no explicit indicators, infer from:
 *    - Position in text (earlier = more important)
 *    - Frequency of mention (more mentions = more important)
 *    - Section context (requirements vs nice-to-haves)
 * 4. Ensure score is in range [0.0, 1.0]
 * 
 * @param element - The element to score
 * @param context - The surrounding text context
 * @param position - Optional position information (0.0 = start, 1.0 = end)
 * @returns Importance score between 0.0 and 1.0
 */
export function assignImportance(
  element: Element,
  context: string,
  position?: number
): number {
  const contextLower = context.toLowerCase();
  const elementText = element.text.toLowerCase();

  // Check for explicit importance indicators
  const indicators = findImportanceIndicators(contextLower, elementText);

  if (indicators.length > 0) {
    // If multiple indicators found, use the highest importance
    const maxScore = Math.max(...indicators.map(ind => ind.score));
    return clampScore(maxScore);
  }

  // No explicit indicators - infer from context
  let inferredScore = 0.5; // Default baseline

  // Position-based adjustment (earlier in text = more important)
  if (position !== undefined) {
    // Earlier positions get a boost (0.0-0.2 range)
    const positionBoost = (1.0 - position) * 0.2;
    inferredScore += positionBoost;
  }

  // Section context adjustment
  if (contextLower.includes('requirement') || contextLower.includes('qualification')) {
    inferredScore += 0.1;
  }

  if (contextLower.includes('nice to have') || contextLower.includes('bonus')) {
    inferredScore -= 0.2;
  }

  // Frequency-based adjustment (if element appears multiple times in context)
  const frequency = countOccurrences(contextLower, elementText);
  if (frequency > 1) {
    inferredScore += Math.min(0.1 * (frequency - 1), 0.2);
  }

  return clampScore(inferredScore);
}

/**
 * Find importance indicators in context
 * 
 * @param context - The context text (lowercase)
 * @param elementText - The element text (lowercase)
 * @returns Array of found indicators with their scores
 */
function findImportanceIndicators(
  context: string,
  elementText: string
): Array<{ level: string; score: number }> {
  const found: Array<{ level: string; score: number }> = [];

  // Check each importance level
  for (const [level, config] of Object.entries(IMPORTANCE_INDICATORS)) {
    for (const keyword of config.keywords) {
      // Look for indicator near the element text
      const indicatorPattern = new RegExp(
        `${keyword}[^.]*${escapeRegex(elementText)}|${escapeRegex(elementText)}[^.]*${keyword}`,
        'i'
      );

      if (indicatorPattern.test(context)) {
        // Use midpoint of score range
        const [min, max] = config.scoreRange;
        const score = (min + max) / 2;
        found.push({ level, score });
      }
    }
  }

  return found;
}

/**
 * Count occurrences of text in context
 * 
 * @param context - The context text
 * @param text - The text to count
 * @returns Number of occurrences
 */
function countOccurrences(context: string, text: string): number {
  const regex = new RegExp(escapeRegex(text), 'gi');
  const matches = context.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Escape special regex characters
 * 
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Clamp score to valid range [0.0, 1.0]
 * 
 * @param score - The score to clamp
 * @returns Clamped score
 */
function clampScore(score: number): number {
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Calculate match score between resume and job posting
 * 
 * Algorithm:
 * 1. For each job element with importance I:
 *    - Find best matching resume element (if any)
 *    - Calculate match quality Q (0.0-1.0 based on match type)
 *    - Contribution = I × Q
 * 
 * 2. Calculate dimension scores:
 *    - Keywords: avg(contributions for keyword elements)
 *    - Skills: avg(contributions for skill elements)
 *    - Attributes: avg(contributions for attribute elements)
 *    - Experience: avg(contributions for experience elements)
 *    - Level: binary (1.0 if level matches, 0.5 if close, 0.0 if far)
 * 
 * 3. Apply dimension weights and calculate overall score
 * 
 * 4. Identify gaps and strengths
 * 
 * 5. Generate detailed contribution breakdown for transparency
 * 
 * @param parsedResume - The parsed resume
 * @param parsedJob - The parsed job with importance scores
 * @param matches - Semantic matches between resume and job elements
 * @param config - Optional scoring configuration
 * @returns Match result with score, breakdown, gaps, and strengths
 */
export function calculateMatchScore(
  parsedResume: ParsedResume,
  parsedJob: ParsedJob,
  matches: SemanticMatch[],
  config = DEFAULT_CONFIG.scoring
): MatchResult {
  // Build match lookup for quick access
  const matchLookup = buildMatchLookup(matches);

  // Calculate contributions for each job element
  const contributions = calculateContributions(parsedJob, matchLookup);

  // Calculate dimension scores with detailed breakdowns
  const { dimensionScores, dimensionBreakdowns } = calculateDimensionScoresWithBreakdown(
    contributions,
    parsedJob,
    config.dimensionWeights
  );

  // Apply dimension weights
  const overallScore = calculateWeightedScore(dimensionScores, config.dimensionWeights);

  // Build score breakdown with enhanced details
  const breakdown: ScoreBreakdown = {
    ...dimensionScores,
    weights: config.dimensionWeights,
    dimensions: dimensionBreakdowns
  };

  // Identify gaps (missing or low-quality matches)
  const gaps = identifyGaps(parsedJob, matchLookup);

  // Identify strengths (high-quality matches on important elements)
  const strengths = identifyStrengths(parsedJob, matchLookup);

  return {
    overallScore: clampScore(overallScore),
    breakdown,
    gaps,
    strengths
  };
}

/**
 * Build a lookup map from job element to best match
 * 
 * @param matches - Array of semantic matches
 * @returns Map from job element text to best match
 */
function buildMatchLookup(matches: SemanticMatch[]): Map<string, SemanticMatch> {
  const lookup = new Map<string, SemanticMatch>();

  for (const match of matches) {
    const key = match.jobElement.normalizedText;
    const existing = lookup.get(key);

    // Keep the match with highest confidence
    if (!existing || match.confidence > existing.confidence) {
      lookup.set(key, match);
    }
  }

  return lookup;
}

/**
 * Calculate contribution for each job element
 * 
 * @param parsedJob - The parsed job
 * @param matchLookup - Lookup map for matches
 * @returns Array of contributions with metadata
 */
function calculateContributions(
  parsedJob: ParsedJob,
  matchLookup: Map<string, SemanticMatch>
): ElementContribution[] {
  const contributions: ElementContribution[] = [];

  for (const element of parsedJob.elements) {
    const importance = (element as any).importance || 0.5;
    const category = (element as any).category || 'keyword';
    const match = matchLookup.get(element.normalizedText);

    // Match quality based on match type and confidence
    const matchQuality = match ? getMatchQuality(match) : 0.0;

    // Contribution = importance × match quality
    const contribution = importance * matchQuality;

    contributions.push({
      element,
      importance,
      matchQuality,
      contribution,
      category,
      matchType: match?.matchType
    });
  }

  return contributions;
}

/**
 * Get match quality score from semantic match
 * 
 * @param match - The semantic match
 * @returns Quality score 0.0-1.0
 */
function getMatchQuality(match: SemanticMatch): number {
  // Base quality on match type
  const baseQuality = {
    exact: 1.0,
    synonym: 0.95,
    related: 0.7,
    semantic: 0.6
  }[match.matchType] || 0.5;

  // Adjust by confidence
  return baseQuality * match.confidence;
}

/**
 * Calculate dimension scores from contributions with detailed breakdown
 * 
 * @param contributions - Array of contributions
 * @param parsedJob - The parsed job (for level calculation)
 * @param weights - Dimension weights for calculating weighted scores
 * @returns Dimension scores and detailed breakdowns
 */
function calculateDimensionScoresWithBreakdown(
  contributions: ElementContribution[],
  parsedJob: ParsedJob,
  weights: ScoreBreakdown['weights']
): {
  dimensionScores: Omit<ScoreBreakdown, 'weights' | 'dimensions'>;
  dimensionBreakdowns: NonNullable<ScoreBreakdown['dimensions']>;
} {
  // Group contributions by category
  const byCategory: Record<ElementCategory, ElementContribution[]> = {
    keyword: [],
    skill: [],
    attribute: [],
    experience: [],
    concept: []
  };

  for (const contrib of contributions) {
    if (contrib.category in byCategory) {
      byCategory[contrib.category].push(contrib);
    }
  }

  // Calculate scores and create detailed breakdowns for each dimension
  const keywordScore = average(byCategory.keyword.map(c => c.contribution));
  const skillsScore = average(byCategory.skill.map(c => c.contribution));
  const attributesScore = average(byCategory.attribute.map(c => c.contribution));
  const experienceScore = average(byCategory.experience.map(c => c.contribution));
  
  // Level score is calculated separately (simplified for now)
  // TODO: Implement proper level matching logic
  const levelScore = 0.5;
  const levelContributions: ElementContribution[] = [];

  // Create detailed breakdowns for each dimension
  const dimensionBreakdowns: NonNullable<ScoreBreakdown['dimensions']> = {
    keywords: {
      score: keywordScore,
      weight: weights.keywords,
      weightedScore: keywordScore * weights.keywords,
      contributions: byCategory.keyword
    },
    skills: {
      score: skillsScore,
      weight: weights.skills,
      weightedScore: skillsScore * weights.skills,
      contributions: byCategory.skill
    },
    attributes: {
      score: attributesScore,
      weight: weights.attributes,
      weightedScore: attributesScore * weights.attributes,
      contributions: byCategory.attribute
    },
    experience: {
      score: experienceScore,
      weight: weights.experience,
      weightedScore: experienceScore * weights.experience,
      contributions: byCategory.experience
    },
    level: {
      score: levelScore,
      weight: weights.level,
      weightedScore: levelScore * weights.level,
      contributions: levelContributions
    }
  };

  const dimensionScores = {
    keywordScore,
    skillsScore,
    attributesScore,
    experienceScore,
    levelScore
  };

  return { dimensionScores, dimensionBreakdowns };
}

/**
 * Calculate dimension scores from contributions (legacy function for backward compatibility)
 * 
 * @param contributions - Array of contributions
 * @param parsedJob - The parsed job (for level calculation)
 * @returns Dimension scores
 */
function calculateDimensionScores(
  contributions: Array<{
    element: Element;
    importance: number;
    matchQuality: number;
    contribution: number;
    category: ElementCategory;
  }>,
  parsedJob: ParsedJob
): Omit<ScoreBreakdown, 'weights' | 'dimensions'> {
  // Group contributions by category
  const byCategory = {
    keyword: [] as number[],
    skill: [] as number[],
    attribute: [] as number[],
    experience: [] as number[],
    concept: [] as number[]
  };

  for (const contrib of contributions) {
    if (contrib.category in byCategory) {
      byCategory[contrib.category].push(contrib.contribution);
    }
  }

  // Calculate average for each dimension
  const keywordScore = average(byCategory.keyword);
  const skillsScore = average(byCategory.skill);
  const attributesScore = average(byCategory.attribute);
  const experienceScore = average(byCategory.experience);

  // Level score is calculated separately (simplified for now)
  // TODO: Implement proper level matching logic
  const levelScore = 0.5;

  return {
    keywordScore,
    skillsScore,
    attributesScore,
    experienceScore,
    levelScore
  };
}

/**
 * Calculate average of numbers
 * 
 * @param numbers - Array of numbers
 * @returns Average, or 0 if empty
 */
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  return sum / numbers.length;
}

/**
 * Calculate weighted score from dimension scores
 * 
 * @param scores - Dimension scores
 * @param weights - Dimension weights
 * @returns Weighted overall score
 */
function calculateWeightedScore(
  scores: Omit<ScoreBreakdown, 'weights'>,
  weights: ScoreBreakdown['weights']
): number {
  return (
    scores.keywordScore * weights.keywords +
    scores.skillsScore * weights.skills +
    scores.attributesScore * weights.attributes +
    scores.experienceScore * weights.experience +
    scores.levelScore * weights.level
  );
}

/**
 * Identify gaps (missing or low-quality matches)
 * 
 * @param parsedJob - The parsed job
 * @param matchLookup - Lookup map for matches
 * @returns Array of gaps sorted by impact
 */
function identifyGaps(
  parsedJob: ParsedJob,
  matchLookup: Map<string, SemanticMatch>
): Gap[] {
  const gaps: Gap[] = [];

  for (const element of parsedJob.elements) {
    const importance = (element as any).importance || 0.5;
    const category = (element as any).category || 'keyword';
    const match = matchLookup.get(element.normalizedText);

    const matchQuality = match ? getMatchQuality(match) : 0.0;

    // Consider it a gap if no match or low-quality match
    if (matchQuality < 0.7) {
      const impact = importance * (1.0 - matchQuality);

      gaps.push({
        element,
        importance,
        category,
        impact
      });
    }
  }

  // Sort by impact (highest first)
  gaps.sort((a, b) => b.impact - a.impact);

  return gaps;
}

/**
 * Identify strengths (high-quality matches on important elements)
 * 
 * @param parsedJob - The parsed job
 * @param matchLookup - Lookup map for matches
 * @returns Array of strengths sorted by contribution
 */
function identifyStrengths(
  parsedJob: ParsedJob,
  matchLookup: Map<string, SemanticMatch>
): Strength[] {
  const strengths: Strength[] = [];

  for (const element of parsedJob.elements) {
    const importance = (element as any).importance || 0.5;
    const match = matchLookup.get(element.normalizedText);

    if (match) {
      const matchQuality = getMatchQuality(match);

      // Consider it a strength if high-quality match on important element
      if (matchQuality >= 0.7 && importance >= 0.5) {
        const contribution = importance * matchQuality;

        strengths.push({
          element,
          matchType: match.matchType,
          contribution
        });
      }
    }
  }

  // Sort by contribution (highest first)
  strengths.sort((a, b) => b.contribution - a.contribution);

  return strengths;
}

/**
 * Assign importance scores to all elements in a parsed job
 * 
 * @param parsedJob - The parsed job
 * @returns ParsedJob with importance scores assigned
 */
export function assignImportanceScores(parsedJob: ParsedJob): ParsedJob {
  const totalElements = parsedJob.elements.length;

  const elementsWithImportance = parsedJob.elements.map((element, index) => {
    // Calculate relative position (0.0 = start, 1.0 = end)
    const position = totalElements > 1 ? index / (totalElements - 1) : 0.5;

    // Assign importance based on context and position
    const importance = assignImportance(element, element.context, position);

    // Add importance to element
    return {
      ...element,
      importance
    } as any;
  });

  return {
    ...parsedJob,
    elements: elementsWithImportance
  };
}
