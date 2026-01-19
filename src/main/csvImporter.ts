/**
 * CSV Importer
 *
 * Imports job postings from CSV files for batch processing.
 * Expected CSV format:
 *   url,company,title,description
 *   https://...,Google,Senior Engineer,"Full job description..."
 */

import * as fs from 'fs';
import { jobQueue, QueuedJob, QueueJobInput } from './jobQueue';

/**
 * Result of importing a single job from CSV
 */
export interface ImportResult {
  row: number;
  success: boolean;
  job?: QueuedJob;
  error?: string;
}

/**
 * Summary of the entire import operation
 */
export interface ImportSummary {
  totalRows: number;
  successCount: number;
  failureCount: number;
  results: ImportResult[];
}

/**
 * CSV column configuration
 */
export interface CSVColumnConfig {
  url?: string;
  company: string;
  title: string;
  description: string;
  priority?: string;
}

/**
 * Default column names for the CSV
 */
const DEFAULT_COLUMNS: CSVColumnConfig = {
  url: 'url',
  company: 'company',
  title: 'title',
  description: 'description',
  priority: 'priority'
};

/**
 * CSV Importer class for batch job imports
 */
export class CSVImporter {
  private columnConfig: CSVColumnConfig;

  constructor(columnConfig?: Partial<CSVColumnConfig>) {
    this.columnConfig = { ...DEFAULT_COLUMNS, ...columnConfig };
  }

  /**
   * Imports job postings from a CSV file
   * @param filePath - Path to the CSV file
   * @returns Import summary with results for each row
   */
  async importJobPostings(filePath: string): Promise<ImportSummary> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return this.importFromString(content);
  }

  /**
   * Imports job postings from a CSV string
   * @param csvContent - CSV content as a string
   * @returns Import summary with results for each row
   */
  async importFromString(csvContent: string): Promise<ImportSummary> {
    const rows = this.parseCSV(csvContent);

    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    // First row is header
    const headers = rows[0];
    const columnIndices = this.mapColumnsToIndices(headers);

    // Validate required columns
    this.validateColumns(columnIndices);

    const results: ImportResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process data rows (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1; // 1-indexed for user display

      try {
        const jobInput = this.rowToJobInput(row, columnIndices);

        // Validate required fields
        if (!jobInput.company || !jobInput.title || !jobInput.rawDescription) {
          throw new Error('Missing required field (company, title, or description)');
        }

        // Skip empty descriptions
        if (jobInput.rawDescription.trim().length === 0) {
          throw new Error('Description cannot be empty');
        }

        const job = await jobQueue.enqueue(jobInput);

        results.push({
          row: rowNumber,
          success: true,
          job
        });
        successCount++;
      } catch (error) {
        results.push({
          row: rowNumber,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failureCount++;
      }
    }

    return {
      totalRows: rows.length - 1, // Exclude header
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Parses CSV content into rows
   * Handles quoted fields with commas and newlines
   */
  private parseCSV(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < content.length) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else if (char === '"') {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      }

      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
        i++;
        continue;
      }

      if (char === ',') {
        // Field separator
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      }

      if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        // Row separator
        currentRow.push(currentField.trim());

        // Skip empty rows
        if (currentRow.some(field => field.length > 0)) {
          rows.push(currentRow);
        }

        currentRow = [];
        currentField = '';

        if (char === '\r') {
          i += 2;
        } else {
          i++;
        }
        continue;
      }

      if (char === '\r') {
        // Handle standalone \r as row separator
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        continue;
      }

      currentField += char;
      i++;
    }

    // Handle last field/row
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(field => field.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Maps column names to their indices in the CSV
   */
  private mapColumnsToIndices(headers: string[]): Map<string, number> {
    const indices = new Map<string, number>();

    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    for (const [key, columnName] of Object.entries(this.columnConfig)) {
      if (columnName) {
        const index = normalizedHeaders.indexOf(columnName.toLowerCase());
        if (index !== -1) {
          indices.set(key, index);
        }
      }
    }

    return indices;
  }

  /**
   * Validates that required columns are present
   */
  private validateColumns(indices: Map<string, number>): void {
    const required = ['company', 'title', 'description'];
    const missing: string[] = [];

    for (const col of required) {
      if (!indices.has(col)) {
        missing.push(this.columnConfig[col as keyof CSVColumnConfig] || col);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }
  }

  /**
   * Converts a CSV row to a QueueJobInput
   */
  private rowToJobInput(row: string[], indices: Map<string, number>): QueueJobInput {
    const getValue = (key: string): string => {
      const index = indices.get(key);
      return index !== undefined && index < row.length ? row[index] : '';
    };

    const priorityStr = getValue('priority');
    const priority = priorityStr ? parseInt(priorityStr, 10) : undefined;

    return {
      sourceUrl: getValue('url') || undefined,
      company: getValue('company'),
      title: getValue('title'),
      rawDescription: getValue('description'),
      priority: isNaN(priority as number) ? undefined : priority
    };
  }

  /**
   * Generates a template CSV file
   * @returns CSV content for a template file
   */
  static generateTemplate(): string {
    const headers = ['url', 'company', 'title', 'description', 'priority'];
    const example = [
      'https://example.com/job/123',
      'Example Corp',
      'Senior Software Engineer',
      '"Looking for an experienced engineer to lead our backend team. Requirements: 5+ years experience, Python, AWS, microservices architecture."',
      '1'
    ];

    return [
      headers.join(','),
      example.join(',')
    ].join('\n');
  }

  /**
   * Validates a CSV file without importing
   * @returns Validation errors if any
   */
  async validateCSV(filePath: string): Promise<{
    valid: boolean;
    errors: string[];
    rowCount: number;
  }> {
    const errors: string[] = [];

    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        errors: ['File not found'],
        rowCount: 0
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const rows = this.parseCSV(content);

    if (rows.length === 0) {
      return {
        valid: false,
        errors: ['CSV file is empty'],
        rowCount: 0
      };
    }

    const headers = rows[0];
    const indices = this.mapColumnsToIndices(headers);

    // Check required columns
    const required = ['company', 'title', 'description'];
    for (const col of required) {
      if (!indices.has(col)) {
        errors.push(`Missing required column: ${this.columnConfig[col as keyof CSVColumnConfig]}`);
      }
    }

    // Validate data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      const company = indices.has('company') ? row[indices.get('company')!] : '';
      const title = indices.has('title') ? row[indices.get('title')!] : '';
      const description = indices.has('description') ? row[indices.get('description')!] : '';

      if (!company || company.trim().length === 0) {
        errors.push(`Row ${rowNumber}: Missing company name`);
      }
      if (!title || title.trim().length === 0) {
        errors.push(`Row ${rowNumber}: Missing job title`);
      }
      if (!description || description.trim().length === 0) {
        errors.push(`Row ${rowNumber}: Missing job description`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      rowCount: rows.length - 1
    };
  }
}

// Export singleton instance
export const csvImporter = new CSVImporter();
