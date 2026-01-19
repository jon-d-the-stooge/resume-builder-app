/**
 * Manual Test Script for Phrase Extraction
 * 
 * Run with: npx tsx examples/test-phrase-extraction.ts
 * 
 * This script demonstrates the phrase extraction and deduplication
 * functionality with real examples.
 */

import { LLMClient } from '../src/shared/llm/client';
import { extractPhrases, extractPhrasesFromSections } from '../src/ats-agent/parser/phraseExtractor';
import { deduplicateElements, getDeduplicationStats } from '../src/ats-agent/parser/deduplicator';

// Mock LLM client for testing without API calls
class TestLLMClient extends LLMClient {
  constructor() {
    super({ apiKey: 'test-key', provider: 'anthropic' });
  }

  async complete(): Promise<any> {
    // Simulate LLM response with realistic data
    return {
      content: JSON.stringify({
        elements: [
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['technical_skill', 'ai', 'data_science'],
            context: 'Experience with machine learning algorithms and models',
            position: { start: 0, end: 16 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming', 'language', 'backend'],
            context: 'Proficiency in Python programming',
            position: { start: 20, end: 26 }
          },
          {
            text: 'project management',
            normalizedText: 'project management',
            tags: ['soft_skill', 'leadership', 'organization'],
            context: 'Strong project management and team coordination',
            position: { start: 30, end: 48 }
          },
          {
            text: 'data analysis',
            normalizedText: 'data analysis',
            tags: ['technical_skill', 'analytics'],
            context: 'Experience in data analysis and visualization',
            position: { start: 50, end: 63 }
          },
          {
            text: 'React.js',
            normalizedText: 'reactjs',
            tags: ['framework', 'javascript', 'frontend'],
            context: 'Frontend development with React.js',
            position: { start: 65, end: 73 }
          }
        ]
      }),
      model: 'test-model',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
    };
  }

  parseJsonResponse(text: string): any {
    return JSON.parse(text);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('ATS Agent Phrase Extraction Demo');
  console.log('='.repeat(60));
  console.log();

  const llmClient = new TestLLMClient();

  // Test 1: Basic phrase extraction
  console.log('📝 Test 1: Basic Phrase Extraction');
  console.log('-'.repeat(60));
  
  const jobDescription = `
    We are looking for a Senior Software Engineer with experience in
    machine learning and Python. Must have strong project management
    skills and experience with data analysis. React.js knowledge is a plus.
  `;

  console.log('Input text:');
  console.log(jobDescription.trim());
  console.log();

  const elements = await extractPhrases(jobDescription, llmClient, 'job');

  console.log(`✅ Extracted ${elements.length} elements:`);
  elements.forEach((el, i) => {
    console.log(`\n${i + 1}. "${el.text}"`);
    console.log(`   Normalized: "${el.normalizedText}"`);
    console.log(`   Tags: [${el.tags.join(', ')}]`);
    console.log(`   Context: "${el.context}"`);
    console.log(`   Position: ${el.position.start}-${el.position.end}`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log();

  // Test 2: Multi-section extraction with deduplication
  console.log('📝 Test 2: Multi-Section Extraction with Deduplication');
  console.log('-'.repeat(60));

  const sections = [
    {
      label: 'Requirements',
      text: 'Python and machine learning experience required'
    },
    {
      label: 'Qualifications',
      text: 'Strong Python programming skills and data analysis'
    },
    {
      label: 'Nice to Have',
      text: 'Experience with machine learning frameworks'
    }
  ];

  console.log('Input sections:');
  sections.forEach(s => {
    console.log(`  [${s.label}] ${s.text}`);
  });
  console.log();

  const sectionElements = await extractPhrasesFromSections(sections, llmClient, 'job');

  console.log(`✅ Extracted ${sectionElements.length} unique elements (after deduplication):`);
  sectionElements.forEach((el, i) => {
    console.log(`\n${i + 1}. "${el.text}"`);
    console.log(`   Tags: [${el.tags.join(', ')}]`);
    console.log(`   Context: "${el.context}"`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log();

  // Test 3: Deduplication demonstration
  console.log('📝 Test 3: Deduplication Statistics');
  console.log('-'.repeat(60));

  // Create duplicate elements manually
  const duplicateElements = [
    {
      text: 'Python',
      normalizedText: 'python',
      tags: ['programming'],
      context: 'Python required',
      position: { start: 0, end: 6 }
    },
    {
      text: 'Python',
      normalizedText: 'python',
      tags: ['language'],
      context: 'Python preferred',
      position: { start: 10, end: 16 }
    },
    {
      text: 'Java',
      normalizedText: 'java',
      tags: ['programming'],
      context: 'Java experience',
      position: { start: 20, end: 24 }
    },
    {
      text: 'Python',
      normalizedText: 'python',
      tags: ['scripting'],
      context: 'Python scripting',
      position: { start: 30, end: 36 }
    }
  ];

  console.log(`Original elements: ${duplicateElements.length}`);
  duplicateElements.forEach((el, i) => {
    console.log(`  ${i + 1}. ${el.text} - ${el.context}`);
  });
  console.log();

  const deduplicated = deduplicateElements(duplicateElements);
  const stats = getDeduplicationStats(duplicateElements, deduplicated);

  console.log(`After deduplication: ${deduplicated.length} elements`);
  console.log();
  console.log('📊 Statistics:');
  console.log(`  Original count: ${stats.originalCount}`);
  console.log(`  Deduplicated count: ${stats.deduplicatedCount}`);
  console.log(`  Duplicates removed: ${stats.duplicatesRemoved}`);
  console.log(`  Reduction: ${stats.reductionPercentage.toFixed(1)}%`);
  console.log();

  console.log('Consolidated elements:');
  deduplicated.forEach((el, i) => {
    console.log(`\n${i + 1}. "${el.text}"`);
    console.log(`   Tags: [${el.tags.join(', ')}]`);
    console.log(`   Context: "${el.context}"`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log('✅ Demo completed successfully!');
  console.log('='.repeat(60));
}

// Run the demo
main().catch(error => {
  console.error('❌ Error running demo:', error);
  process.exit(1);
});
