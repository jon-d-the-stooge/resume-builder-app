/**
 * Queue Integration Test
 *
 * Tests the job queue system with real job postings and the ATS agent.
 *
 * Usage: npx tsx test-queue-integration.ts
 *
 * Prerequisites:
 * - Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env
 * - Have resume_test_real.pdf in the project root
 */

import { jobQueue, QueueJobInput } from './src/main/jobQueue';
import { ATSAgentOrchestrator, createATSAgent } from './src/ats-agent/orchestrator';
import { fileHandler } from './src/main/fileHandler';
import { LLMClient } from './src/shared/llm/client';
import type { JobPosting, Resume, MatchResult, Recommendations } from './src/ats-agent/types';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Enable debug logging
process.env.LLM_DEBUG = '1';

/**
 * Sample job postings for testing
 */
const SAMPLE_JOBS: QueueJobInput[] = [
  {
    company: 'Google',
    title: 'Senior Software Engineer',
    rawDescription: `
About the Job:
We're looking for a Senior Software Engineer to join our Cloud Platform team.

Requirements:
- 5+ years of experience in software development
- Proficiency in Python, Java, or Go
- Experience with distributed systems and microservices
- Strong understanding of data structures and algorithms

Qualifications:
- BS/MS in Computer Science or related field
- Experience with Kubernetes and containerization
- Background in large-scale systems design
- Excellent problem-solving skills

Nice to have:
- Experience with machine learning infrastructure
- Contributions to open source projects
    `.trim(),
    priority: 2
  },
  {
    company: 'Anthropic',
    title: 'Biological Safety Research Scientist',
    rawDescription: `
About the Role:
We are looking for biological scientists to help build safety and oversight mechanisms for our AI systems.

Requirements:
- PhD in molecular biology, virology, microbiology, biochemistry, or related field
- Extensive experience in scientific computing and data analysis
- Proficiency in programming (Python preferred)
- Deep expertise in modern biology techniques

Qualifications:
- Familiarity with dual-use research concerns and biosecurity frameworks
- Strong analytical and writing skills
- Experience navigating ambiguity
- Ability to explain complex technical concepts to non-technical stakeholders

Preferred:
- Background in AI/ML systems
- Experience with large language models
- Complex project management experience
    `.trim(),
    priority: 1
  },
  {
    company: 'Stripe',
    title: 'Backend Engineer - Payments',
    rawDescription: `
About Stripe:
Join our Payments team to build the financial infrastructure for the internet.

What you'll do:
- Design and implement payment processing systems
- Build APIs that handle millions of transactions
- Ensure reliability and security of financial systems

Requirements:
- 3+ years backend development experience
- Strong knowledge of Ruby, Go, or Java
- Experience with SQL databases and caching systems
- Understanding of distributed systems patterns

Bonus:
- Experience in fintech or payments
- Knowledge of PCI compliance
- Experience with event-driven architectures
    `.trim(),
    priority: 1
  }
];

/**
 * Extracts resume text from PDF file
 */
async function loadResumeFromPdf(pdfPath: string): Promise<Resume> {
  console.log(`Loading resume from: ${pdfPath}`);

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const buffer = fs.readFileSync(pdfPath);
  const file = new File([buffer], path.basename(pdfPath), { type: 'application/pdf' });

  const text = await fileHandler.extractText(file);
  console.log(`Extracted ${text.length} characters from resume`);

  return {
    id: path.basename(pdfPath, '.pdf'),
    content: text,
    format: 'text' as const,
    metadata: {
      source: pdfPath,
      extractedAt: new Date().toISOString()
    }
  };
}

/**
 * Creates an LLM client based on environment configuration
 */
function createLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = provider === 'openai'
    ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()} API key not found. Set ${provider.toUpperCase()}_API_KEY in .env`);
  }

  return new LLMClient({
    provider,
    apiKey,
    model: provider === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022',
  });
}

/**
 * Formats a match result for display
 */
function formatMatchResult(result: MatchResult, recommendations: Recommendations): void {
  console.log('\n' + '='.repeat(60));
  console.log(`MATCH SCORE: ${(result.overallScore * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  // Strengths
  if (result.strengths.length > 0) {
    console.log('\n✓ STRENGTHS:');
    result.strengths.slice(0, 5).forEach(s => {
      console.log(`  - ${s.element.text || s.element.normalizedText} (contribution: ${(s.contribution * 100).toFixed(0)}%)`);
    });
  }

  // Gaps
  if (result.gaps.length > 0) {
    console.log('\n✗ GAPS:');
    result.gaps.slice(0, 5).forEach(g => {
      console.log(`  - ${g.element.text || g.element.normalizedText} (importance: ${g.importance.toFixed(2)})`);
    });
  }

  // Recommendations
  if (recommendations.priority.length > 0) {
    console.log('\n→ PRIORITY RECOMMENDATIONS:');
    recommendations.priority.slice(0, 3).forEach(r => {
      console.log(`  [${r.type.toUpperCase()}] ${r.suggestion}`);
    });
  }

  if (recommendations.summary) {
    console.log('\n📋 SUMMARY:');
    console.log(`  ${recommendations.summary}`);
  }
}

/**
 * Test 1: Direct ATS Analysis (bypasses queue)
 *
 * This test uses the ATS agent directly with a single job posting.
 * Useful for quick validation without queue overhead.
 */
async function testDirectAnalysis(resume: Resume, llmClient: LLMClient): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: DIRECT ATS ANALYSIS');
  console.log('═'.repeat(70));

  const atsAgent = createATSAgent({
    targetScore: 0.8,
    maxIterations: 3,
    earlyStoppingRounds: 2,
    minImprovement: 0.01
  });

  const jobPosting: JobPosting = {
    id: 'direct-test-job',
    title: SAMPLE_JOBS[0].title,
    description: SAMPLE_JOBS[0].rawDescription,
    requirements: '',
    qualifications: '',
    metadata: {
      company: SAMPLE_JOBS[0].company,
      addedAt: new Date().toISOString()
    }
  };

  console.log(`\nAnalyzing resume against: ${jobPosting.title} at ${jobPosting.metadata?.company}`);

  const startTime = Date.now();
  const { matchResult, recommendations } = await atsAgent.analyzeMatch(jobPosting, resume);
  const duration = Date.now() - startTime;

  formatMatchResult(matchResult, recommendations);
  console.log(`\n⏱ Analysis completed in ${(duration / 1000).toFixed(1)}s`);
}

/**
 * Test 2: Queue Operations (without processing)
 *
 * Tests job queue CRUD operations: add, peek, status, remove.
 */
async function testQueueOperations(): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: QUEUE OPERATIONS');
  console.log('═'.repeat(70));

  // Initialize queue (will use in-memory storage for test)
  const testQueue = new (await import('./src/main/jobQueue')).JobQueue({
    persistPath: 'test-queue/queue.json',
    autoSave: false  // Don't persist during test
  });

  // Add jobs to queue
  console.log('\nAdding jobs to queue...');
  for (const jobInput of SAMPLE_JOBS) {
    const job = await testQueue.enqueue(jobInput);
    console.log(`  ✓ Added: ${job.title} at ${job.company} (ID: ${job.id})`);
  }

  // Get queue status
  const status = testQueue.getStatus();
  console.log('\nQueue Status:');
  console.log(`  Total jobs: ${status.totalJobs}`);
  console.log(`  Pending: ${status.pendingJobs}`);
  console.log(`  Processing: ${status.processingJobs}`);
  console.log(`  Completed: ${status.completedJobs}`);

  // Peek at next job
  const nextJob = testQueue.peek();
  if (nextJob) {
    console.log(`\nNext job in queue: ${nextJob.title} (priority: ${nextJob.priority})`);
  }

  // List all jobs
  console.log('\nAll jobs in queue:');
  const allJobs = testQueue.getQueue();
  allJobs.forEach((job, index) => {
    console.log(`  ${index + 1}. [P${job.priority}] ${job.title} at ${job.company}`);
  });

  // Clear queue
  await testQueue.clearAll();
  console.log('\n✓ Queue cleared');
}

/**
 * Test 3: Full Queue Processing Pipeline
 *
 * Processes jobs through the queue using a custom processor
 * (bypasses vault dependency for CLI testing).
 */
async function testQueueProcessing(resume: Resume, llmClient: LLMClient): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: FULL QUEUE PROCESSING PIPELINE');
  console.log('═'.repeat(70));

  const atsAgent = createATSAgent({
    targetScore: 0.75,
    maxIterations: 2,
    earlyStoppingRounds: 1,
    minImprovement: 0.01
  });

  // Create a test queue
  const testQueue = new (await import('./src/main/jobQueue')).JobQueue({
    persistPath: 'test-queue/queue.json',
    autoSave: false
  });

  // Add event listeners
  testQueue.addEventListener((event, job) => {
    if (job) {
      console.log(`  [Event] ${event}: ${job.title}`);
    }
  });

  // Add first two jobs
  console.log('\nEnqueuing jobs...');
  await testQueue.enqueue(SAMPLE_JOBS[0]);
  await testQueue.enqueue(SAMPLE_JOBS[2]);

  // Process jobs one by one
  let processedCount = 0;
  const maxToProcess = 2;

  while (processedCount < maxToProcess) {
    const job = await testQueue.dequeue();
    if (!job) {
      console.log('\nNo more jobs to process');
      break;
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Processing: ${job.title} at ${job.company}`);
    console.log(`${'─'.repeat(50)}`);

    try {
      // Convert to JobPosting format
      const jobPosting: JobPosting = {
        id: job.id,
        title: job.title,
        description: job.rawDescription,
        requirements: job.parsedElements?.requiredSkills?.join('\n') || '',
        qualifications: job.parsedElements?.qualifications?.join('\n') || '',
        metadata: {
          company: job.company,
          sourceUrl: job.sourceUrl,
          addedAt: job.addedAt.toISOString()
        }
      };

      // Run analysis
      const startTime = Date.now();
      const { matchResult, recommendations } = await atsAgent.analyzeMatch(jobPosting, resume);
      const duration = Date.now() - startTime;

      // Mark as completed
      await testQueue.completeJob(job.id, {
        jobId: job.id,
        finalScore: matchResult.overallScore,
        previousScore: 0,
        matchedSkills: matchResult.strengths.map(s => ({
          name: s.element.text || s.element.normalizedText,
          importance: s.contribution
        })),
        missingSkills: matchResult.gaps.map(g => ({
          name: g.element.text || g.element.normalizedText,
          importance: g.importance
        })),
        gaps: matchResult.gaps.map(g => ({
          name: g.element.text || g.element.normalizedText,
          importance: g.importance,
          suggestion: `Address ${g.category}: ${g.element.text}`
        })),
        recommendations: recommendations.priority.map(r => r.suggestion),
        processedAt: new Date()
      });

      formatMatchResult(matchResult, recommendations);
      console.log(`\n⏱ Processing time: ${(duration / 1000).toFixed(1)}s`);
      processedCount++;

    } catch (error) {
      console.error(`\n✗ Processing failed: ${error instanceof Error ? error.message : error}`);
      await testQueue.failJob(job.id, error instanceof Error ? error.message : String(error));
    }
  }

  // Final status
  const finalStatus = testQueue.getStatus();
  console.log('\n' + '─'.repeat(50));
  console.log('FINAL QUEUE STATUS:');
  console.log(`  Completed: ${finalStatus.completedJobs}`);
  console.log(`  Failed: ${finalStatus.failedJobs}`);
  console.log(`  Pending: ${finalStatus.pendingJobs}`);

  // Show statistics
  const stats = testQueue.getStatistics();
  console.log('\nSTATISTICS:');
  console.log(`  Success rate: ${(stats.successRate * 100).toFixed(0)}%`);
  console.log(`  Average processing time: ${(stats.averageProcessingTime / 1000).toFixed(1)}s`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           ATS QUEUE INTEGRATION TEST                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Load resume
  const pdfPath = path.resolve('resume_test_real.pdf');
  let resume: Resume;

  try {
    resume = await loadResumeFromPdf(pdfPath);
  } catch (error) {
    console.error(`\n✗ Failed to load resume: ${error instanceof Error ? error.message : error}`);
    console.log('\nTo run this test, place a PDF resume at: resume_test_real.pdf');
    process.exit(1);
  }

  // Create LLM client
  let llmClient: LLMClient;
  try {
    llmClient = createLLMClient();
    console.log(`\n✓ Using LLM provider: ${process.env.LLM_PROVIDER || 'openai'}`);
  } catch (error) {
    console.error(`\n✗ LLM client error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Run tests
  try {
    // Test 1: Direct analysis
    await testDirectAnalysis(resume, llmClient);

    // Test 2: Queue operations
    await testQueueOperations();

    // Test 3: Full pipeline
    await testQueueProcessing(resume, llmClient);

    console.log('\n' + '═'.repeat(70));
    console.log('ALL TESTS COMPLETED SUCCESSFULLY');
    console.log('═'.repeat(70));

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
