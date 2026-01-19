/**
 * Real Job Posting Parser
 * 
 * This script parses a real job posting using the actual LLM API.
 * 
 * Setup:
 * 1. Set your API key: export ANTHROPIC_API_KEY="your-key-here"
 *    OR: export OPENAI_API_KEY="your-key-here"
 * 
 * 2. Run: npx tsx examples/parse-job-posting.ts
 * 
 * 3. Paste your job posting when prompted, or edit the JOB_POSTING constant below
 */

import { LLMClient } from '../src/shared/llm/client';
import { extractPhrases } from '../src/ats-agent/parser/phraseExtractor';
import * as readline from 'readline';

// You can paste a job posting here, or the script will prompt you
const JOB_POSTING = `
Senior Machine Learning Engineer

We are seeking an experienced Senior Machine Learning Engineer to join our AI team. 
The ideal candidate will have strong experience in Python, machine learning, and 
deep learning frameworks.

Requirements:
- 5+ years of experience in software development
- Strong proficiency in Python and machine learning
- Experience with TensorFlow or PyTorch
- Knowledge of data analysis and statistical modeling
- Excellent problem-solving skills
- Strong communication and teamwork abilities

Preferred Qualifications:
- PhD in Computer Science or related field
- Experience with natural language processing
- Knowledge of cloud platforms (AWS, GCP, or Azure)
- Experience with MLOps and model deployment
- Contributions to open-source projects

Responsibilities:
- Design and implement machine learning models
- Collaborate with data scientists and engineers
- Optimize model performance and scalability
- Mentor junior team members
- Stay current with latest ML research and techniques
`;

async function parseJobPosting(jobText: string) {
  console.log('🔍 Parsing job posting...\n');
  console.log('='.repeat(70));
  console.log('INPUT JOB POSTING:');
  console.log('='.repeat(70));
  console.log(jobText.trim());
  console.log('='.repeat(70));
  console.log();

  // Check for API keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    console.error('❌ Error: No API key found!');
    console.error('');
    console.error('Please set one of the following environment variables:');
    console.error('  export ANTHROPIC_API_KEY="your-key-here"');
    console.error('  export OPENAI_API_KEY="your-key-here"');
    console.error('');
    process.exit(1);
  }

  // Create LLM client
  const provider = anthropicKey ? 'anthropic' : 'openai';
  const apiKey = anthropicKey || openaiKey!;
  
  console.log(`🤖 Using ${provider.toUpperCase()} API\n`);

  const llmClient = new LLMClient({
    provider: provider as 'anthropic' | 'openai',
    apiKey: apiKey
  });

  try {
    // Extract phrases
    const startTime = Date.now();
    const elements = await extractPhrases(jobText, llmClient, 'job');
    const duration = Date.now() - startTime;

    console.log('✅ PARSING COMPLETE!\n');
    console.log('='.repeat(70));
    console.log(`📊 RESULTS: Extracted ${elements.length} unique elements in ${duration}ms`);
    console.log('='.repeat(70));
    console.log();

    // Group elements by type
    const multiWordPhrases = elements.filter(el => el.text.split(/\s+/).length > 1);
    const singleWords = elements.filter(el => el.text.split(/\s+/).length === 1);

    console.log(`📝 Multi-word phrases: ${multiWordPhrases.length}`);
    console.log(`📝 Single words: ${singleWords.length}`);
    console.log();

    // Display all elements
    console.log('='.repeat(70));
    console.log('EXTRACTED ELEMENTS:');
    console.log('='.repeat(70));
    console.log();

    elements.forEach((el, i) => {
      const wordCount = el.text.split(/\s+/).length;
      const icon = wordCount > 1 ? '🔗' : '📌';
      
      console.log(`${icon} ${i + 1}. "${el.text}"`);
      console.log(`   Normalized: "${el.normalizedText}"`);
      console.log(`   Tags: [${el.tags.join(', ')}]`);
      console.log(`   Context: "${el.context.substring(0, 80)}${el.context.length > 80 ? '...' : ''}"`);
      console.log(`   Position: ${el.position.start}-${el.position.end}`);
      console.log();
    });

    console.log('='.repeat(70));
    console.log('✅ Analysis complete!');
    console.log('='.repeat(70));
    console.log();

    // Summary statistics
    console.log('📈 SUMMARY:');
    console.log(`   Total elements: ${elements.length}`);
    console.log(`   Multi-word phrases: ${multiWordPhrases.length}`);
    console.log(`   Single words: ${singleWords.length}`);
    console.log(`   Average tags per element: ${(elements.reduce((sum, el) => sum + el.tags.length, 0) / elements.length).toFixed(1)}`);
    console.log(`   Processing time: ${duration}ms`);
    console.log();

  } catch (error) {
    console.error('❌ Error parsing job posting:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

async function promptForJobPosting(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('📋 Paste your job posting below (press Ctrl+D when done):');
    console.log();

    let input = '';
    rl.on('line', (line) => {
      input += line + '\n';
    });

    rl.on('close', () => {
      resolve(input.trim());
    });
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('ATS AGENT - JOB POSTING PARSER');
  console.log('='.repeat(70));
  console.log();

  let jobText = JOB_POSTING.trim();

  // Check if user wants to input their own job posting
  if (process.argv.includes('--interactive') || process.argv.includes('-i')) {
    jobText = await promptForJobPosting();
    if (!jobText) {
      console.error('❌ No job posting provided');
      process.exit(1);
    }
  }

  await parseJobPosting(jobText);
}

// Run the parser
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
