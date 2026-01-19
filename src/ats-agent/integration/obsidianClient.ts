/**
 * ATS Agent Obsidian Client
 * 
 * Provides integration with Obsidian vault for retrieving resume content
 * and saving analysis results. Uses the shared Obsidian MCP client.
 */

import { obsidianClient as sharedObsidianClient } from '../../shared/obsidian/client';
import { ErrorHandler } from '../../shared/errors/handler';
import { AppError, ErrorCategory } from '../../shared/errors/types';
import type { ObsidianClient, Resume, OptimizationResult } from '../types';
import type { NoteContent, Frontmatter, ContentType } from '../../shared/obsidian/types';

/**
 * ATS Agent Obsidian Client Implementation
 * 
 * Wraps the shared Obsidian MCP client to provide ATS-specific functionality
 * for retrieving resume content and saving analysis results.
 */
export class ATSObsidianClient implements ObsidianClient {
  /**
   * Retrieves resume content from the Obsidian vault
   * 
   * Handles various error scenarios:
   * - Missing resume content (404)
   * - Service unavailability (503)
   * - Invalid content structure
   * 
   * Implements retry logic:
   * - Retries up to 3 times with exponential backoff (1000ms, 2000ms, 4000ms)
   * - Only retries transient errors (network, timeout)
   * - Does NOT retry validation errors or missing content
   * 
   * @param resumeId - The unique identifier for the resume
   * @returns Resume object with content and metadata
   * @throws AppError with appropriate category and user-friendly message
   */
  async getResumeContent(resumeId: string): Promise<Resume> {
    return ErrorHandler.handleAsync(
      async () => {
        // Validate input (no retry for validation errors)
        if (!resumeId || resumeId.trim() === '') {
          throw new Error('Resume ID is required');
        }

        // Construct the path to the resume content
        // Following resume-content-ingestion format: /resumes/{resumeId}/content.md
        const resumePath = `resumes/${resumeId}/content.md`;
        
        let noteContent: NoteContent;
        
        // Wrap the Obsidian read operation with retry logic
        noteContent = await ErrorHandler.retry(
          async () => {
            try {
              // Read the note from the vault using shared client
              return await sharedObsidianClient.readNote(resumePath);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              
              // Handle missing resume (404) - NOT retryable
              if (errorMessage.includes('not found') || errorMessage.includes('Note not found')) {
                throw ErrorHandler.createStorageError(
                  `Resume not found: ${resumeId}`,
                  `Resume content not found at path: ${resumePath}. ` +
                  `Ensure the resume has been ingested using the resume-content-ingestion feature.`,
                  { resumeId, path: resumePath }
                );
              }
              
              // Handle service unavailability (503) - retryable
              // Check for various service unavailability indicators:
              // - "unavailable", "timeout", "timed out", "connection", "refused" in message
              // - Error codes: ETIMEDOUT, ECONNREFUSED, ECONNRESET, ENETUNREACH
              const lowerMessage = errorMessage.toLowerCase();
              const isServiceUnavailable = 
                lowerMessage.includes('unavailable') || 
                lowerMessage.includes('timeout') || 
                lowerMessage.includes('timed out') ||
                lowerMessage.includes('connection') ||
                lowerMessage.includes('refused') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('ECONNREFUSED') ||
                errorMessage.includes('ECONNRESET') ||
                errorMessage.includes('ENETUNREACH');
              
              if (isServiceUnavailable) {
                throw ErrorHandler.createNetworkError(
                  'Obsidian vault is currently unavailable',
                  `Failed to connect to Obsidian vault: ${errorMessage}`,
                  { resumeId, path: resumePath }
                );
              }
              
              // Re-throw other errors
              throw error;
            }
          },
          {
            maxAttempts: 3,
            delayMs: 1000,
            backoffMultiplier: 2,
            shouldRetry: (error) => {
              // Only retry transient errors (network, timeout)
              // Do NOT retry validation errors or missing content
              return ErrorHandler.isRetryable(error);
            }
          }
        );
        
        // Validate that we got valid content structure
        if (!noteContent) {
          throw ErrorHandler.createValidationError(
            'Invalid resume data structure',
            'Resume content is null or undefined',
            { resumeId, path: resumePath }
          );
        }
        
        if (!noteContent.content) {
          throw ErrorHandler.createValidationError(
            'Resume content is empty',
            `Resume content field is missing or empty for ID: ${resumeId}`,
            { resumeId, path: resumePath }
          );
        }
        
        // Extract the actual content (without frontmatter)
        // The shared client returns full markdown with frontmatter, we need to strip it
        const contentWithoutFrontmatter = this.stripFrontmatter(noteContent.content);
        
        // Validate that the actual content is not empty
        if (!contentWithoutFrontmatter.trim()) {
          throw ErrorHandler.createValidationError(
            'Resume content is empty',
            `Resume content is empty after stripping frontmatter for ID: ${resumeId}`,
            { resumeId, path: resumePath }
          );
        }
        
        // Validate frontmatter structure
        if (!noteContent.frontmatter) {
          throw ErrorHandler.createValidationError(
            'Invalid resume metadata',
            'Resume frontmatter is missing',
            { resumeId, path: resumePath }
          );
        }
        
        // Convert NoteContent to Resume format
        const resume: Resume = {
          id: resumeId,
          content: contentWithoutFrontmatter,
          format: 'obsidian',
          metadata: {
            path: noteContent.path,
            frontmatter: noteContent.frontmatter,
            retrievedAt: new Date().toISOString()
          }
        };
        
        return resume;
      },
      (error) => {
        // If it's already an AppError, re-throw it
        if (error instanceof AppError) {
          return error;
        }
        
        // Otherwise, wrap in a generic storage error
        return ErrorHandler.createStorageError(
          'Failed to retrieve resume from Obsidian vault',
          error instanceof Error ? error.message : 'Unknown error occurred',
          { resumeId }
        );
      }
    );
  }

  /**
   * Saves analysis result to the Obsidian vault
   * 
   * Handles various error scenarios:
   * - Service unavailability (503)
   * - Write failures
   * - Invalid result structure
   * 
   * Implements retry logic:
   * - Retries up to 3 times with exponential backoff (1000ms, 2000ms, 4000ms)
   * - Only retries transient errors (network, timeout)
   * - Does NOT retry validation errors
   * 
   * @param jobId - The unique identifier for the job posting
   * @param resumeId - The unique identifier for the resume
   * @param result - The optimization result to save
   * @throws AppError with appropriate category and user-friendly message
   */
  async saveAnalysisResult(
    jobId: string,
    resumeId: string,
    result: OptimizationResult
  ): Promise<void> {
    return ErrorHandler.handleAsync(
      async () => {
        // Validate inputs (no retry for validation errors)
        if (!jobId || jobId.trim() === '') {
          throw new Error('Job ID is required');
        }
        if (!resumeId || resumeId.trim() === '') {
          throw new Error('Resume ID is required');
        }
        if (!result) {
          throw new Error('Optimization result is required');
        }
        
        // Validate result structure (no retry for validation errors)
        if (typeof result.finalScore !== 'number' || 
            result.finalScore < 0 || 
            result.finalScore > 1) {
          throw ErrorHandler.createValidationError(
            'Invalid optimization result',
            `Final score must be between 0 and 1, got: ${result.finalScore}`,
            { jobId, resumeId }
          );
        }
        
        if (!result.finalResume || !result.finalResume.content) {
          throw ErrorHandler.createValidationError(
            'Invalid optimization result',
            'Final resume content is missing',
            { jobId, resumeId }
          );
        }
        
        // Construct the path for the analysis result
        // Format: /analyses/{jobId}-{resumeId}/result.md
        const analysisPath = `analyses/${jobId}-${resumeId}/result.md`;
        
        // Build the markdown content for the analysis result
        const content = this.buildAnalysisMarkdown(result);
        
        // Build frontmatter for the analysis note
        const frontmatter: Frontmatter = {
          tags: ['ats-analysis', 'job-match', jobId, resumeId],
          type: 'job-entry' as ContentType, // Using job-entry as closest match
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: {
            customFields: {
              finalScore: result.finalScore,
              iterationCount: result.metrics.iterationCount,
              terminationReason: result.terminationReason,
              improvement: result.metrics.improvement
            }
          }
        };
        
        // Wrap the Obsidian write operation with retry logic
        await ErrorHandler.retry(
          async () => {
            try {
              // Write the analysis result to the vault using shared client
              await sharedObsidianClient.writeNote(analysisPath, content, frontmatter);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              
              // Handle service unavailability (503) - retryable
              // Check for various service unavailability indicators:
              // - "unavailable", "timeout", "timed out", "connection", "refused" in message
              // - Error codes: ETIMEDOUT, ECONNREFUSED, ECONNRESET, ENETUNREACH
              const lowerMessage = errorMessage.toLowerCase();
              const isServiceUnavailable = 
                lowerMessage.includes('unavailable') || 
                lowerMessage.includes('timeout') || 
                lowerMessage.includes('timed out') ||
                lowerMessage.includes('connection') ||
                lowerMessage.includes('refused') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('ECONNREFUSED') ||
                errorMessage.includes('ECONNRESET') ||
                errorMessage.includes('ENETUNREACH');
              
              if (isServiceUnavailable) {
                throw ErrorHandler.createNetworkError(
                  'Obsidian vault is currently unavailable',
                  `Failed to connect to Obsidian vault: ${errorMessage}`,
                  { jobId, resumeId, path: analysisPath }
                );
              }
              
              // Handle write failures - NOT retryable (permission issues)
              if (errorMessage.includes('permission') || 
                  errorMessage.includes('read-only') ||
                  errorMessage.includes('write')) {
                throw ErrorHandler.createStorageError(
                  'Failed to save analysis result',
                  `Write operation failed: ${errorMessage}`,
                  { jobId, resumeId, path: analysisPath }
                );
              }
              
              // Re-throw other errors
              throw error;
            }
          },
          {
            maxAttempts: 3,
            delayMs: 1000,
            backoffMultiplier: 2,
            shouldRetry: (error) => {
              // Only retry transient errors (network, timeout)
              // Do NOT retry validation or permission errors
              return ErrorHandler.isRetryable(error);
            }
          }
        );
      },
      (error) => {
        // If it's already an AppError, re-throw it
        if (error instanceof AppError) {
          return error;
        }
        
        // Otherwise, wrap in a generic storage error
        return ErrorHandler.createStorageError(
          'Failed to save analysis result to Obsidian vault',
          error instanceof Error ? error.message : 'Unknown error occurred',
          { jobId, resumeId }
        );
      }
    );
  }

  /**
   * Strips YAML frontmatter from markdown content
   * 
   * @param content - Full markdown content with frontmatter
   * @returns Content without frontmatter
   */
  private stripFrontmatter(content: string): string {
    // Check if content starts with frontmatter delimiter
    if (!content.startsWith('---\n')) {
      return content;
    }
    
    // Find the closing delimiter
    const closingDelimiterIndex = content.indexOf('\n---\n', 4);
    if (closingDelimiterIndex === -1) {
      return content;
    }
    
    // Return content after the closing delimiter
    return content.substring(closingDelimiterIndex + 5).trim();
  }

  /**
   * Builds markdown content for the analysis result
   * 
   * @param result - The optimization result
   * @returns Formatted markdown content
   */
  private buildAnalysisMarkdown(result: OptimizationResult): string {
    const lines: string[] = [];
    
    // Title
    lines.push('# ATS Analysis Result\n');
    
    // Summary section
    lines.push('## Summary\n');
    lines.push(`- **Final Score**: ${(result.finalScore * 100).toFixed(1)}%`);
    lines.push(`- **Initial Score**: ${(result.metrics.initialScore * 100).toFixed(1)}%`);
    lines.push(`- **Improvement**: ${(result.metrics.improvement * 100).toFixed(1)}%`);
    lines.push(`- **Iterations**: ${result.metrics.iterationCount}`);
    lines.push(`- **Termination Reason**: ${this.formatTerminationReason(result.terminationReason)}`);
    lines.push('');
    
    // Iteration history
    if (result.iterations.length > 0) {
      lines.push('## Iteration History\n');
      
      result.iterations.forEach((iteration) => {
        lines.push(`### Round ${iteration.round}\n`);
        lines.push(`**Score**: ${(iteration.score * 100).toFixed(1)}%\n`);
        
        // Recommendations summary
        if (iteration.recommendations) {
          const rec = iteration.recommendations;
          lines.push('**Recommendations**:');
          lines.push(`- Priority: ${rec.priority.length} items`);
          lines.push(`- Optional: ${rec.optional.length} items`);
          lines.push(`- Rewording: ${rec.rewording.length} items`);
          lines.push('');
          
          // Show top 3 priority recommendations
          if (rec.priority.length > 0) {
            lines.push('**Top Priority Items**:');
            rec.priority.slice(0, 3).forEach((item, i) => {
              lines.push(`${i + 1}. ${item.suggestion}`);
            });
            lines.push('');
          }
        }
      });
    }
    
    // Final resume
    lines.push('## Final Resume\n');
    lines.push('```markdown');
    lines.push(result.finalResume.content);
    lines.push('```\n');
    
    return lines.join('\n');
  }

  /**
   * Formats termination reason for display
   * 
   * @param reason - The termination reason
   * @returns Human-readable termination reason
   */
  private formatTerminationReason(reason: string): string {
    switch (reason) {
      case 'target_reached':
        return 'Target score reached';
      case 'early_stopping':
        return 'Early stopping (no improvement)';
      case 'max_iterations':
        return 'Maximum iterations reached';
      default:
        return reason;
    }
  }
}

// Export singleton instance
export const atsObsidianClient = new ATSObsidianClient();
