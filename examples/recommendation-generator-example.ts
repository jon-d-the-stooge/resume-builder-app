/**
 * Example: Recommendation Generator
 * 
 * Demonstrates how to use the recommendation generator to create
 * actionable feedback for resume improvement.
 */

import {
  generateRecommendations,
  prioritizeGaps
} from '../src/ats-agent/parser/recommendationGenerator';
import {
  MatchResult,
  Gap,
  SemanticMatch,
  Element
} from '../src/ats-agent/types';

// Example: Create a match result with gaps
const exampleElement1: Element = {
  text: 'Python',
  normalizedText: 'python',
  tags: ['programming', 'technical_skill'],
  context: 'Required: Python programming experience',
  position: { start: 10, end: 16 }
};

const exampleElement2: Element = {
  text: 'machine learning',
  normalizedText: 'machine learning',
  tags: ['technical_skill', 'ai'],
  context: 'Must have: machine learning expertise',
  position: { start: 11, end: 27 }
};

const exampleElement3: Element = {
  text: 'leadership',
  normalizedText: 'leadership',
  tags: ['soft_skill', 'management'],
  context: 'Preferred: leadership experience',
  position: { start: 11, end: 21 }
};

const gaps: Gap[] = [
  {
    element: exampleElement1,
    importance: 0.95,
    category: 'skill',
    impact: 0.95
  },
  {
    element: exampleElement2,
    importance: 0.9,
    category: 'skill',
    impact: 0.9
  },
  {
    element: exampleElement3,
    importance: 0.6,
    category: 'attribute',
    impact: 0.6
  }
];

const matchResult: MatchResult = {
  overallScore: 0.55,
  breakdown: {
    keywordScore: 0.5,
    skillsScore: 0.4,
    attributesScore: 0.6,
    experienceScore: 0.7,
    levelScore: 0.6,
    weights: {
      keywords: 0.20,
      skills: 0.35,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10
    }
  },
  gaps,
  strengths: []
};

// Example partial match for rewording suggestion
const partialMatch: SemanticMatch = {
  resumeElement: {
    text: 'coding',
    normalizedText: 'coding',
    tags: ['programming'],
    context: 'Experience with coding',
    position: { start: 16, end: 22 }
  },
  jobElement: {
    text: 'programming',
    normalizedText: 'programming',
    tags: ['programming'],
    context: 'Required: programming skills',
    position: { start: 10, end: 21 }
  },
  matchType: 'related',
  confidence: 0.5
};

const matches: SemanticMatch[] = [partialMatch];

// Generate recommendations
console.log('=== Recommendation Generator Example ===\n');

// 1. Prioritize gaps
console.log('1. Gap Prioritization:');
const prioritized = prioritizeGaps(gaps);
console.log(`   High priority gaps: ${prioritized.high.length}`);
console.log(`   Medium priority gaps: ${prioritized.medium.length}`);
console.log(`   Low priority gaps: ${prioritized.low.length}`);
console.log();

// 2. Generate complete recommendations
console.log('2. Complete Recommendations:');
const recommendations = generateRecommendations(
  matchResult,
  matches,
  1, // iteration round
  0.8 // target score
);

console.log(`   Summary: ${recommendations.summary}`);
console.log();

console.log(`   Priority Recommendations (${recommendations.priority.length}):`);
recommendations.priority.forEach((rec, idx) => {
  console.log(`     ${idx + 1}. [${rec.type}] ${rec.element}`);
  console.log(`        Importance: ${rec.importance.toFixed(2)}`);
  console.log(`        Job Requirement: ${rec.jobRequirementReference}`);
  console.log(`        Explanation: ${rec.explanation}`);
  console.log(`        Suggestion: ${rec.suggestion}`);
  if (rec.example) {
    console.log(`        Example: ${rec.example}`);
  }
  console.log();
});

console.log(`   Optional Recommendations (${recommendations.optional.length}):`);
recommendations.optional.forEach((rec, idx) => {
  console.log(`     ${idx + 1}. [${rec.type}] ${rec.element}`);
  console.log(`        Importance: ${rec.importance.toFixed(2)}`);
  console.log();
});

console.log(`   Rewording Recommendations (${recommendations.rewording.length}):`);
recommendations.rewording.forEach((rec, idx) => {
  console.log(`     ${idx + 1}. [${rec.type}] ${rec.element}`);
  console.log(`        Job Requirement: ${rec.jobRequirementReference}`);
  console.log(`        Explanation: ${rec.explanation}`);
  console.log(`        Suggestion: ${rec.suggestion}`);
  if (rec.example) {
    console.log(`        Example: ${rec.example}`);
  }
  console.log();
});

console.log('   Metadata:');
console.log(`     Iteration Round: ${recommendations.metadata.iterationRound}`);
console.log(`     Current Score: ${(recommendations.metadata.currentScore * 100).toFixed(1)}%`);
console.log(`     Target Score: ${(recommendations.metadata.targetScore * 100).toFixed(1)}%`);

