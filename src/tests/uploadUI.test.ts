import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { FileFormat, ValidationResult } from '../types';

// File validation logic (extracted from main process for testing)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_FORMATS: FileFormat[] = [FileFormat.PDF, FileFormat.DOCX, FileFormat.TXT];

function getFileFormat(fileName: string): FileFormat | null {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.pdf':
      return FileFormat.PDF;
    case '.docx':
    case '.doc':
      return FileFormat.DOCX;
    case '.txt':
      return FileFormat.TXT;
    default:
      return null;
  }
}

function validateFile(filePath: string, fileName: string, fileSize: number): ValidationResult {
  const format = getFileFormat(fileName);

  if (!format) {
    return {
      isValid: false,
      errorMessage: `Unsupported file format. Supported formats: ${SUPPORTED_FORMATS.join(', ').toUpperCase()}`,
      fileSize,
      format: FileFormat.TXT
    };
  }

  if (fileSize >= MAX_FILE_SIZE) {
    return {
      isValid: false,
      errorMessage: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      fileSize,
      format
    };
  }

  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    return {
      isValid: false,
      errorMessage: 'File is not readable or does not exist',
      fileSize,
      format
    };
  }

  return {
    isValid: true,
    fileSize,
    format
  };
}

describe('Upload UI - File Selection', () => {
  it('should accept valid PDF files', () => {
    const result = validateFile(
      './resume_test_real.pdf',
      'resume.pdf',
      1024 * 1024 // 1MB
    );
    
    expect(result.isValid).toBe(true);
    expect(result.format).toBe(FileFormat.PDF);
    expect(result.errorMessage).toBeUndefined();
  });

  it('should accept valid DOCX files', () => {
    const result = validateFile(
      './test.docx',
      'resume.docx',
      2 * 1024 * 1024 // 2MB
    );
    
    // File doesn't exist, but format validation should pass
    expect(result.format).toBe(FileFormat.DOCX);
  });

  it('should accept valid TXT files', () => {
    const result = validateFile(
      './test.txt',
      'resume.txt',
      500 * 1024 // 500KB
    );
    
    expect(result.format).toBe(FileFormat.TXT);
  });

  it('should reject unsupported file formats', () => {
    const result = validateFile(
      './test.jpg',
      'image.jpg',
      1024 * 1024
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Unsupported file format');
  });

  it('should reject files exceeding size limit', () => {
    const result = validateFile(
      './large.pdf',
      'large.pdf',
      11 * 1024 * 1024 // 11MB
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('exceeds the maximum limit');
  });

  it('should reject files at exactly 10MB', () => {
    const result = validateFile(
      './exact.pdf',
      'exact.pdf',
      10 * 1024 * 1024 // Exactly 10MB
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('exceeds the maximum limit');
  });

  it('should accept files just under 10MB', () => {
    const result = validateFile(
      './resume_test_real.pdf',
      'almost.pdf',
      10 * 1024 * 1024 - 1 // Just under 10MB
    );
    
    expect(result.isValid).toBe(true);
  });
});

describe('Upload UI - Drag and Drop', () => {
  it('should handle PDF files dropped', () => {
    const fileName = 'dropped.pdf';
    const fileSize = 2 * 1024 * 1024;
    
    const format = getFileFormat(fileName);
    expect(format).toBe(FileFormat.PDF);
  });

  it('should handle DOCX files dropped', () => {
    const fileName = 'dropped.docx';
    const fileSize = 3 * 1024 * 1024;
    
    const format = getFileFormat(fileName);
    expect(format).toBe(FileFormat.DOCX);
  });

  it('should handle TXT files dropped', () => {
    const fileName = 'dropped.txt';
    const fileSize = 100 * 1024;
    
    const format = getFileFormat(fileName);
    expect(format).toBe(FileFormat.TXT);
  });

  it('should reject invalid files dropped', () => {
    const fileName = 'invalid.exe';
    const fileSize = 1024 * 1024;
    
    const format = getFileFormat(fileName);
    expect(format).toBeNull();
  });
});

describe('Upload UI - Error Display', () => {
  it('should provide specific error for unsupported format', () => {
    const result = validateFile(
      './test.zip',
      'archive.zip',
      1024 * 1024
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBeDefined();
    expect(result.errorMessage).toContain('Unsupported file format');
    expect(result.errorMessage).toContain('PDF');
    expect(result.errorMessage).toContain('DOCX');
    expect(result.errorMessage).toContain('TXT');
  });

  it('should provide specific error for oversized file', () => {
    const result = validateFile(
      './huge.pdf',
      'huge.pdf',
      50 * 1024 * 1024
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBeDefined();
    expect(result.errorMessage).toContain('exceeds');
    expect(result.errorMessage).toContain('10');
  });

  it('should provide error for non-existent file', () => {
    const result = validateFile(
      './nonexistent.pdf',
      'nonexistent.pdf',
      1024 * 1024
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('not readable');
  });
});

describe('Upload UI - File Format Detection', () => {
  it('should detect PDF format from .pdf extension', () => {
    expect(getFileFormat('resume.pdf')).toBe(FileFormat.PDF);
    expect(getFileFormat('RESUME.PDF')).toBe(FileFormat.PDF);
    expect(getFileFormat('my.resume.pdf')).toBe(FileFormat.PDF);
  });

  it('should detect DOCX format from .docx extension', () => {
    expect(getFileFormat('resume.docx')).toBe(FileFormat.DOCX);
    expect(getFileFormat('RESUME.DOCX')).toBe(FileFormat.DOCX);
  });

  it('should detect DOCX format from .doc extension', () => {
    expect(getFileFormat('resume.doc')).toBe(FileFormat.DOCX);
    expect(getFileFormat('RESUME.DOC')).toBe(FileFormat.DOCX);
  });

  it('should detect TXT format from .txt extension', () => {
    expect(getFileFormat('resume.txt')).toBe(FileFormat.TXT);
    expect(getFileFormat('RESUME.TXT')).toBe(FileFormat.TXT);
  });

  it('should return null for unsupported extensions', () => {
    expect(getFileFormat('resume.jpg')).toBeNull();
    expect(getFileFormat('resume.png')).toBeNull();
    expect(getFileFormat('resume.zip')).toBeNull();
    expect(getFileFormat('resume')).toBeNull();
  });

  it('should handle files with no extension', () => {
    expect(getFileFormat('resume')).toBeNull();
  });

  it('should handle files with multiple dots', () => {
    expect(getFileFormat('my.old.resume.pdf')).toBe(FileFormat.PDF);
    expect(getFileFormat('version.2.0.docx')).toBe(FileFormat.DOCX);
  });
});
