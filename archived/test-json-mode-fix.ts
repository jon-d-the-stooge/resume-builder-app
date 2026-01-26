/**
 * Test to verify JSON mode fix for malformed JSON responses
 */
import { LLMClient } from './src/shared/llm/client';
import { parseResume } from './src/ats-agent/parser/resumeParser';
import dotenv from 'dotenv';

dotenv.config();

async function testJsonModeFix() {
  console.log('Testing JSON mode fix for malformed JSON...\n');

  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o', // Use gpt-4o which supports JSON mode
  });

  // Test with a resume that has special characters that could break JSON
  const problematicResume = {
    id: 'test-resume',
    content: `
John "The Developer" O'Brien
Senior Software Engineer

SUMMARY
I'm a developer with 5+ years experience. I've worked on "cutting-edge" projects.
My motto: "Code hard, debug harder!"

EXPERIENCE
Software Engineer at Tech Corp (2020-2024)
- Built systems that handle 1M+ requests/day
- Improved performance by 50% using "advanced" techniques
- Led team of 5 engineers on "mission-critical" projects
- Quote from manager: "Best developer I've worked with"

SKILLS
- JavaScript, TypeScript, Python
- React, Node.js, "modern" frameworks
- AWS, Docker, Kubernetes
- Problem solving & "out-of-the-box" thinking
    `.trim(),
    format: 'text' as const,
  };

  try {
    console.log('Parsing resume with special characters...');
    const result = await parseResume(problematicResume, llmClient);
    
    console.log('✅ SUCCESS! Resume parsed without JSON errors');
    console.log(`   Found ${result.elements.length} elements`);
    console.log(`   Sections: ${result.metadata.sections?.length || 0}`);
    
    // Show a few elements to verify parsing worked
    console.log('\nSample elements:');
    result.elements.slice(0, 5).forEach((el, i) => {
      console.log(`   ${i + 1}. ${el.text} (${(el as any).category})`);
    });
    
  } catch (error) {
    console.error('❌ FAILED! Still getting JSON parsing errors:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testJsonModeFix().catch(console.error);
