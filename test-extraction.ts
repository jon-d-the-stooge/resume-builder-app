import { fileHandler } from './src/main/fileHandler';
import fs from 'fs';
import path from 'path';

/**
 * Manual test script for text extraction
 * Usage: npx tsx test-extraction.ts <file-path>
 */

async function testExtraction(filePath: string) {
  console.log('='.repeat(60));
  console.log('Text Extraction Test');
  console.log('='.repeat(60));
  console.log(`File: ${filePath}\n`);

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    // Read file and create File object
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const file = new File([buffer], fileName);

    // Validate file
    console.log('Step 1: Validating file...');
    const validation = fileHandler.validateFile(file);
    
    if (!validation.isValid) {
      console.error(`❌ Validation failed: ${validation.errorMessage}`);
      process.exit(1);
    }
    
    console.log(`✓ File is valid`);
    console.log(`  Format: ${validation.format}`);
    console.log(`  Size: ${(validation.fileSize / 1024).toFixed(2)} KB\n`);

    // Extract text
    console.log('Step 2: Extracting text...');
    const startTime = Date.now();
    const text = await fileHandler.extractText(file);
    const duration = Date.now() - startTime;
    
    console.log(`✓ Text extracted successfully in ${duration}ms\n`);

    // Display results
    console.log('='.repeat(60));
    console.log('EXTRACTED TEXT');
    console.log('='.repeat(60));
    console.log(text);
    console.log('='.repeat(60));
    console.log(`\nTotal characters: ${text.length}`);
    console.log(`Total lines: ${text.split('\n').length}`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Get file path from command line
const filePath = process.argv[2];

if (!filePath) {
  console.log('Usage: npx tsx test-extraction.ts <file-path>');
  console.log('\nExamples:');
  console.log('  npx tsx test-extraction.ts resume_template_test.pdf');
  console.log('  npx tsx test-extraction.ts my-resume.docx');
  console.log('  npx tsx test-extraction.ts resume.txt');
  process.exit(1);
}

testExtraction(filePath);
