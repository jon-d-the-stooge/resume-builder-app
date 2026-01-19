# Enhanced Score Breakdown Documentation

## Overview

The enhanced score breakdown feature (Task 15.1) provides detailed transparency into how match scores are calculated. It shows the contribution from each scoring dimension with weights, and how each matched element contributed to the overall score.

**Requirements**: 10.1 (Performance Metrics and Transparency)

## Features

### 1. Dimension-Level Breakdown

Each scoring dimension (keywords, skills, attributes, experience, level) includes:

- **Score**: The raw score for this dimension (0.0-1.0)
- **Weight**: The weight applied to this dimension in the overall calculation
- **Weighted Score**: The contribution to the overall score (score × weight)
- **Contributions**: Array of individual element contributions

### 2. Element-Level Contributions

For each element in a dimension, the breakdown shows:

- **Element**: The job requirement element
- **Importance**: How critical this requirement is (0.0-1.0)
- **Match Quality**: How well the resume matches this requirement (0.0-1.0)
- **Contribution**: The element's contribution to the dimension score (importance × match quality)
- **Category**: The element category (skill, attribute, experience, etc.)
- **Match Type**: The type of match (exact, synonym, related, semantic) if matched

### 3. Transparency Benefits

The enhanced breakdown helps users understand:

1. **Why they received a particular score** - See exactly which dimensions contributed most
2. **Which requirements they met strongly** - Identify high-contribution matches
3. **Which requirements need improvement** - See gaps with their impact
4. **How much each gap affects their score** - Quantify the impact of missing requirements

## Data Structures

### ScoreBreakdown Interface

```typescript
interface ScoreBreakdown {
  // Legacy fields (backward compatible)
  keywordScore: number;
  skillsScore: number;
  attributesScore: number;
  experienceScore: number;
  levelScore: number;
  weights: {
    keywords: number;
    skills: number;
    attributes: number;
    experience: number;
    level: number;
  };
  
  // Enhanced: detailed breakdown by dimension
  dimensions?: {
    keywords: DimensionBreakdown;
    skills: DimensionBreakdown;
    attributes: DimensionBreakdown;
    experience: DimensionBreakdown;
    level: DimensionBreakdown;
  };
}
```

### DimensionBreakdown Interface

```typescript
interface DimensionBreakdown {
  score: number;              // Raw dimension score (0.0-1.0)
  weight: number;             // Weight applied to this dimension
  weightedScore: number;      // Contribution to overall score
  contributions: ElementContribution[];  // Individual element contributions
}
```

### ElementContribution Interface

```typescript
interface ElementContribution {
  element: Element;           // The job requirement element
  importance: number;         // Importance score (0.0-1.0)
  matchQuality: number;       // Match quality (0.0-1.0)
  contribution: number;       // importance × matchQuality
  category: ElementCategory;  // Element category
  matchType?: string;         // Match type if matched
}
```

## Usage Example

```typescript
import { calculateMatchScore } from './scorer';

// Calculate match score with enhanced breakdown
const result = calculateMatchScore(parsedResume, parsedJob, matches);

// Access overall score
console.log(`Overall Score: ${result.overallScore}`);

// Access dimension breakdowns
if (result.breakdown.dimensions) {
  const skillsDimension = result.breakdown.dimensions.skills;
  
  console.log(`Skills Score: ${skillsDimension.score}`);
  console.log(`Skills Weight: ${skillsDimension.weight}`);
  console.log(`Skills Contribution: ${skillsDimension.weightedScore}`);
  
  // Iterate through individual skill contributions
  for (const contrib of skillsDimension.contributions) {
    console.log(`${contrib.element.text}:`);
    console.log(`  Importance: ${contrib.importance}`);
    console.log(`  Match Quality: ${contrib.matchQuality}`);
    console.log(`  Contribution: ${contrib.contribution}`);
    if (contrib.matchType) {
      console.log(`  Match Type: ${contrib.matchType}`);
    }
  }
}
```

## Calculation Algorithm

### Step 1: Calculate Element Contributions

For each job element:
```
contribution = importance × matchQuality
```

Where:
- `importance`: How critical the requirement is (from job description analysis)
- `matchQuality`: How well the resume matches (from semantic matching)

### Step 2: Group by Dimension

Elements are grouped by category:
- Keywords → keywords dimension
- Skills → skills dimension
- Attributes → attributes dimension
- Experience → experience dimension
- Concepts → keywords dimension

### Step 3: Calculate Dimension Scores

For each dimension:
```
dimensionScore = average(contributions in dimension)
weightedScore = dimensionScore × dimensionWeight
```

### Step 4: Calculate Overall Score

```
overallScore = sum(weightedScore for all dimensions)
```

## Example Output

```
Overall Match Score: 37.2%

SKILLS:
  Score: 46.3%
  Weight: 35%
  Weighted Contribution: 16.2%
  Matched Elements:
    ✓ Python (exact)
       Importance: 95%
       Match Quality: 100%
       Contribution: 95.0%
    ✓ JavaScript (exact)
       Importance: 90%
       Match Quality: 100%
       Contribution: 90.0%
    ✗ TypeScript
       Importance: 70%
       Match Quality: 0%
       Contribution: 0.0%
```

## Backward Compatibility

The enhanced breakdown is **fully backward compatible**:

- The `dimensions` field is optional
- All legacy fields remain unchanged
- Existing code continues to work without modification
- New code can opt-in to detailed breakdowns by checking for `dimensions`

## Testing

The enhanced breakdown is thoroughly tested:

1. **Unit tests** verify:
   - Dimension breakdowns are included in results
   - Contribution details are accurate
   - Weighted scores are calculated correctly
   - Multiple elements in same dimension are tracked
   - Zero contributions for missing elements are shown

2. **Example code** demonstrates:
   - Real-world usage scenarios
   - Output formatting
   - Interpretation of results

See:
- `src/tests/ats-agent/scorer.test.ts` - Unit tests
- `examples/score-breakdown-example.ts` - Usage example

## Future Enhancements

Potential improvements for future iterations:

1. **Visual representation**: Generate charts/graphs from breakdown data
2. **Comparison mode**: Compare breakdowns across multiple resumes
3. **Historical tracking**: Track breakdown changes across iterations
4. **Custom dimensions**: Allow configurable dimension definitions
5. **Export formats**: Export breakdowns to JSON, CSV, or PDF reports
