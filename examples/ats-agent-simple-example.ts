/**
 * Simple ATS Agent Example
 * 
 * Quick start example showing the minimal code needed to use the ATS Agent.
 */

import { startOptimization } from '../src/ats-agent/controller/iterationController';
import { LLMClient } from '../src/shared/llm/client';
import dotenv from 'dotenv';

dotenv.config();

async function simpleExample() {
  // Create LLM client - use OpenAI or Anthropic based on what's available
  const provider = process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic';
  const apiKey = provider === 'openai' 
    ? process.env.OPENAI_API_KEY 
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()} API key not found in .env file`);
  }

  const llmClient = new LLMClient({
    provider,
    apiKey,
    model: provider === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022',
  });

  // Job posting
  const job = {
    id: 'job-1',
    title: 'Full Stack Developer',
    company: 'Acme Inc',
    description: 'Looking for a Full Stack Developer with React, Node.js, and AWS experience.',
  };

  // Resume
  const resume = {
    id: 'resume-1',
    content: 'Software engineer with 3 years experience in JavaScript and React.',
    format: 'text' as const,
  };

  // Run optimization
  const result = await startOptimization(job, resume, {}, llmClient);

  console.log(`Score: ${result.metrics.initialScore.toFixed(2)} → ${result.metrics.finalScore.toFixed(2)}`);
  console.log(`Iterations: ${result.metrics.iterationCount}`);
  console.log(`Status: ${result.terminationReason}`);
}

simpleExample().catch(console.error);
