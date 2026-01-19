/**
 * ATS Agent Usage Example
 * 
 * This example demonstrates how to use the ATS Agent to optimize a resume
 * for a specific job posting.
 */

import { startOptimization } from '../src/ats-agent/controller/iterationController';
import { LLMClient } from '../src/shared/llm/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 ATS Agent Usage Example\n');

  // 1. Create LLM client - use OpenAI or Anthropic based on what's available
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
    temperature: 0.3,
  });

  // 2. Define job posting
  const jobPosting = {
    id: 'job-001',
    title: 'Senior Software Engineer',
    company: 'Tech Corp',
    description: `
We are seeking a Senior Software Engineer with strong experience in:
- TypeScript and Node.js (required)
- React and modern frontend frameworks (required)
- AWS cloud services (preferred)
- Microservices architecture (required)
- Test-driven development (nice to have)
- Team leadership and mentoring (preferred)

Responsibilities:
- Design and implement scalable backend services
- Lead technical discussions and code reviews
- Mentor junior developers
- Collaborate with product team on feature planning

Requirements:
- 5+ years of software development experience
- Strong problem-solving skills
- Excellent communication abilities
- Bachelor's degree in Computer Science or related field
    `.trim(),
  };

  // 3. Define resume (can be text or Obsidian reference)
  const resume = {
    id: 'resume-001',
    content: `
John Doe
Software Engineer

SUMMARY
Experienced software developer with 6 years building web applications.
Passionate about clean code and user experience.

EXPERIENCE
Software Engineer at StartupCo (2020-2024)
- Built web applications using JavaScript and React
- Worked with databases and APIs
- Collaborated with design team

Junior Developer at WebAgency (2018-2020)
- Developed websites for clients
- Fixed bugs and added features
- Learned modern development practices

SKILLS
- JavaScript, HTML, CSS
- React, Vue.js
- Node.js, Express
- Git, GitHub
- Problem solving

EDUCATION
Bachelor of Science in Computer Science
State University, 2018
    `.trim(),
    format: 'text' as const,
  };

  // 4. Configure optimization
  const config = {
    targetScore: 0.85, // Target 85% match
    maxIterations: 5,
    earlyStoppingRounds: 2,
    dimensionWeights: {
      keywords: 0.25,
      skills: 0.30,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10,
    },
  };

  try {
    console.log('📋 Job:', jobPosting.title);
    console.log('📄 Resume:', resume.id);
    console.log('🎯 Target Score:', config.targetScore);
    console.log('\n⏳ Starting optimization...\n');

    // 5. Start optimization
    const result = await startOptimization(
      jobPosting,
      resume,
      config,
      llmClient
    );

    // 6. Display results
    console.log('✅ Optimization Complete!\n');
    console.log('📊 Results:');
    console.log(`  Initial Score: ${result.metrics.initialScore.toFixed(2)}`);
    console.log(`  Final Score: ${result.metrics.finalScore.toFixed(2)}`);
    console.log(`  Improvement: +${result.metrics.improvement.toFixed(2)}`);
    console.log(`  Iterations: ${result.metrics.iterationCount}`);
    console.log(`  Reason: ${result.terminationReason}\n`);

    // 7. Show recommendations from last iteration
    if (result.iterations.length > 0) {
      const lastIteration = result.iterations[result.iterations.length - 1];
      
      console.log('💡 Top Recommendations:');
      const allRecs = [
        ...lastIteration.recommendations.priority,
        ...lastIteration.recommendations.optional,
        ...lastIteration.recommendations.rewording
      ];
      
      allRecs.slice(0, 5).forEach((rec, i) => {
        console.log(`\n${i + 1}. ${rec.type.toUpperCase()}`);
        console.log(`   Element: ${rec.element}`);
        console.log(`   Suggestion: ${rec.suggestion}`);
        if (rec.jobRequirementReference) {
          console.log(`   Why: ${rec.jobRequirementReference}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

// Run the example
main().catch(console.error);
