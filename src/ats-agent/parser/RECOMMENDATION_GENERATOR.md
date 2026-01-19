# Recommendation Generator

The Recommendation Generator creates actionable feedback for resume improvement based on match results from the scorer engine. It prioritizes gaps by importance and provides specific, concrete suggestions.

## Overview

The recommendation generator is responsible for:
- Prioritizing gaps by importance score
- Generating recommendations for missing elements
- Creating rewording suggestions for partial matches
- Suggesting emphasis and quantification improvements
- Generating concise summaries

## Components

### Gap Prioritization

Gaps are separated into three priority levels based on importance scores:

- **High Priority** (importance >= 0.8): Critical requirements that must be addressed
- **Medium Priority** (0.5 <= importance < 0.8): Important but not critical requirements
- **Low Priority** (importance < 0.5): Nice-to-have requirements

Within each priority level, gaps are sorted by impact (descending).

```typescript
const prioritized = prioritizeGaps(gaps);
// Returns: { high: Gap[], medium: Gap[], low: Gap[] }
```

### Recommendation Types

The generator creates five types of recommendations:

1. **add_skill**: Add a missing technical or soft skill
2. **add_experience**: Add missing experience or accomplishments
3. **reword**: Strengthen partial matches with better phrasing
4. **emphasize**: Make existing matches more prominent
5. **quantify**: Add metrics or specific details to strengthen matches

### Recommendation Generation

#### Missing Elements

For high-importance gaps (>= 0.8), the generator creates specific recommendations:

```typescript
const recommendations = generateMissingElementRecommendations(highPriorityGaps);
```

Each recommendation includes:
- Type (add_skill or add_experience)
- Element text
- Importance score
- Specific suggestion
- Example of how to phrase it

#### Rewording Suggestions

For partial matches (confidence 0.3-0.7), the generator suggests rewording:

```typescript
const rewordingRecs = generateRewordingRecommendations(matches, gaps);
```

Includes before/after examples to show how to strengthen the match.

#### Emphasis and Quantification

For good matches (confidence > 0.7) on important elements (importance >= 0.6):

```typescript
const emphasisRecs = generateEmphasisRecommendations(matches, gaps);
```

Suggests adding metrics or making the element more prominent.

### Summary Generation

Creates a concise summary with:
- Current score and target score
- Gap to target
- Number of critical requirements missing
- Top 3 recommendations

```typescript
const summary = generateSummary(
  matchResult,
  iterationRound,
  targetScore,
  topRecommendations
);
```

## Usage

### Basic Usage

```typescript
import { generateRecommendations } from './recommendationGenerator';

const recommendations = generateRecommendations(
  matchResult,    // From scorer engine
  matches,        // Semantic matches
  1,              // Iteration round
  0.8             // Target score
);

console.log(recommendations.summary);
console.log(`Priority: ${recommendations.priority.length}`);
console.log(`Optional: ${recommendations.optional.length}`);
console.log(`Rewording: ${recommendations.rewording.length}`);
```

### Advanced Usage

```typescript
// Prioritize gaps manually
const prioritized = prioritizeGaps(matchResult.gaps);

// Generate specific recommendation types
const missingRecs = generateMissingElementRecommendations(prioritized.high);
const rewordingRecs = generateRewordingRecommendations(matches, matchResult.gaps);
const emphasisRecs = generateEmphasisRecommendations(matches, matchResult.gaps);

// Generate custom summary
const summary = generateSummary(
  matchResult,
  iterationRound,
  targetScore,
  missingRecs
);
```

## Output Structure

```typescript
interface Recommendations {
  summary: string;
  priority: Recommendation[];      // High-importance gaps
  optional: Recommendation[];      // Medium-importance gaps
  rewording: Recommendation[];     // Rewording and emphasis suggestions
  metadata: {
    iterationRound: number;
    currentScore: number;
    targetScore: number;
  };
}

interface Recommendation {
  type: 'add_skill' | 'add_experience' | 'reword' | 'reframe' | 'emphasize' | 'deemphasize' | 'quantify';
  element: string;
  importance: number;
  suggestion: string;
  example?: string;
  jobRequirementReference: string;  // Reference to specific job requirement
  explanation: string;               // Explanation of why this recommendation is made
}
```

## Examples

See `examples/recommendation-generator-example.ts` for a complete working example.

### Example Output

```
Summary: Iteration 1: Current match score is 55.0% (target: 80.0%). 
Gap to target: 25.0%. 2 critical requirements missing. 
Top 2 recommendations: 1) Add "Python"; 2) Add "machine learning"

Priority Recommendations:
1. [add_skill] Python
   Importance: 0.95
   Job Requirement: Job requirement: "Python" (skill, importance: 0.95)
   Explanation: The job posting lists "Python" as a critical skill requirement. 
                This is likely a must-have qualification for the role. Your resume 
                does not currently demonstrate this qualification.
   Suggestion: Add "Python" to your skills section or demonstrate it through project experience
   Example: "Proficient in Python" or "Developed solutions using Python"

2. [add_skill] machine learning
   Importance: 0.90
   Job Requirement: Job requirement: "machine learning" (skill, importance: 0.90)
   Explanation: The job posting lists "machine learning" as a critical skill requirement. 
                This is likely a must-have qualification for the role. Your resume 
                does not currently demonstrate this qualification.
   Suggestion: Add "machine learning" to your skills section or demonstrate it through project experience
   Example: "Proficient in machine learning" or "Developed solutions using machine learning"

Optional Recommendations:
1. [add_experience] leadership
   Importance: 0.60
   Job Requirement: Job requirement: "leadership" (attribute, importance: 0.60)
   Explanation: The job posting lists "leadership" as an important attribute requirement. 
                Including this will strengthen your application. Your resume does not 
                currently demonstrate this qualification.
   Suggestion: Include experience with "leadership" in your work history or projects

Rewording Recommendations:
1. [reword] programming
   Job Requirement: Job requirement: "programming" (skill, importance: 0.80)
   Explanation: Your resume mentions "coding" which partially matches the job requirement 
                "programming" (50% match). Using more direct language that closely aligns 
                with the job posting will improve your match score and make it clearer to 
                ATS systems that you meet this requirement.
   Suggestion: Strengthen match for "programming" by using more specific or direct language
   Example: Before: "coding"
            After: "programming" or similar phrasing that directly addresses the requirement
```

## Testing

The recommendation generator includes comprehensive tests:

### Property-Based Tests

- **Property 19**: Recommendation Generation - Generates structured recommendations for any match result
- **Property 20**: Gap Prioritization - Lists gaps in descending order of importance
- **Property 21**: High-Importance Gap Inclusion - Includes all gaps with importance >= 0.8 in priority recommendations
- **Property 22**: Rewording Suggestions - Includes rewording suggestions for partial matches (confidence 0.3-0.7)
- **Property 35**: Recommendation Explanations - Every recommendation includes explanation referencing specific job requirement (Task 15.2)

### Unit Tests

- Gap prioritization and sorting
- Missing element recommendation generation
- Rewording suggestion generation
- Summary generation
- Complete recommendation generation

Run tests:
```bash
npm test -- src/tests/ats-agent/recommendationGenerator.test.ts --run
```

## Requirements Validation

The recommendation generator validates the following requirements:

- **Requirement 6.1**: Generate structured summary with current score, target, and top recommendations
- **Requirement 6.2**: Prioritize missing elements by importance scores
- **Requirement 6.3**: Specify which high-importance job requirements are missing
- **Requirement 6.4**: Identify resume elements that could be reworded to better match job requirements
- **Requirement 10.2**: Explain why each recommendation is being made with reference to specific job requirements (Task 15.2)

## Integration

The recommendation generator integrates with:

1. **Scorer Engine**: Receives match results with gaps and strengths
2. **Semantic Analyzer**: Uses semantic matches for rewording suggestions
3. **Iteration Controller**: Provides recommendations for each iteration round
4. **Resume Writer Agent**: Sends recommendations for resume improvement

## Performance

The recommendation generator is designed for efficiency:

- Gap prioritization: O(n log n) where n is the number of gaps
- Recommendation generation: O(n) where n is the number of gaps/matches
- Summary generation: O(1)

Typical performance:
- Process 50 gaps: < 10ms
- Generate complete recommendations: < 50ms

## Error Handling

The generator handles edge cases gracefully:

- Empty gaps array: Returns empty recommendations
- Invalid importance scores (NaN, < 0, > 1): Skips invalid gaps
- No matches: Returns only missing element recommendations
- No high-priority gaps: Returns only optional recommendations

## Future Enhancements

Potential improvements:

1. **Context-aware suggestions**: Use LLM to generate more specific suggestions based on job context
2. **Industry-specific recommendations**: Tailor suggestions to specific industries
3. **Prioritization tuning**: Allow custom importance thresholds
4. **Recommendation ranking**: Use ML to rank recommendations by likelihood of impact
5. **Example library**: Maintain a library of good examples for different element types
