/**
 * Manual test script for the parser agent
 * 
 * Usage:
 * 1. Set your ANTHROPIC_API_KEY environment variable
 * 2. Run: npx tsx test-parser.ts [path-to-resume]
 * 
 * Examples:
 *   npx tsx test-parser.ts
 *   npx tsx test-parser.ts my-resume.pdf
 *   npx tsx test-parser.ts ~/Documents/resume.docx
 */

import { fileHandler } from './src/main/fileHandler';
import { ParserAgent as ParserAgentImpl } from './src/main/parserAgent';
import * as fs from 'fs';
import * as path from 'path';

async function testParser() {
  console.log('🚀 Testing Resume Parser Agent\n');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('\nTo set it:');
    console.log('  export ANTHROPIC_API_KEY="your-api-key-here"');
    console.log('\nOr create a .env file with:');
    console.log('  ANTHROPIC_API_KEY=your-api-key-here');
    process.exit(1);
  }

  // Create parser agent instance
  const parserAgent = new ParserAgentImpl();

  // Check for resume file - from argument or default locations
  let resumeFile: string | null = null;

  // Check if file path provided as argument
  if (process.argv[2]) {
    const providedPath = process.argv[2];
    if (fs.existsSync(providedPath)) {
      resumeFile = providedPath;
    } else {
      console.error(`❌ Error: File not found: ${providedPath}`);
      process.exit(1);
    }
  } else {
    // Try default locations
    const defaultFiles = ['resume_template_test.pdf', 'xyz.pdf'];
    for (const file of defaultFiles) {
      if (fs.existsSync(file)) {
        resumeFile = file;
        break;
      }
    }
  }

  if (!resumeFile) {
    console.error('❌ Error: No resume file found');
    console.log('\nUsage:');
    console.log('  npx tsx test-parser.ts [path-to-resume]');
    console.log('\nExamples:');
    console.log('  npx tsx test-parser.ts my-resume.pdf');
    console.log('  npx tsx test-parser.ts ~/Documents/resume.docx');
    console.log('\nOr place a resume file in the project root:');
    console.log('  - resume_template_test.pdf');
    console.log('  - xyz.pdf');
    process.exit(1);
  }

  console.log(`📄 Using resume file: ${resumeFile}\n`);

  try {
    // Step 1: Read the file
    console.log('Step 1: Reading file...');
    const fileBuffer = fs.readFileSync(resumeFile);
    const file = new File([fileBuffer], resumeFile, {
      type: resumeFile.endsWith('.pdf') ? 'application/pdf' : 
            resumeFile.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
            'text/plain'
    });

    // Step 2: Validate file
    console.log('Step 2: Validating file...');
    const validation = fileHandler.validateFile(file);
    if (!validation.isValid) {
      console.error(`❌ Validation failed: ${validation.errorMessage}`);
      process.exit(1);
    }
    console.log(`✅ File validated: ${validation.format.toUpperCase()}, ${(validation.fileSize / 1024).toFixed(2)} KB\n`);

    // Step 3: Extract text
    console.log('Step 3: Extracting text from file...');
    const text = await fileHandler.extractText(file);
    console.log(`✅ Extracted ${text.length} characters\n`);
    console.log('First 200 characters:');
    console.log(text.substring(0, 200) + '...\n');

    // Step 4: Parse resume
    console.log('Step 4: Parsing resume with AI...');
    console.log('(This may take 10-30 seconds)\n');
    
    const startTime = Date.now();
    const parsed = await parserAgent.parseResume(text);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Parsing complete in ${duration}s\n`);

    // Step 5: Display results
    console.log('=' .repeat(60));
    console.log('PARSING RESULTS');
    console.log('='.repeat(60));

    console.log(`\n📊 Overall Confidence: ${(parsed.confidence.overall * 100).toFixed(1)}%`);
    
    console.log('\n📈 Section Confidence Scores:');
    parsed.confidence.bySection.forEach((score, section) => {
      console.log(`  - ${section}: ${(score * 100).toFixed(1)}%`);
    });

    if (parsed.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      parsed.warnings.forEach(warning => {
        console.log(`  - [${warning.severity.toUpperCase()}] ${warning.section}: ${warning.message}`);
      });
    }

    console.log(`\n💼 Job Entries: ${parsed.jobEntries.length}`);
    parsed.jobEntries.forEach((job, idx) => {
      console.log(`\n  ${idx + 1}. ${job.title} at ${job.company}`);
      const location = job.location || {};
      console.log(`     Location: ${location.city || 'N/A'}, ${location.state || 'N/A'}`);
      console.log(`     Duration: ${job.duration.start} to ${job.duration.end || 'Present'}`);
      console.log(`     Confidence: ${(job.confidence * 100).toFixed(1)}%`);
      const accomplishments = job.accomplishments || [];
      console.log(`     Accomplishments: ${accomplishments.length}`);
      accomplishments.forEach(acc => {
        console.log(`       - ${acc.description}`);
      });
      const skills = job.skills || [];
      console.log(`     Skills: ${skills.length}`);
      if (skills.length > 0) {
        console.log(`       ${skills.map(s => s.name).join(', ')}`);
      }
    });

    console.log(`\n🎓 Education: ${parsed.education.length}`);
    parsed.education.forEach((edu, idx) => {
      console.log(`  ${idx + 1}. ${edu.degree} - ${edu.institution}`);
      console.log(`     ${edu.dateRange.start} to ${edu.dateRange.end || 'Present'}`);
    });

    console.log(`\n📜 Certifications: ${parsed.certifications.length}`);
    parsed.certifications.forEach((cert, idx) => {
      console.log(`  ${idx + 1}. ${cert.name} - ${cert.issuer}`);
      console.log(`     Issued: ${cert.dateIssued}`);
    });

    console.log(`\n🛠️  Standalone Skills: ${parsed.skills.length}`);
    if (parsed.skills.length > 0) {
      const skillNames = parsed.skills.map(s => s.name).join(', ');
      console.log(`  ${skillNames}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));

    // Optionally save results to JSON
    const outputFile = 'parsed-resume-output.json';
    fs.writeFileSync(outputFile, JSON.stringify({
      ...parsed,
      confidence: {
        overall: parsed.confidence.overall,
        bySection: Array.from(parsed.confidence.bySection.entries())
      }
    }, null, 2));
    console.log(`\n💾 Full results saved to: ${outputFile}`);

  } catch (error) {
    console.error('\n❌ Error during parsing:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the test
testParser();
