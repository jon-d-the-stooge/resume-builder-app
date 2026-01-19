/**
 * Phrase Extraction Demo
 * 
 * Demonstrates the LLM-based phrase extraction capabilities.
 * This example shows how multi-word phrases are identified and extracted.
 * 
 * Usage:
 *   Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable
 *   Run: npx ts-node examples/phrase-extraction-demo.ts
 */

import { createLLMClientFromEnv } from '../src/shared/llm/client';
import { extractPhrases, hasMultiWordPhrases, findMultiWordPhrases } from '../src/ats-agent/parser/phraseExtractor';

async function main() {
  console.log('=== Phrase Extraction Demo ===\n');

  try {
    // Create LLM client from environment
    console.log('Initializing LLM client...');
    const llmClient = createLLMClientFromEnv();
    console.log('✓ LLM client initialized\n');

    // Example job description
    const jobDescription = `
      We are seeking a Senior Data Scientist to join our AI team.
      
      Requirements:
      - 5+ years of experience in machine learning and data analysis
      - Strong proficiency in Python and SQL
      - Experience with deep learning frameworks like TensorFlow or PyTorch
      - Excellent project management and team collaboration skills
      - Knowledge of cloud platforms (AWS, Azure, or Google Cloud)
      
      Preferred Qualifications:
      - PhD in Computer Science or related field
      - Experience with natural language processing
      - Track record of leading cross-functional teams
    `;

    console.log('Job Description:');
    console.log(jobDescription);
    console.log('\n' + '='.repeat(60) + '\n');

    // Extract phrases
    console.log('Extracting phrases using LLM...');
    const elements = await extractPhrases(jobDescription, llmClient, 'job');
    console.log(`✓ Extracted ${elements.length} elements\n`);

    // Check for multi-word phrases
    if (hasMultiWordPhrases(elements)) {
      console.log('✓ Multi-word phrases detected!\n');
    }

    // Display extracted elements
    console.log('Extracted Elements:');
    console.log('='.repeat(60));
    
    elements.forEach((el, index) => {
      const wordCount = el.text.trim().split(/\s+/).length;
      const isMultiWord = wordCount > 1;
      
      console.log(`\n${index + 1}. "${el.text}" ${isMultiWord ? '(MULTI-WORD)' : ''}`);
      console.log(`   Normalized: "${el.normalizedText}"`);
      console.log(`   Tags: ${el.tags.join(', ')}`);
      console.log(`   Context: ${el.context.substring(0, 80)}...`);
      console.log(`   Position: ${el.position.start}-${el.position.end}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');

    // Find specific multi-word phrases
    const targetPhrases = [
      'machine learning',
      'data analysis',
      'deep learning',
      'project management',
      'team collaboration',
      'natural language processing',
      'cross-functional teams'
    ];

    console.log('Searching for target multi-word phrases:');
    const found = findMultiWordPhrases(elements, targetPhrases);
    
    if (found.length > 0) {
      console.log(`✓ Found ${found.length} target phrases:\n`);
      found.forEach(el => {
        console.log(`  - "${el.text}"`);
      });
    } else {
      console.log('No target phrases found');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Show cache statistics
    const cacheStats = llmClient.getCacheStats();
    console.log('Cache Statistics:');
    console.log(`  Enabled: ${cacheStats.enabled}`);
    console.log(`  Current size: ${cacheStats.size}`);
    console.log(`  Max entries: ${cacheStats.maxEntries}`);

    console.log('\n✓ Demo completed successfully!');

  } catch (error) {
    console.error('\n✗ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
