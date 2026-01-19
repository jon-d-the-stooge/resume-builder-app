/**
 * Example: Parse Job Description
 * 
 * This example demonstrates how to use the parseJobDescription function
 * to extract structured elements with importance scores from a job posting.
 */

import { parseJobDescription, getCriticalElements, getParsingStats } from '../src/ats-agent/parser/jobParser';
import { createLLMClientFromEnv } from '../src/shared/llm/client';
import { JobPosting } from '../src/ats-agent/types';

async function main() {
  console.log('=== Job Description Parser Example ===\n');

  // Create LLM client from environment variables
  // Requires ANTHROPIC_API_KEY or OPENAI_API_KEY to be set
  const llmClient = createLLMClientFromEnv();

  // Example job posting
  const jobPosting: JobPosting = {
    id: 'job-001',
    title: 'Senior Machine Learning Engineer',
    description: `
      We are seeking a talented Senior Machine Learning Engineer to join our AI team.
      You will work on cutting-edge projects involving natural language processing,
      computer vision, and recommendation systems.
      
      Responsibilities:
      - Design and implement machine learning models
      - Collaborate with data scientists and software engineers
      - Optimize model performance and scalability
      - Deploy models to production environments
    `,
    requirements: `
      Required Skills:
      - Python programming is required
      - Experience with TensorFlow or PyTorch is essential
      - Strong understanding of machine learning algorithms
      - SQL and database knowledge is required
      
      Preferred Skills:
      - Experience with cloud platforms (AWS, GCP, or Azure) is preferred
      - Knowledge of Docker and Kubernetes is a plus
      - Familiarity with MLOps practices is nice to have
    `,
    qualifications: `
      - Master's degree in Computer Science, Statistics, or related field required
      - 5+ years of experience in machine learning
      - Strong communication and teamwork skills
      - Experience leading technical projects is a bonus
    `
  };

  console.log('Parsing job posting:', jobPosting.title);
  console.log('Job ID:', jobPosting.id);
  console.log('\n--- Parsing... ---\n');

  try {
    // Parse the job description
    const parsedJob = await parseJobDescription(jobPosting, llmClient);

    console.log('✓ Parsing completed successfully!\n');

    // Display parsing statistics
    const stats = getParsingStats(parsedJob);
    console.log('=== Parsing Statistics ===');
    console.log(`Total elements extracted: ${stats.totalElements}`);
    console.log(`Critical elements (importance >= 0.8): ${stats.criticalElements}`);
    console.log(`High importance (0.6-0.8): ${stats.highImportance}`);
    console.log(`Medium importance (0.4-0.6): ${stats.mediumImportance}`);
    console.log(`Low importance (< 0.4): ${stats.lowImportance}`);
    console.log(`Average importance: ${stats.averageImportance.toFixed(2)}\n`);

    // Display critical elements (most important requirements)
    const criticalElements = getCriticalElements(parsedJob);
    console.log('=== Critical Elements (Importance >= 0.8) ===');
    if (criticalElements.length > 0) {
      criticalElements.forEach((el, index) => {
        const importance = (el as any).importance;
        console.log(`${index + 1}. "${el.text}" (importance: ${importance.toFixed(2)})`);
        console.log(`   Context: ${el.context.substring(0, 80)}...`);
        console.log(`   Tags: ${el.tags.join(', ')}\n`);
      });
    } else {
      console.log('No critical elements found.\n');
    }

    // Display all elements sorted by importance
    console.log('=== All Elements (Sorted by Importance) ===');
    const sortedElements = [...parsedJob.elements].sort((a, b) => {
      const impA = (a as any).importance || 0;
      const impB = (b as any).importance || 0;
      return impB - impA; // Descending order
    });

    sortedElements.slice(0, 10).forEach((el, index) => {
      const importance = (el as any).importance || 0;
      const category = (el as any).category || 'unknown';
      console.log(`${index + 1}. "${el.text}" [${category}]`);
      console.log(`   Importance: ${importance.toFixed(2)}`);
      console.log(`   Tags: ${el.tags.join(', ')}`);
      console.log(`   Context: ${el.context.substring(0, 60)}...`);
      console.log();
    });

    // Display metadata
    console.log('=== Metadata ===');
    console.log(JSON.stringify(parsedJob.metadata, null, 2));

  } catch (error) {
    console.error('Error parsing job description:', error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
