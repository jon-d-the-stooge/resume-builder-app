import { FileHandlerImpl } from './src/main/fileHandler';

const fileHandler = new FileHandlerImpl();

// Helper to create a mock File
function createTestFile(name: string, size: number): File {
  const blob = new Blob(['test content'], { type: 'text/plain' });
  const file = new File([blob], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size, writable: false });
  return file;
}

// Test valid PDF
console.log('\n=== Test 1: Valid PDF (5MB) ===');
const validPdf = createTestFile('resume.pdf', 5 * 1024 * 1024);
console.log(fileHandler.validateFile(validPdf));

// Test valid DOCX
console.log('\n=== Test 2: Valid DOCX (2MB) ===');
const validDocx = createTestFile('resume.docx', 2 * 1024 * 1024);
console.log(fileHandler.validateFile(validDocx));

// Test invalid format
console.log('\n=== Test 3: Invalid format (.jpg) ===');
const invalidFormat = createTestFile('photo.jpg', 1 * 1024 * 1024);
console.log(fileHandler.validateFile(invalidFormat));

// Test oversized file
console.log('\n=== Test 4: Oversized PDF (15MB) ===');
const oversized = createTestFile('large.pdf', 15 * 1024 * 1024);
console.log(fileHandler.validateFile(oversized));

// Test boundary (exactly 10MB)
console.log('\n=== Test 5: Exactly 10MB ===');
const boundary = createTestFile('boundary.pdf', 10 * 1024 * 1024);
console.log(fileHandler.validateFile(boundary));

// Test supported formats
console.log('\n=== Supported Formats ===');
console.log(fileHandler.getSupportedFormats());
