/**
 * Text Normalization Utilities
 * 
 * Provides functions for normalizing text to ensure consistent processing
 * across job descriptions and resumes.
 */

/**
 * Normalizes text by converting to lowercase, trimming whitespace,
 * and handling special characters.
 * 
 * @param text - The text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s\-]/g, '') // Remove special chars except hyphens and spaces
    .trim();
}

/**
 * Normalizes text while preserving punctuation for context.
 * Used when context matters for semantic analysis.
 * 
 * @param text - The text to normalize
 * @returns Normalized text with punctuation preserved
 */
export function normalizeWithPunctuation(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

/**
 * Handles encoding issues by converting to UTF-8 compatible format.
 * 
 * @param text - The text to process
 * @returns Text with encoding issues resolved
 */
export function handleEncoding(text: string): string {
  if (!text) {
    return '';
  }

  // Replace common problematic characters
  return text
    .replace(/[\u2018\u2019]/g, "'") // Smart quotes to regular quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/\u2013/g, '-') // En dash to hyphen
    .replace(/\u2014/g, '--') // Em dash to double hyphen
    .replace(/\u2026/g, '...') // Ellipsis
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
}

/**
 * Cleans whitespace from text while preserving structure.
 * 
 * @param text - The text to clean
 * @returns Text with cleaned whitespace
 */
export function cleanWhitespace(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ') // Replace tabs with spaces
    .replace(/ +/g, ' ') // Replace multiple spaces with single space
    .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
    .trim();
}

/**
 * Prepares text for parsing by applying all normalization steps.
 * 
 * @param text - The raw text to prepare
 * @returns Fully normalized and cleaned text
 */
export function prepareForParsing(text: string): string {
  if (!text) {
    return '';
  }

  return cleanWhitespace(handleEncoding(text));
}
