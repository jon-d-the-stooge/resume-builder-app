/**
 * Example: Enhanced Score Breakdown with Detailed Contribution Tracking
 * 
 * This example demonstrates the enhanced score breakdown feature (Task 15.1)
 * that shows how each matched element contributes to the overall score.
 * 
 * Requirements: 10.1 (Performance Metrics and Transparency)
 */

import {
  ParsedJob,
  ParsedResume,
  SemanticMatch,
  Element
} from '../src/ats-agent/types';
import { calculateMatchScore } from '../src/ats-agent/parser/scorer';

// Example resume with multiple skills
const resumeElements: Element[] = [
  {
    text: 'Python',
    normalizedText: 'python',
    tags: ['programming', 'backend'],
    context: 'Expert Python developer with 5 years experience',
    position: { start: 0, end: 6 }
  },
  {
    text: 'JavaScript',
    normalizedText: 'javascript',
    tags: ['programming', 'frontend'],
    context: 'Proficient in JavaScript and modern frameworks',
    position: { start: 0, end: 10 }
  },
  {
    text: 'React',
    normalizedText: 'react',
    tags: ['framework', 'frontend'],
    context: 'Built multiple React applications',
    position: { start: 0, end: 5 }
  },
  {
    text: 'leadership',
    normalizedText: 'leadership',
    tags: ['soft_skill', 'management'],
    context: 'Led team of 5 developers',
    position: { start: 0, end: 10 }
  }
];

const parsedResume: ParsedResume = {
  elements: resumeElements,
  rawText: 'Expert Python developer with JavaScript and React experience. Led team of 5 developers.',
  metadata: {}
};

// Example job posting with importance-weighted requirements
const jobElements: Element[] = [
  {
    text: 'Python',
    normalizedText: 'python',
    tags: ['programming', 'backend'],
    context: 'Python experience is required',
    position: { start: 0, end: 6 },
    importance: 0.95,
    category: 'skill'
  } as any,
  {
    text: 'JavaScript',
    normalizedText: 'javascript',
    tags: ['programming', 'frontend'],
    context: 'JavaScript is required',
    position: { start: 0, end: 10 },
    importance: 0.9,
    category: 'skill'
  } as any,
  {
    text: 'TypeScript',
    normalizedText: 'typescript',
    tags: ['programming', 'frontend'],
    context: 'TypeScript is strongly preferred',
    position: { start: 0, end: 10 },
    importance: 0.7,
    category: 'skill'
  } as any,
  {
    text: 'Docker',
    normalizedText: 'docker',
    tags: ['tools', 'devops'],
    context: 'Docker experience is nice to have',
    position: { start: 0, end: 6 },
    importance: 0.3,
    category: 'skill'
  } as any,
  {
    text: 'leadership',
    normalizedText: 'leadership',
    tags: ['soft_skill', 'management'],
    context: 'Leadership skills required',
    position: { start: 0, end: 10 },
    importance: 0.8,
    category: 'attribute'
  } as any
];

const parsedJob: ParsedJob = {
  elements: jobElements,
  rawText: 'Python and JavaScript required. TypeScript strongly preferred. Docker nice to have. Leadership skills required.',
  metadata: {}
};

// Semantic matches between resume and job
const matches: SemanticMatch[] = [
  {
    resumeElement: resumeElements[0],
    jobElement: jobElements[0],
    matchType: 'exact',
    confidence: 1.0
  },
  {
    resumeElement: resumeElements[1],
    jobElement: jobElements[1],
    matchType: 'exact',
    confidence: 1.0
  },
  {
    resumeElement: resumeElements[3],
    jobElement: jobElements[4],
    matchType: 'exact',
    confidence: 1.0
  }
  // Note: No matches for TypeScript and Docker (gaps)
];

// Calculate match score with enhanced breakdown
const result = calculateMatchScore(parsedResume, parsedJob, matches);

console.log('=== Enhanced Score Breakdown Example ===\n');

console.log(`Overall Match Score: ${(result.overallScore * 100).toFixed(1)}%\n`);

console.log('=== Dimension Breakdown ===\n');

if (result.breakdown.dimensions) {
  const dimensions = result.breakdown.dimensions;

  // Display each dimension with its contribution
  for (const [dimName, dimData] of Object.entries(dimensions)) {
    console.log(`${dimName.toUpperCase()}:`);
    console.log(`  Score: ${(dimData.score * 100).toFixed(1)}%`);
    console.log(`  Weight: ${(dimData.weight * 100).toFixed(0)}%`);
    console.log(`  Weighted Contribution: ${(dimData.weightedScore * 100).toFixed(1)}%`);
    
    if (dimData.contributions.length > 0) {
      console.log(`  Matched Elements:`);
      for (const contrib of dimData.contributions) {
        const matchStatus = contrib.matchQuality > 0 ? '✓' : '✗';
        const matchTypeStr = contrib.matchType ? ` (${contrib.matchType})` : '';
        console.log(`    ${matchStatus} ${contrib.element.text}${matchTypeStr}`);
        console.log(`       Importance: ${(contrib.importance * 100).toFixed(0)}%`);
        console.log(`       Match Quality: ${(contrib.matchQuality * 100).toFixed(0)}%`);
        console.log(`       Contribution: ${(contrib.contribution * 100).toFixed(1)}%`);
      }
    } else {
      console.log(`  No elements in this dimension`);
    }
    console.log();
  }
}

console.log('=== Gaps (Missing or Weak Matches) ===\n');
for (const gap of result.gaps.slice(0, 5)) {
  console.log(`✗ ${gap.element.text}`);
  console.log(`  Importance: ${(gap.importance * 100).toFixed(0)}%`);
  console.log(`  Category: ${gap.category}`);
  console.log(`  Impact on Score: -${(gap.impact * 100).toFixed(1)}%`);
  console.log();
}

console.log('=== Strengths (High-Quality Matches) ===\n');
for (const strength of result.strengths.slice(0, 5)) {
  console.log(`✓ ${strength.element.text}`);
  console.log(`  Match Type: ${strength.matchType}`);
  console.log(`  Contribution: +${(strength.contribution * 100).toFixed(1)}%`);
  console.log();
}

console.log('=== Summary ===\n');
console.log(`This enhanced breakdown shows:`);
console.log(`1. How each dimension (skills, attributes, etc.) contributes to the overall score`);
console.log(`2. The weight applied to each dimension`);
console.log(`3. Individual element contributions within each dimension`);
console.log(`4. Match quality and type for each matched element`);
console.log(`5. Clear identification of gaps and their impact`);
console.log(`\nThis transparency helps users understand:`);
console.log(`- Why they received a particular score`);
console.log(`- Which requirements they met strongly`);
console.log(`- Which requirements need improvement`);
console.log(`- How much each gap affects their overall score`);
