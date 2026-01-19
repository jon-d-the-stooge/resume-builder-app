/**
 * Recommendation Generator
 * 
 * Generates actionable feedback for resume improvement based on match results.
 * Prioritizes gaps by importance and provides specific, actionable suggestions.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * Task: 8 (Implement Recommendation Generator)
 */

import {
  MatchResult,
  Recommendations,
  Recommendation,
  Gap,
  SemanticMatch,
  RecommendationType,
  JobTheme,
  ParsedResume
} from '../types';

/**
 * Gap priority levels based on importance scores
 */
interface PrioritizedGaps {
  high: Gap[];      // importance > 0.8
  medium: Gap[];    // importance 0.5-0.8
  low: Gap[];       // importance < 0.5
}

/**
 * Prioritize gaps by importance score
 * 
 * Separates gaps into high, medium, and low priority based on importance thresholds.
 * Within each priority level, gaps are sorted by impact (descending).
 * 
 * @param gaps - Array of gaps from match result
 * @returns Prioritized gaps organized by importance level
 */
export function prioritizeGaps(gaps: Gap[]): PrioritizedGaps {
  const prioritized: PrioritizedGaps = {
    high: [],
    medium: [],
    low: []
  };

  // Separate gaps by importance level
  for (const gap of gaps) {
    // Skip gaps with invalid importance scores
    if (isNaN(gap.importance) || gap.importance < 0 || gap.importance > 1) {
      continue;
    }
    
    if (gap.importance >= 0.8) {
      prioritized.high.push(gap);
    } else if (gap.importance >= 0.5) {
      prioritized.medium.push(gap);
    } else {
      prioritized.low.push(gap);
    }
  }

  // Sort each priority level by impact (descending)
  prioritized.high.sort((a, b) => b.impact - a.impact);
  prioritized.medium.sort((a, b) => b.impact - a.impact);
  prioritized.low.sort((a, b) => b.impact - a.impact);

  return prioritized;
}

/**
 * Generate recommendations for missing elements
 * 
 * Creates 'add_skill' or 'add_experience' recommendations for high-importance gaps.
 * Includes specific suggestions and examples based on the element category.
 * 
 * @param gaps - High-importance gaps
 * @returns Array of recommendations for missing elements
 */
export function generateMissingElementRecommendations(gaps: Gap[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const gap of gaps) {
    const elementText = gap.element.text;
    const category = gap.category;

    // Determine recommendation type based on category
    const type: RecommendationType = 
      category === 'skill' ? 'add_skill' : 'add_experience';

    // Generate specific suggestion based on category
    const suggestion = generateMissingSuggestion(elementText, category);
    const example = generateMissingExample(elementText, category);

    // Generate job requirement reference and explanation
    const jobRequirementReference = `Job requirement: "${elementText}" (${category}, importance: ${gap.importance.toFixed(2)})`;
    const explanation = generateMissingExplanation(elementText, category, gap.importance);

    recommendations.push({
      type,
      element: elementText,
      importance: gap.importance,
      suggestion,
      example,
      jobRequirementReference,
      explanation
    });
  }

  return recommendations;
}

/**
 * Generate suggestion text for missing element
 * 
 * @param elementText - The missing element text
 * @param category - The element category
 * @returns Suggestion text
 */
function generateMissingSuggestion(elementText: string, category: string): string {
  switch (category) {
    case 'skill':
      return `Highlight or reframe existing experience to make "${elementText}" explicit; if missing, add it to skills or demonstrate it in projects`;
    
    case 'experience':
      return `Surface experience that aligns with "${elementText}" in your work history or projects; if missing, add a relevant example`;
    
    case 'attribute':
      return `Emphasize "${elementText}" in your summary or through specific accomplishments if you already demonstrate it`;
    
    case 'keyword':
      return `Use "${elementText}" or closely aligned wording where it already fits your experience`;
    
    case 'concept':
      return `Demonstrate familiarity with "${elementText}" using existing projects, publications, or certifications`;
    
    default:
      return `Add "${elementText}" to strengthen your resume`;
  }
}

/**
 * Generate example text for missing element
 * 
 * @param elementText - The missing element text
 * @param category - The element category
 * @returns Example text
 */
function generateMissingExample(elementText: string, category: string): string {
  switch (category) {
    case 'skill':
      return `Example: "Proficient in ${elementText}" or "Developed solutions using ${elementText}"`;
    
    case 'experience':
      return `Example: "Led ${elementText} initiatives that resulted in [specific outcome]"`;
    
    case 'attribute':
      return `Example: "Demonstrated ${elementText} by [specific achievement]"`;
    
    case 'keyword':
      return `Example: Naturally mention "${elementText}" in context of relevant projects`;
    
    case 'concept':
      return `Example: "Applied ${elementText} principles to [specific project or outcome]"`;
    
    default:
      return `Example: Include "${elementText}" in relevant sections`;
  }
}

/**
 * Generate explanation for missing element recommendation
 * 
 * @param elementText - The missing element text
 * @param category - The element category
 * @param importance - The importance score
 * @returns Explanation text
 */
function generateMissingExplanation(elementText: string, category: string, importance: number): string {
  const importanceLevel = importance >= 0.9 ? 'critical' : importance >= 0.8 ? 'high-priority' : 'important';
  
  let explanation = `The job posting lists "${elementText}" as a ${importanceLevel} ${category} requirement`;
  
  if (importance >= 0.9) {
    explanation += '. This is likely a must-have qualification for the role';
  } else if (importance >= 0.8) {
    explanation += '. This is a key qualification that will significantly impact your candidacy';
  } else if (importance >= 0.6) {
    explanation += '. Including this will strengthen your application';
  } else {
    explanation += '. Adding this would improve your match score';
  }
  
  return explanation + '. If you already have related experience, make it explicit using the job’s terminology.';
}

/**
 * Generate rewording suggestions for partial matches
 * 
 * Creates 'reframe' recommendations for matches with confidence between 0.3 and 0.7.
 * Suggests how to strengthen the match with before/after examples.
 * 
 * @param matches - Semantic matches
 * @param gaps - All gaps (to find partial matches)
 * @returns Array of rewording recommendations
 */
export function generateRewordingRecommendations(
  matches: SemanticMatch[],
  gaps: Gap[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Find partial matches (confidence 0.3-0.7)
  const partialMatches = matches.filter(
    match => match.confidence >= 0.3 && match.confidence <= 0.7
  );

  for (const match of partialMatches) {
    const jobElement = match.jobElement.text;
    const resumeElement = match.resumeElement.text;
    
    // Find the corresponding gap to get importance
    const gap = gaps.find(g => g.element.normalizedText === match.jobElement.normalizedText);
    const importance = gap?.importance || 0.5;
    const category = gap?.category || 'skill';

    const suggestion = `Strengthen match for "${jobElement}" by using more specific or direct language`;
    const example = `Before: "${resumeElement}"\nAfter: "${jobElement}" or similar phrasing that directly addresses the requirement`;

    // Generate job requirement reference and explanation
    const jobRequirementReference = `Job requirement: "${jobElement}" (${category}, importance: ${importance.toFixed(2)})`;
    const explanation = `Your resume mentions "${resumeElement}" which partially matches the job requirement "${jobElement}" (${(match.confidence * 100).toFixed(0)}% match). Using more direct language that closely aligns with the job posting will improve your match score and make it clearer to ATS systems that you meet this requirement.`;

    recommendations.push({
      type: 'reframe',
      element: jobElement,
      importance,
      suggestion,
      example,
      jobRequirementReference,
      explanation
    });
  }

  return recommendations;
}

/**
 * Generate emphasis and quantification suggestions
 * 
 * Creates 'emphasize' or 'quantify' recommendations for matched elements
 * that could be strengthened with metrics or more specific details.
 * 
 * @param matches - Semantic matches
 * @param gaps - All gaps
 * @returns Array of emphasis/quantification recommendations
 */
export function generateEmphasisRecommendations(
  matches: SemanticMatch[],
  gaps: Gap[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Find good matches (confidence > 0.7) that could still be improved
  const goodMatches = matches.filter(match => match.confidence > 0.7);

  for (const match of goodMatches) {
    const jobElement = match.jobElement.text;
    const resumeElement = match.resumeElement.text;
    
    // Find the corresponding gap to get importance
    const gap = gaps.find(g => g.element.normalizedText === match.jobElement.normalizedText);
    const importance = gap?.importance || 0.5;
    const category = gap?.category || 'skill';

    // Only suggest emphasis for important elements
    if (importance >= 0.6) {
      // Check if the resume element lacks quantification
      const hasNumbers = /\d+/.test(resumeElement);
      
      const jobRequirementReference = `Job requirement: "${jobElement}" (${category}, importance: ${importance.toFixed(2)})`;
      
      if (!hasNumbers) {
        const suggestion = `Add specific metrics or quantifiable results to strengthen "${jobElement}"`;
        const example = `Before: "${resumeElement}"\nAfter: Add metrics like "Led team of 5", "Increased efficiency by 30%", or "Managed $2M budget"`;
        const explanation = `Your resume mentions "${resumeElement}" which matches the job requirement "${jobElement}". However, adding quantifiable metrics will make your experience more concrete and impressive. The job posting emphasizes this as an important qualification (importance: ${importance.toFixed(2)}), so strengthening it with specific numbers will significantly improve your candidacy.`;

        recommendations.push({
          type: 'quantify',
          element: jobElement,
          importance,
          suggestion,
          example,
          jobRequirementReference,
          explanation
        });
      } else {
        // Suggest emphasis if already quantified
        const suggestion = `Emphasize "${jobElement}" more prominently in your resume`;
        const example = `Consider moving this to a more prominent position or expanding on the impact`;
        const explanation = `Your resume demonstrates "${jobElement}" which is an important job requirement (importance: ${importance.toFixed(2)}). Since you already have relevant experience, consider emphasizing it more prominently to ensure it catches the attention of both ATS systems and human reviewers.`;

        recommendations.push({
          type: 'emphasize',
          element: jobElement,
          importance,
          suggestion,
          example,
          jobRequirementReference,
          explanation
        });
      }
    }
  }

  return recommendations;
}

/**
 * Generate recommendation summary
 * 
 * Creates a concise summary with current score, target, and top recommendations.
 * Includes metadata about the iteration round and scores.
 * 
 * @param matchResult - The match result
 * @param iterationRound - Current iteration round number
 * @param targetScore - Target score to achieve
 * @param topRecommendations - Top priority recommendations
 * @returns Summary text
 */
export function generateSummary(
  matchResult: MatchResult,
  iterationRound: number,
  targetScore: number,
  topRecommendations: Recommendation[],
  themes: JobTheme[] = []
): string {
  const currentScore = matchResult.overallScore;
  const scorePercentage = (currentScore * 100).toFixed(1);
  const targetPercentage = (targetScore * 100).toFixed(1);
  const gap = targetScore - currentScore;
  const gapPercentage = (gap * 100).toFixed(1);

  const criticalGapsCount = matchResult.gaps.filter(g => g.importance > 0.8).length;
  
  let summary = `Iteration ${iterationRound}: Current match score is ${scorePercentage}% (target: ${targetPercentage}%). `;
  
  if (currentScore >= targetScore) {
    summary += `Target achieved! `;
  } else {
    summary += `Gap to target: ${gapPercentage}%. `;
  }

  if (criticalGapsCount > 0) {
    summary += `${criticalGapsCount} critical requirement${criticalGapsCount > 1 ? 's' : ''} missing. `;
  }

  if (topRecommendations.length > 0) {
    summary += `Top ${Math.min(3, topRecommendations.length)} recommendation${topRecommendations.length > 1 ? 's' : ''}: `;
    
    const topThree = topRecommendations.slice(0, 3);
    const recommendationTexts = topThree.map((rec, idx) => 
      `${idx + 1}) ${rec.type === 'add_skill' || rec.type === 'add_experience' ? 'Add' : 'Improve'} "${rec.element}"`
    );
    
    summary += recommendationTexts.join('; ');
  }

  if (themes.length > 0) {
    const topThemes = themes
      .slice()
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3)
      .map(theme => theme.name)
      .join(', ');
    summary += ` Key themes: ${topThemes}.`;
  }

  return summary;
}

/**
 * Generate complete recommendations from match result
 * 
 * Main entry point for recommendation generation. Combines all recommendation
 * types and organizes them by priority.
 * 
 * @param matchResult - The match result from scoring
 * @param matches - Semantic matches (for rewording suggestions)
 * @param iterationRound - Current iteration round number
 * @param targetScore - Target score to achieve
 * @returns Complete recommendations object
 */
export function generateRecommendations(
  matchResult: MatchResult,
  matches: SemanticMatch[],
  iterationRound: number = 1,
  targetScore: number = 0.8,
  themes: JobTheme[] = [],
  parsedResume?: ParsedResume
): Recommendations {
  // Prioritize gaps
  const prioritizedGaps = prioritizeGaps(matchResult.gaps);

  // Generate recommendations for high-importance gaps
  const priorityRecommendations = generateMissingElementRecommendations(
    prioritizedGaps.high
  );

  // Generate recommendations for medium-importance gaps
  const optionalRecommendations = generateMissingElementRecommendations(
    prioritizedGaps.medium
  );

  // Generate rewording suggestions
  const rewordingRecommendations = generateRewordingRecommendations(
    matches,
    matchResult.gaps
  );

  // Generate emphasis/quantification suggestions
  const emphasisRecommendations = generateEmphasisRecommendations(
    matches,
    matchResult.gaps
  );

  // Combine rewording and emphasis recommendations
  const allRewordingRecs = [
    ...rewordingRecommendations,
    ...emphasisRecommendations
  ];

  const deemphasisRecommendations = parsedResume
    ? generateDeemphasisRecommendations(parsedResume, matches, themes)
    : [];

  // Sort all recommendations by theme alignment, then importance
  const themeSort = (a: Recommendation, b: Recommendation) => {
    const aTheme = themeAlignmentScore(a.element, themes);
    const bTheme = themeAlignmentScore(b.element, themes);
    if (aTheme !== bTheme) {
      return bTheme - aTheme;
    }
    return b.importance - a.importance;
  };

  priorityRecommendations.sort(themeSort);
  optionalRecommendations.sort(themeSort);
  allRewordingRecs.sort(themeSort);
  deemphasisRecommendations.sort((a, b) => b.importance - a.importance);

  // Generate summary
  const summary = generateSummary(
    matchResult,
    iterationRound,
    targetScore,
    priorityRecommendations,
    themes
  );

  return {
    summary,
    priority: priorityRecommendations,
    optional: [...optionalRecommendations, ...deemphasisRecommendations],
    rewording: allRewordingRecs,
    metadata: {
      iterationRound,
      currentScore: matchResult.overallScore,
      targetScore,
      themes: themes.length > 0 ? themes : undefined
    }
  };
}

function generateDeemphasisRecommendations(
  parsedResume: ParsedResume,
  matches: SemanticMatch[],
  themes: JobTheme[]
): Recommendation[] {
  if (themes.length === 0) {
    return [];
  }

  const matchedResume = new Set(matches.map(match => match.resumeElement.normalizedText));
  const themeTokens = new Set(
    themes.flatMap(theme => tokenize(theme.name).concat(theme.keywords.flatMap(keyword => tokenize(keyword))))
  );

  const candidates = parsedResume.elements.filter(element => {
    if (matchedResume.has(element.normalizedText)) {
      return false;
    }
    const tokens = tokenize(element.text);
    return tokens.every(token => !themeTokens.has(token));
  });

  return candidates.slice(0, 3).map(element => ({
    type: 'deemphasize',
    element: element.text,
    importance: 0.3,
    suggestion: `De-emphasize "${element.text}" to keep the resume focused on the job's core themes`,
    jobRequirementReference: 'General focus guidance',
    explanation: 'This content does not align closely with the job’s primary themes. Consider shortening or moving it lower to keep the resume concise.'
  }));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length > 2);
}

function themeAlignmentScore(text: string, themes: JobTheme[]): number {
  if (themes.length === 0) {
    return 0;
  }
  const tokens = tokenize(text);
  const themeTokens = new Set(
    themes.flatMap(theme => tokenize(theme.name).concat(theme.keywords.flatMap(keyword => tokenize(keyword))))
  );
  return tokens.some(token => themeTokens.has(token)) ? 1 : 0;
}
