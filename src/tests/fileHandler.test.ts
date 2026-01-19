import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FileHandlerImpl } from '../main/fileHandler';
import { FileFormat } from '../types';
import fs from 'fs';
import path from 'path';

describe('FileHandler - Property-Based Tests', () => {
  const fileHandler = new FileHandlerImpl();

  // Helper to create a mock File object
  function createMockFile(name: string, size: number, content: string = ''): File {
    const blob = new Blob([content], { type: 'text/plain' });
    // Create a File-like object that matches the File interface
    return new File([blob], name, { type: 'text/plain' });
  }

  describe('Feature: resume-content-ingestion, Property 1: Valid file formats are accepted', () => {
    it('should accept all files with supported formats under 10MB', () => {
      fc.assert(
        fc.property(
          fc.record({
            format: fc.constantFrom('pdf', 'docx', 'doc', 'txt'),
            size: fc.integer({ min: 1, max: 10 * 1024 * 1024 - 1 }),
            baseName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('.'))
          }),
          ({ format, size, baseName }) => {
            const fileName = `${baseName}.${format}`;
            const file = createMockFile(fileName, size);
            
            // Override the size property since File constructor doesn't set it from blob
            Object.defineProperty(file, 'size', { value: size, writable: false });
            
            const result = fileHandler.validateFile(file);
            
            expect(result.isValid).toBe(true);
            expect(result.errorMessage).toBeUndefined();
            expect(result.fileSize).toBe(size);
            expect([FileFormat.PDF, FileFormat.DOCX, FileFormat.TXT]).toContain(result.format);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: resume-content-ingestion, Property 2: Invalid file formats are rejected', () => {
    it('should reject all files with unsupported formats', () => {
      fc.assert(
        fc.property(
          fc.record({
            // Generate invalid extensions that are not pdf, docx, doc, or txt
            extension: fc.string({ minLength: 2, maxLength: 5 })
              .filter(ext => !['pdf', 'docx', 'doc', 'txt'].includes(ext.toLowerCase())),
            size: fc.integer({ min: 1, max: 10 * 1024 * 1024 - 1 }),
            baseName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('.'))
          }),
          ({ extension, size, baseName }) => {
            const fileName = `${baseName}.${extension}`;
            const file = createMockFile(fileName, size);
            
            Object.defineProperty(file, 'size', { value: size, writable: false });
            
            const result = fileHandler.validateFile(file);
            
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toBeDefined();
            expect(result.errorMessage).toContain('Unsupported file format');
            expect(result.fileSize).toBe(size);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: resume-content-ingestion, Property 3: Oversized files are rejected', () => {
    it('should reject all files with size >= 10MB', () => {
      fc.assert(
        fc.property(
          fc.record({
            format: fc.constantFrom('pdf', 'docx', 'doc', 'txt'),
            // Generate sizes from 10MB to 50MB
            size: fc.integer({ min: 10 * 1024 * 1024, max: 50 * 1024 * 1024 }),
            baseName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('.'))
          }),
          ({ format, size, baseName }) => {
            const fileName = `${baseName}.${format}`;
            const file = createMockFile(fileName, size);
            
            Object.defineProperty(file, 'size', { value: size, writable: false });
            
            const result = fileHandler.validateFile(file);
            
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toBeDefined();
            expect(result.errorMessage).toContain('exceeds the maximum limit');
            expect(result.fileSize).toBe(size);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Additional unit tests for edge cases
  describe('Edge Cases', () => {
    it('should handle files with uppercase extensions', () => {
      const file = createMockFile('resume.PDF', 1000);
      Object.defineProperty(file, 'size', { value: 1000, writable: false });
      
      const result = fileHandler.validateFile(file);
      expect(result.isValid).toBe(true);
      expect(result.format).toBe(FileFormat.PDF);
    });

    it('should handle files with mixed case extensions', () => {
      const file = createMockFile('resume.DocX', 1000);
      Object.defineProperty(file, 'size', { value: 1000, writable: false });
      
      const result = fileHandler.validateFile(file);
      expect(result.isValid).toBe(true);
      expect(result.format).toBe(FileFormat.DOCX);
    });

    it('should handle files at exactly 10MB boundary', () => {
      const exactSize = 10 * 1024 * 1024;
      const file = createMockFile('resume.pdf', exactSize);
      Object.defineProperty(file, 'size', { value: exactSize, writable: false });
      
      const result = fileHandler.validateFile(file);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('exceeds the maximum limit');
    });

    it('should handle files at just under 10MB', () => {
      const justUnder = 10 * 1024 * 1024 - 1;
      const file = createMockFile('resume.pdf', justUnder);
      Object.defineProperty(file, 'size', { value: justUnder, writable: false });
      
      const result = fileHandler.validateFile(file);
      expect(result.isValid).toBe(true);
    });

    it('should return supported formats list', () => {
      const formats = fileHandler.getSupportedFormats();
      expect(formats).toEqual(['PDF', 'DOCX', 'TXT']);
    });
  });

  describe('Text Extraction', () => {
    describe('TXT file extraction', () => {
      it('should extract text from plain text files', async () => {
        const content = 'This is a test resume.\nJohn Doe\nSoftware Engineer';
        const file = createMockFile('resume.txt', content.length, content);
        Object.defineProperty(file, 'size', { value: content.length, writable: false });
        
        const extractedText = await fileHandler.extractText(file);
        expect(extractedText).toBe(content);
      });

      it('should handle empty text files', async () => {
        const file = createMockFile('empty.txt', 0, '');
        Object.defineProperty(file, 'size', { value: 0, writable: false });
        
        const extractedText = await fileHandler.extractText(file);
        expect(extractedText).toBe('');
      });

      it('should handle text files with special characters', async () => {
        const content = 'Resume with special chars: @#$%^&*()_+-=[]{}|;:,.<>?';
        const file = createMockFile('resume.txt', content.length, content);
        Object.defineProperty(file, 'size', { value: content.length, writable: false });
        
        const extractedText = await fileHandler.extractText(file);
        expect(extractedText).toBe(content);
      });
    });

    describe('Error handling', () => {
      it('should throw error for invalid file during extraction', async () => {
        const file = createMockFile('resume.xyz', 1000, 'content');
        Object.defineProperty(file, 'size', { value: 1000, writable: false });
        
        await expect(fileHandler.extractText(file)).rejects.toThrow('Unsupported file format');
      });

      it('should throw error for oversized file during extraction', async () => {
        const size = 11 * 1024 * 1024;
        const file = createMockFile('resume.txt', size, 'content');
        Object.defineProperty(file, 'size', { value: size, writable: false });
        
        await expect(fileHandler.extractText(file)).rejects.toThrow('exceeds the maximum limit');
      });
    });

    describe('Real file extraction', () => {
      it('should extract text from real PDF file if available', async () => {
        const pdfPath = path.join(process.cwd(), 'resume_template_test.pdf');
        
        // Only run this test if the file exists
        if (fs.existsSync(pdfPath)) {
          const buffer = fs.readFileSync(pdfPath);
          const file = new File([buffer], 'resume_template_test.pdf', { type: 'application/pdf' });
          
          const extractedText = await fileHandler.extractText(file);
          
          // Verify that text was extracted
          expect(extractedText).toBeDefined();
          expect(extractedText.length).toBeGreaterThan(0);
          expect(typeof extractedText).toBe('string');
        }
      });
    });
  });
});
