/**
 * File Extractor
 *
 * Extracts text content from uploaded resume files.
 * Supports PDF, DOCX, and TXT formats.
 */

import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { FileFormat } from '../types';

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  metadata?: {
    title?: string;
    author?: string;
    creationDate?: Date;
  };
}

/**
 * FileExtractor class for extracting text from various document formats
 */
export class FileExtractor {
  /**
   * Extracts text content from a file based on its format
   * @param filePath - Absolute path to the file
   * @param format - The file format (PDF, DOCX, TXT)
   * @returns Extracted text content with metadata
   */
  async extractText(filePath: string, format: FileFormat): Promise<ExtractionResult> {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    switch (format) {
      case FileFormat.PDF:
        return this.extractFromPDF(filePath);

      case FileFormat.DOCX:
        return this.extractFromDOCX(filePath);

      case FileFormat.TXT:
        return this.extractFromTXT(filePath);

      default:
        throw new Error(`Unsupported file format: ${format}`);
    }
  }

  /**
   * Extracts text content from a buffer based on file extension
   * @param buffer - File content as Buffer
   * @param ext - File extension (pdf, docx, txt, md)
   * @returns Extracted text content with metadata
   */
  async extractFromBuffer(buffer: Buffer, ext: string): Promise<ExtractionResult> {
    const extension = ext.toLowerCase().replace('.', '');

    switch (extension) {
      case 'pdf':
        return this.extractPDFFromBuffer(buffer);

      case 'docx':
      case 'doc':
        return this.extractDOCXFromBuffer(buffer);

      case 'txt':
      case 'md':
        return this.extractTXTFromBuffer(buffer);

      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Extracts text from PDF buffer
   */
  private async extractPDFFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
    const data = await pdfParse(buffer);

    return {
      text: this.cleanExtractedText(data.text),
      pageCount: data.numpages,
      metadata: {
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        creationDate: data.info?.CreationDate
          ? this.parsePDFDate(data.info.CreationDate)
          : undefined
      }
    };
  }

  /**
   * Extracts text from DOCX buffer
   */
  private async extractDOCXFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
    const result = await mammoth.extractRawText({ buffer });

    if (result.messages && result.messages.length > 0) {
      console.warn('DOCX conversion warnings:', result.messages);
    }

    return {
      text: this.cleanExtractedText(result.value)
    };
  }

  /**
   * Extracts text from TXT/MD buffer
   */
  private async extractTXTFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
    const text = buffer.toString('utf-8');

    return {
      text: this.cleanExtractedText(text)
    };
  }

  /**
   * Detects file format from file extension
   * @param fileName - Name or path of the file
   * @returns Detected FileFormat or null if unsupported
   */
  detectFormat(fileName: string): FileFormat | null {
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

  /**
   * Extracts text from PDF files
   * @param filePath - Path to PDF file
   * @returns Extracted text and metadata
   */
  private async extractFromPDF(filePath: string): Promise<ExtractionResult> {
    const buffer = fs.readFileSync(filePath);

    const data = await pdfParse(buffer);

    return {
      text: this.cleanExtractedText(data.text),
      pageCount: data.numpages,
      metadata: {
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        creationDate: data.info?.CreationDate
          ? this.parsePDFDate(data.info.CreationDate)
          : undefined
      }
    };
  }

  /**
   * Extracts text from DOCX files
   * @param filePath - Path to DOCX file
   * @returns Extracted text and metadata
   */
  private async extractFromDOCX(filePath: string): Promise<ExtractionResult> {
    const result = await mammoth.extractRawText({ path: filePath });

    // Check for conversion warnings
    if (result.messages && result.messages.length > 0) {
      console.warn('DOCX conversion warnings:', result.messages);
    }

    return {
      text: this.cleanExtractedText(result.value)
    };
  }

  /**
   * Extracts text from plain text files
   * @param filePath - Path to TXT file
   * @returns Extracted text
   */
  private async extractFromTXT(filePath: string): Promise<ExtractionResult> {
    const text = fs.readFileSync(filePath, 'utf-8');

    return {
      text: this.cleanExtractedText(text)
    };
  }

  /**
   * Cleans extracted text by normalizing whitespace and removing artifacts
   * @param text - Raw extracted text
   * @returns Cleaned text
   */
  private cleanExtractedText(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace from each line
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Remove leading/trailing whitespace from entire text
      .trim();
  }

  /**
   * Parses PDF date strings (D:YYYYMMDDHHmmSS format)
   * @param pdfDate - PDF date string
   * @returns Parsed Date or undefined
   */
  private parsePDFDate(pdfDate: string): Date | undefined {
    // PDF dates are in format: D:YYYYMMDDHHmmSS+HH'mm'
    const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (!match) return undefined;

    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
  }
}

// Export singleton instance
export const fileExtractor = new FileExtractor();
