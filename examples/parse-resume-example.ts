/**
 * Example: Parse Resume
 * 
 * Demonstrates how to use the parseResume function to extract structured
 * elements from a resume, including sections, experience, and level indicators.
 * 
 * Requirements: 4.1, 4.3, 4.4 (Resume Parsing)
 * Task: 2.5 (Create parseResume function)
 */

import { LLMClient } from '../src/shared/llm/client';
import { LLMConfig } from '../src/shared/llm/types';
import {
  parseResume,
  getElementsBySection,
  getExperienceElements,
  getExperienceLevelIndicators,
  getParsingStats,
  hasValidSections,
  hasExperienceLevelIndicators
} from '../src/ats-agent/parser/resumeParser';
import { Resume } from '../src/ats-agent/types';

/**
 * Example resume content
 */
const sampleResume: Resume = {
  id: 'example-resume-001',
  content: `
JOHN DOE
Senior Software Engineer

SUMMARY
Experienced software engineer with 8 years of professional experience in full-stack development.
Proven track record of leading teams and delivering high-quality software solutions.
Expertise in modern web technologies, cloud platforms, and agile methodologies.

EXPERIENCE

Senior Software Engineer | Tech Corp | 2020 - Present
- Led team of 5 engineers to deliver microservices architecture migration
- Increased system performance by 40% through optimization and caching strategies
- Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes
- Mentored junior developers and conducted code reviews

Software Engineer | StartupXYZ | 2018 - 2020
- Developed RESTful APIs using Node.js and Express
- Built responsive web applications with React and TypeScript
- Collaborated with product team to define technical requirements
- Reduced bug count by 60% through comprehensive testing

Junior Developer | WebSolutions Inc | 2016 - 2018
- Maintained legacy PHP applications
- Implemented new features using JavaScript and jQuery
- Participated in agile sprint planning and retrospectives

SKILLS
- Programming Languages: JavaScript, TypeScript, Python, Java
- Frameworks: React, Node.js, Express, Django, Spring Boot
- Databases: PostgreSQL, MongoDB, Redis
- Cloud: AWS (EC2, S3, Lambda), Docker, Kubernetes
- Tools: Git, Jenkins, JIRA, Confluence
- Soft Skills: Leadership, Communication, Problem Solving, Team Collaboration

EDUCATION
Bachelor of Science in Computer Science
State University | 2012 - 2016
  `,
  format: 'text',
  metadata: {
    candidateName: 'John Doe',
    lastUpdated: '2024-01-15'
  }
};

/**
 * Main example function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('Resume Parser Example');
  console.log('='.repeat(80));
  console.log();

  // Initialize LLM client
  const llmConfig: LLMConfig = {
    provider: process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_PROVIDER === 'openai' 
      ? 'gpt-4o' 
      : 'claude-3-5-sonnet-20241022',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  };

  if (!llmConfig.apiKey) {
    console.error('Error: ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  const llmClient = new LLMClient(llmConfig);

  try {
    console.log('Parsing resume...');
    console.log(`Resume ID: ${sampleResume.id}`);
    console.log(`Format: ${sampleResume.format}`);
    console.log();

    // Parse the resume
    const parsed = await parseResume(sampleResume, llmClient);

    console.log('✓ Resume parsed successfully!');
    console.log();

    // Display parsing statistics
    console.log('-'.repeat(80));
    console.log('Parsing Statistics');
    console.log('-'.repeat(80));
    
    const stats = getParsingStats(parsed);
    console.log(`Total Elements: ${stats.totalElements}`);
    console.log();
    
    console.log('By Section:');
    console.log(`  Summary: ${stats.bySection.summary}`);
    console.log(`  Experience: ${stats.bySection.experience}`);
    console.log(`  Skills: ${stats.bySection.skills}`);
    console.log(`  Education: ${stats.bySection.education}`);
    console.log(`  Other: ${stats.bySection.other}`);
    console.log();
    
    console.log('By Category:');
    console.log(`  Keywords: ${stats.byCategory.keyword}`);
    console.log(`  Skills: ${stats.byCategory.skill}`);
    console.log(`  Attributes: ${stats.byCategory.attribute}`);
    console.log(`  Experience: ${stats.byCategory.experience}`);
    console.log(`  Concepts: ${stats.byCategory.concept}`);
    console.log();
    
    console.log(`Experience Level Indicators: ${stats.experienceLevelIndicators}`);
    console.log();

    // Display section validation
    console.log('-'.repeat(80));
    console.log('Validation');
    console.log('-'.repeat(80));
    console.log(`Has Valid Sections: ${hasValidSections(parsed) ? '✓' : '✗'}`);
    console.log(`Has Experience Level Indicators: ${hasExperienceLevelIndicators(parsed) ? '✓' : '✗'}`);
    console.log();

    // Display skills section elements
    console.log('-'.repeat(80));
    console.log('Skills Section Elements (first 5)');
    console.log('-'.repeat(80));
    
    const skillsElements = getElementsBySection(parsed, 'skills').slice(0, 5);
    skillsElements.forEach((element, index) => {
      console.log(`${index + 1}. ${element.text}`);
      console.log(`   Normalized: ${element.normalizedText}`);
      console.log(`   Tags: ${element.tags.join(', ')}`);
      console.log(`   Context: ${element.context.substring(0, 60)}...`);
      console.log();
    });

    // Display experience elements
    console.log('-'.repeat(80));
    console.log('Experience Elements (first 5)');
    console.log('-'.repeat(80));
    
    const experienceElements = getExperienceElements(parsed).slice(0, 5);
    experienceElements.forEach((element, index) => {
      console.log(`${index + 1}. ${element.text}`);
      console.log(`   Normalized: ${element.normalizedText}`);
      console.log(`   Tags: ${element.tags.join(', ')}`);
      console.log(`   Context: ${element.context.substring(0, 60)}...`);
      console.log();
    });

    // Display experience level indicators
    console.log('-'.repeat(80));
    console.log('Experience Level Indicators');
    console.log('-'.repeat(80));
    
    const levelIndicators = getExperienceLevelIndicators(parsed);
    levelIndicators.forEach((element, index) => {
      console.log(`${index + 1}. ${element.text}`);
      console.log(`   Normalized: ${element.normalizedText}`);
      console.log(`   Tags: ${element.tags.join(', ')}`);
      console.log(`   Context: ${element.context.substring(0, 60)}...`);
      console.log();
    });

    // Display metadata
    console.log('-'.repeat(80));
    console.log('Metadata');
    console.log('-'.repeat(80));
    console.log(`Resume ID: ${parsed.metadata.resumeId}`);
    console.log(`Format: ${parsed.metadata.format}`);
    console.log(`Element Count: ${parsed.metadata.elementCount}`);
    console.log(`Parsed At: ${parsed.metadata.parsedAt}`);
    
    if (parsed.metadata.sections && Array.isArray(parsed.metadata.sections)) {
      console.log(`Sections Identified: ${parsed.metadata.sections.length}`);
      parsed.metadata.sections.forEach((section: any) => {
        console.log(`  - ${section.type}: ${section.content.substring(0, 40)}...`);
      });
    }
    console.log();

    console.log('='.repeat(80));
    console.log('Example completed successfully!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error parsing resume:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
