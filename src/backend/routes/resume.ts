/**
 * Resume routes - handles resume file extraction and processing.
 * Provides endpoints for extracting text from resume files without vault creation.
 */

import { Router, Request, Response } from 'express';
import { FileExtractor } from '../../main/fileExtractor';
import { loggers } from '../logger';

const resumeLogger = loggers.api;
const router = Router();

/**
 * POST /api/resume/extract
 * Extract text content from a resume file without creating a vault.
 * Used by the optimizer for direct text extraction.
 *
 * Accepts JSON body with:
 * - fileName: string - The original file name
 * - fileContent: string - Base64 encoded file content
 *
 * Returns:
 * - success: boolean
 * - content: string - Extracted text content
 * - metadata?: object - File metadata (if available)
 */
router.post('/extract', async (req: Request, res: Response) => {
  try {
    console.log('UPLOAD: received', req.file?.originalname);
    const { fileName, fileContent } = req.body;

    // Validate required fields
    if (!fileName || !fileContent) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'fileName and fileContent are required'
      });
      return;
    }

    // Detect file format from extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    const supportedFormats = ['pdf', 'docx', 'txt', 'md'];
    if (!ext || !supportedFormats.includes(ext)) {
      res.status(400).json({
        success: false,
        error: 'Unsupported file format',
        message: `Supported formats: ${supportedFormats.join(', ')}`
      });
      return;
    }

    // Decode base64 content
    const fileBuffer = Buffer.from(fileContent, 'base64');

    // Extract text from file
    resumeLogger.info({ fileName, fileSize: fileBuffer.length }, 'Extracting text from file');
    const fileExtractor = new FileExtractor();
    console.log('UPLOAD: starting parse');
    const extractionResult = await fileExtractor.extractFromBuffer(fileBuffer, ext);
    console.log('UPLOAD: parse complete', extractionResult);

    if (!extractionResult.text || extractionResult.text.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'No content extracted',
        message: 'No text content could be extracted from the file'
      });
      return;
    }

    resumeLogger.info(
      { fileName, contentLength: extractionResult.text.length },
      'Successfully extracted text'
    );

    res.json({
      success: true,
      content: extractionResult.text,
      metadata: extractionResult.metadata,
      pageCount: extractionResult.pageCount
    });
  } catch (error) {
    console.log('UPLOAD: ERROR', error);
    resumeLogger.error({ err: error }, 'Error extracting file content');
    res.status(500).json({
      success: false,
      error: 'Failed to extract content',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
