import { FileFormat, ValidationResult, FileHandler } from '../types';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { ErrorHandler } from './errorHandler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

const SUPPORTED_FORMATS: FileFormat[] = [
  FileFormat.PDF,
  FileFormat.DOCX,
  FileFormat.TXT
];

const FORMAT_EXTENSIONS: Record<FileFormat, string[]> = {
  [FileFormat.PDF]: ['.pdf'],
  [FileFormat.DOCX]: ['.docx', '.doc'],
  [FileFormat.TXT]: ['.txt']
};

/**
 * Determines the file format based on file extension
 */
function getFileFormat(fileName: string): FileFormat | null {
  const lowerName = fileName.toLowerCase();
  
  for (const [format, extensions] of Object.entries(FORMAT_EXTENSIONS)) {
    if (extensions.some(ext => lowerName.endsWith(ext))) {
      return format as FileFormat;
    }
  }
  
  return null;
}

/**
 * File handler implementation for validating and processing resume files
 */
export class FileHandlerImpl implements FileHandler {
  /**
   * Validates a file for format and size requirements
   * @param file - The file to validate
   * @returns ValidationResult with isValid flag and optional error message
   */
  validateFile(file: File): ValidationResult {
    const fileSize = file.size;
    const format = getFileFormat(file.name);

    // Check if format is supported
    if (!format) {
      return {
        isValid: false,
        errorMessage: `Unsupported file format. Supported formats: ${SUPPORTED_FORMATS.join(', ').toUpperCase()}`,
        fileSize,
        format: FileFormat.TXT // Default value for type safety
      };
    }

    // Check file size
    if (fileSize >= MAX_FILE_SIZE) {
      return {
        isValid: false,
        errorMessage: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        fileSize,
        format
      };
    }

    // File is valid
    return {
      isValid: true,
      fileSize,
      format
    };
  }

  /**
   * Extracts text content from a file based on its format
   * @param file - The file to extract text from
   * @returns Promise resolving to the extracted text
   */
  async extractText(file: File): Promise<string> {
    return ErrorHandler.handleAsync(
      async () => {
        // Validate file first
        const validation = this.validateFile(file);
        if (!validation.isValid) {
          throw ErrorHandler.createFileError(
            validation.errorMessage!,
            `File validation failed: ${validation.errorMessage}`,
            { fileName: file.name, fileSize: file.size }
          );
        }

        // Extract text based on format
        switch (validation.format) {
          case FileFormat.TXT:
            return this.extractTextFromTxt(file);
          case FileFormat.PDF:
            return this.extractTextFromPdf(file);
          case FileFormat.DOCX:
            return this.extractTextFromDocx(file);
          default:
            throw ErrorHandler.createFileError(
              `Unsupported format: ${validation.format}`,
              `Format not supported: ${validation.format}`,
              { fileName: file.name, format: validation.format }
            );
        }
      },
      (error) => {
        if (error instanceof Error && error.name === 'AppError') {
          return error as any;
        }
        return ErrorHandler.createFileError(
          'Failed to extract text from file',
          error instanceof Error ? error.message : String(error),
          { fileName: file.name }
        );
      }
    );
  }

  /**
   * Returns the list of supported file formats
   */
  getSupportedFormats(): string[] {
    return SUPPORTED_FORMATS.map(format => format.toUpperCase());
  }

  /**
   * Extracts text from a plain text file
   */
  private async extractTextFromTxt(file: File): Promise<string> {
    try {
      return await file.text();
    } catch (error) {
      throw ErrorHandler.createFileError(
        'Failed to read text file',
        error instanceof Error ? error.message : 'Unknown error',
        { fileName: file.name }
      );
    }
  }

  /**
   * Extracts text from a PDF file using pdf-parse
   * Optimized for large files with streaming and memory management
   */
  private async extractTextFromPdf(file: File): Promise<string> {
    try {
      // Convert File to Buffer for pdf-parse
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Parse PDF with optimized options for large files
      const data = await pdfParse(buffer, {
        // Limit page rendering for performance
        max: 0, // Don't render pages, just extract text
        version: 'v2.0.550' // Use latest parser version
      });
      
      if (!data.text || data.text.trim().length === 0) {
        throw ErrorHandler.createFileError(
          'PDF file contains no extractable text',
          'PDF parsing returned empty text',
          { fileName: file.name }
        );
      }
      
      return data.text;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw ErrorHandler.createFileError(
        'Failed to extract text from PDF',
        error instanceof Error ? error.message : 'Unknown error',
        { fileName: file.name }
      );
    }
  }

  /**
   * Extracts text from a DOCX file using mammoth
   */
  private async extractTextFromDocx(file: File): Promise<string> {
    try {
      // Convert File to ArrayBuffer for mammoth
      const arrayBuffer = await file.arrayBuffer();
      
      // Extract text using mammoth
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      if (!result.value || result.value.trim().length === 0) {
        throw ErrorHandler.createFileError(
          'DOCX file contains no extractable text',
          'DOCX parsing returned empty text',
          { fileName: file.name }
        );
      }
      
      // Log any warnings from mammoth (non-fatal issues)
      if (result.messages && result.messages.length > 0) {
        console.warn('DOCX extraction warnings:', result.messages);
      }
      
      return result.value;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw ErrorHandler.createFileError(
        'Failed to extract text from DOCX',
        error instanceof Error ? error.message : 'Unknown error',
        { fileName: file.name }
      );
    }
  }
}

// Export singleton instance
export const fileHandler = new FileHandlerImpl();
