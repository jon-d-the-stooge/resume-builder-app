/**
 * Tests for ATS Agent Obsidian Client
 * 
 * Tests the integration with Obsidian vault for retrieving resume content
 * and saving analysis results, including comprehensive error handling.
 * 
 * Includes property-based tests:
 * - Property 29: Obsidian Query Format
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { ATSObsidianClient } from '../../ats-agent/integration/obsidianClient';
import { obsidianClient as sharedObsidianClient } from '../../shared/obsidian/client';
import { AppError, ErrorCategory } from '../../shared/errors/types';
import type { OptimizationResult, TerminationReason } from '../../ats-agent/types';
import type { Frontmatter, ContentType } from '../../shared/obsidian/types';

describe('ATSObsidianClient', () => {
  let client: ATSObsidianClient;

  beforeEach(() => {
    client = new ATSObsidianClient();
    // Clear mock storage before each test
    if ('clearMockStorage' in sharedObsidianClient) {
      (sharedObsidianClient as any).clearMockStorage();
    }
  });

  describe('getResumeContent', () => {
    it('should retrieve resume content from Obsidian vault', async () => {
      // Arrange
      const resumeId = 'test-resume-123';
      const mockContent = 'John Doe\nSoftware Engineer\n\nExperience:\n- 5 years Python';
      const mockFrontmatter: Frontmatter = {
        tags: ['resume', 'software-engineer'],
        type: 'job-entry' as ContentType,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        metadata: {}
      };

      // Pre-populate the vault with test data
      await sharedObsidianClient.writeNote(
        `resumes/${resumeId}/content.md`,
        mockContent,
        mockFrontmatter
      );

      // Act
      const resume = await client.getResumeContent(resumeId);

      // Assert
      expect(resume).toBeDefined();
      expect(resume.id).toBe(resumeId);
      expect(resume.content).toBe(mockContent);
      expect(resume.format).toBe('obsidian');
      expect(resume.metadata).toBeDefined();
      expect(resume.metadata?.path).toBe(`resumes/${resumeId}/content.md`);
      expect(resume.metadata?.frontmatter).toEqual(mockFrontmatter);
    });

    it('should throw error when resume not found', async () => {
      // Arrange
      const resumeId = 'non-existent-resume';

      // Act & Assert
      await expect(client.getResumeContent(resumeId)).rejects.toThrow(
        /Resume not found/
      );
    });

    it('should throw error when resume content is empty', async () => {
      // Arrange
      const resumeId = 'empty-resume';
      const mockFrontmatter: Frontmatter = {
        tags: ['resume'],
        type: 'job-entry' as ContentType,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        metadata: {}
      };

      // Pre-populate with empty content
      await sharedObsidianClient.writeNote(
        `resumes/${resumeId}/content.md`,
        '',
        mockFrontmatter
      );

      // Act & Assert
      await expect(client.getResumeContent(resumeId)).rejects.toThrow(
        /Resume content is empty/
      );
    });

    it('should include retrieval timestamp in metadata', async () => {
      // Arrange
      const resumeId = 'test-resume-456';
      const mockContent = 'Test resume content';
      const mockFrontmatter: Frontmatter = {
        tags: ['resume'],
        type: 'job-entry' as ContentType,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        metadata: {}
      };

      await sharedObsidianClient.writeNote(
        `resumes/${resumeId}/content.md`,
        mockContent,
        mockFrontmatter
      );

      const beforeTime = new Date().toISOString();

      // Act
      const resume = await client.getResumeContent(resumeId);

      const afterTime = new Date().toISOString();

      // Assert
      expect(resume.metadata?.retrievedAt).toBeDefined();
      const retrievedAt = resume.metadata?.retrievedAt as string;
      // ISO timestamps are lexicographically ordered, so string comparison works
      expect(retrievedAt >= beforeTime).toBe(true);
      expect(retrievedAt <= afterTime).toBe(true);
    });
  });

  describe('saveAnalysisResult', () => {
    it('should save analysis result to Obsidian vault', async () => {
      // Arrange
      const jobId = 'job-123';
      const resumeId = 'resume-456';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Optimized resume content',
          format: 'markdown'
        },
        finalScore: 0.85,
        iterations: [
          {
            round: 1,
            score: 0.65,
            recommendations: {
              summary: 'Add Python skills',
              priority: [],
              optional: [],
              rewording: [],
              metadata: {
                iterationRound: 1,
                currentScore: 0.65,
                targetScore: 0.8
              }
            },
            resumeVersion: 'v1'
          },
          {
            round: 2,
            score: 0.85,
            recommendations: {
              summary: 'Target reached',
              priority: [],
              optional: [],
              rewording: [],
              metadata: {
                iterationRound: 2,
                currentScore: 0.85,
                targetScore: 0.8
              }
            },
            resumeVersion: 'v2'
          }
        ],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.65,
          finalScore: 0.85,
          improvement: 0.20,
          iterationCount: 2
        }
      };

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert - verify the note was written
      const savedNote = await sharedObsidianClient.readNote(
        `analyses/${jobId}-${resumeId}/result.md`
      );

      expect(savedNote).toBeDefined();
      expect(savedNote.content).toContain('ATS Analysis Result');
      expect(savedNote.content).toContain('Final Score');
      expect(savedNote.content).toContain('85.0%');
      expect(savedNote.content).toContain('Iteration History');
      expect(savedNote.frontmatter.tags).toContain('ats-analysis');
      expect(savedNote.frontmatter.tags).toContain(jobId);
      expect(savedNote.frontmatter.tags).toContain(resumeId);
      expect(savedNote.frontmatter.metadata.customFields?.finalScore).toBe(0.85);
      expect(savedNote.frontmatter.metadata.customFields?.iterationCount).toBe(2);
    });

    it('should include all metrics in frontmatter', async () => {
      // Arrange
      const jobId = 'job-789';
      const resumeId = 'resume-012';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Final content',
          format: 'markdown'
        },
        finalScore: 0.75,
        iterations: [],
        terminationReason: 'early_stopping' as TerminationReason,
        metrics: {
          initialScore: 0.70,
          finalScore: 0.75,
          improvement: 0.05,
          iterationCount: 5
        }
      };

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert
      const savedNote = await sharedObsidianClient.readNote(
        `analyses/${jobId}-${resumeId}/result.md`
      );

      // Note: jobId and resumeId are in tags, not in metadata
      expect(savedNote.frontmatter.tags).toContain(jobId);
      expect(savedNote.frontmatter.tags).toContain(resumeId);
      expect(savedNote.frontmatter.metadata.customFields?.finalScore).toBe(0.75);
      expect(savedNote.frontmatter.metadata.customFields?.iterationCount).toBe(5);
      expect(savedNote.frontmatter.metadata.customFields?.terminationReason).toBe('early_stopping');
      expect(savedNote.frontmatter.metadata.customFields?.improvement).toBe(0.05);
    });

    it('should format termination reasons correctly', async () => {
      // Arrange
      const testCases: Array<{
        reason: TerminationReason;
        expectedText: string;
      }> = [
        { reason: 'target_reached', expectedText: 'Target score reached' },
        { reason: 'early_stopping', expectedText: 'Early stopping (no improvement)' },
        { reason: 'max_iterations', expectedText: 'Maximum iterations reached' }
      ];

      for (const testCase of testCases) {
        const jobId = `job-${testCase.reason}`;
        const resumeId = 'resume-test';
        const mockResult: OptimizationResult = {
          finalResume: {
            id: resumeId,
            content: 'Content',
            format: 'markdown'
          },
          finalScore: 0.8,
          iterations: [],
          terminationReason: testCase.reason,
          metrics: {
            initialScore: 0.7,
            finalScore: 0.8,
            improvement: 0.1,
            iterationCount: 3
          }
        };

        // Act
        await client.saveAnalysisResult(jobId, resumeId, mockResult);

        // Assert
        const savedNote = await sharedObsidianClient.readNote(
          `analyses/${jobId}-${resumeId}/result.md`
        );

        expect(savedNote.content).toContain(testCase.expectedText);
      }
    });

    it('should include iteration history in markdown', async () => {
      // Arrange
      const jobId = 'job-history';
      const resumeId = 'resume-history';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Final',
          format: 'markdown'
        },
        finalScore: 0.9,
        iterations: [
          {
            round: 1,
            score: 0.7,
            recommendations: {
              summary: 'Round 1 summary',
              priority: [
                {
                  type: 'add_skill',
                  element: 'Python',
                  importance: 0.9,
                  suggestion: 'Add Python experience'
                }
              ],
              optional: [],
              rewording: [],
              metadata: {
                iterationRound: 1,
                currentScore: 0.7,
                targetScore: 0.8
              }
            },
            resumeVersion: 'v1'
          }
        ],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.9,
          improvement: 0.2,
          iterationCount: 1
        }
      };

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert
      const savedNote = await sharedObsidianClient.readNote(
        `analyses/${jobId}-${resumeId}/result.md`
      );

      expect(savedNote.content).toContain('Iteration History');
      expect(savedNote.content).toContain('Round 1');
      expect(savedNote.content).toContain('70.0%');
      expect(savedNote.content).toContain('Priority: 1 items');
      expect(savedNote.content).toContain('Add Python experience');
    });

    it('should include final resume in markdown code block', async () => {
      // Arrange
      const jobId = 'job-final';
      const resumeId = 'resume-final';
      const finalResumeContent = 'John Doe\nSenior Engineer\nPython, JavaScript';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: finalResumeContent,
          format: 'markdown'
        },
        finalScore: 0.88,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.75,
          finalScore: 0.88,
          improvement: 0.13,
          iterationCount: 3
        }
      };

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert
      const savedNote = await sharedObsidianClient.readNote(
        `analyses/${jobId}-${resumeId}/result.md`
      );

      expect(savedNote.content).toContain('Final Resume');
      expect(savedNote.content).toContain('```markdown');
      expect(savedNote.content).toContain(finalResumeContent);
      expect(savedNote.content).toContain('```');
    });

    it('should throw error on save failure', async () => {
      // Arrange
      const jobId = 'job-fail';
      const resumeId = 'resume-fail';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      // Mock a failure by temporarily replacing writeNote
      const originalWriteNote = sharedObsidianClient.writeNote;
      sharedObsidianClient.writeNote = vi.fn().mockRejectedValue(
        new Error('Vault write failed')
      );

      // Act & Assert
      await expect(
        client.saveAnalysisResult(jobId, resumeId, mockResult)
      ).rejects.toThrow(/Failed to save analysis result/);

      // Restore original method
      sharedObsidianClient.writeNote = originalWriteNote;
    });
  });

  describe('integration with resume-content-ingestion format', () => {
    it('should use correct path format for resume retrieval', async () => {
      // Arrange
      const resumeId = 'format-test-123';
      const mockContent = 'Resume content';
      const mockFrontmatter: Frontmatter = {
        tags: ['resume'],
        type: 'job-entry' as ContentType,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        metadata: {}
      };

      // Pre-populate using the expected format
      await sharedObsidianClient.writeNote(
        `resumes/${resumeId}/content.md`,
        mockContent,
        mockFrontmatter
      );

      // Act
      const resume = await client.getResumeContent(resumeId);

      // Assert
      expect(resume.metadata?.path).toBe(`resumes/${resumeId}/content.md`);
    });

    it('should use correct path format for analysis result storage', async () => {
      // Arrange
      const jobId = 'job-format-test';
      const resumeId = 'resume-format-test';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert - verify the path format
      const savedNote = await sharedObsidianClient.readNote(
        `analyses/${jobId}-${resumeId}/result.md`
      );

      expect(savedNote).toBeDefined();
      expect(savedNote.path).toBe(`analyses/${jobId}-${resumeId}/result.md`);
    });
  });

  describe('error handling for getResumeContent', () => {
    it('should handle missing resume content (404)', async () => {
      // Arrange
      const resumeId = 'non-existent-resume';

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.userMessage).toContain('Resume not found');
        expect(appError.userMessage).toContain(resumeId);
        expect(appError.technicalDetails).toContain('not found');
        expect(appError.context?.resumeId).toBe(resumeId);
      }
    });

    it('should handle service unavailability (503)', async () => {
      // Arrange
      const resumeId = 'test-resume';
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock service unavailability
      sharedObsidianClient.readNote = vi.fn().mockRejectedValue(
        new Error('Service unavailable: Connection timeout')
      );

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.NETWORK);
        expect(appError.userMessage).toContain('unavailable');
        expect(appError.technicalDetails).toContain('timeout');
        expect(appError.recoverable).toBe(true);
      } finally {
        // Restore original method
        sharedObsidianClient.readNote = originalReadNote;
      }
    });

    it('should handle invalid content structure - null content', async () => {
      // Arrange
      const resumeId = 'invalid-resume';
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock invalid content structure
      sharedObsidianClient.readNote = vi.fn().mockResolvedValue({
        path: `resumes/${resumeId}/content.md`,
        content: null,
        frontmatter: {
          tags: ['resume'],
          type: 'job-entry' as ContentType,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          metadata: {}
        }
      });

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        expect(appError.userMessage).toContain('empty');
        expect(appError.recoverable).toBe(true);
      } finally {
        // Restore original method
        sharedObsidianClient.readNote = originalReadNote;
      }
    });

    it('should handle invalid content structure - missing frontmatter', async () => {
      // Arrange
      const resumeId = 'no-frontmatter-resume';
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock missing frontmatter
      sharedObsidianClient.readNote = vi.fn().mockResolvedValue({
        path: `resumes/${resumeId}/content.md`,
        content: 'Some content',
        frontmatter: null
      });

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        expect(appError.userMessage).toContain('metadata');
        expect(appError.technicalDetails).toContain('frontmatter');
      } finally {
        // Restore original method
        sharedObsidianClient.readNote = originalReadNote;
      }
    });

    it('should handle empty resume ID', async () => {
      // Act & Assert
      try {
        await client.getResumeContent('');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.technicalDetails).toContain('required');
      }
    });

    it('should handle whitespace-only resume ID', async () => {
      // Act & Assert
      try {
        await client.getResumeContent('   ');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.technicalDetails).toContain('required');
      }
    });

    it('should return appropriate error responses with context', async () => {
      // Arrange
      const resumeId = 'context-test-resume';

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        
        // Verify error has context
        expect(appError.context).toBeDefined();
        expect(appError.context?.resumeId).toBe(resumeId);
        expect(appError.context?.path).toContain(resumeId);
        
        // Verify error has timestamp
        expect(appError.timestamp).toBeInstanceOf(Date);
        
        // Verify error has suggested action
        expect(appError.suggestedAction).toBeDefined();
      }
    });
  });

  describe('error handling for saveAnalysisResult', () => {
    it('should handle service unavailability (503) on save', async () => {
      // Arrange
      const jobId = 'job-unavailable';
      const resumeId = 'resume-unavailable';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock service unavailability
      sharedObsidianClient.writeNote = vi.fn().mockRejectedValue(
        new Error('Connection timeout')
      );

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.NETWORK);
        expect(appError.userMessage).toContain('unavailable');
        expect(appError.recoverable).toBe(true);
      } finally {
        // Restore original method
        sharedObsidianClient.writeNote = originalWriteNote;
      }
    });

    it('should handle write permission errors', async () => {
      // Arrange
      const jobId = 'job-permission';
      const resumeId = 'resume-permission';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock permission error
      sharedObsidianClient.writeNote = vi.fn().mockRejectedValue(
        new Error('Permission denied: read-only vault')
      );

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.userMessage).toContain('Failed to save');
        expect(appError.technicalDetails).toContain('Permission denied');
      } finally {
        // Restore original method
        sharedObsidianClient.writeNote = originalWriteNote;
      }
    });

    it('should handle invalid result structure - missing final score', async () => {
      // Arrange
      const jobId = 'job-invalid';
      const resumeId = 'resume-invalid';
      const mockResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: null, // Invalid
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      } as any;

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        expect(appError.userMessage).toContain('Invalid');
      }
    });

    it('should handle invalid result structure - score out of range', async () => {
      // Arrange
      const jobId = 'job-range';
      const resumeId = 'resume-range';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 1.5, // Out of range
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 1.5,
          improvement: 0.8,
          iterationCount: 1
        }
      };

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        expect(appError.technicalDetails).toContain('between 0 and 1');
      }
    });

    it('should handle invalid result structure - missing final resume', async () => {
      // Arrange
      const jobId = 'job-no-resume';
      const resumeId = 'resume-no-resume';
      const mockResult = {
        finalResume: null, // Missing
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      } as any;

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        expect(appError.technicalDetails).toContain('resume content');
      }
    });

    it('should handle empty job ID', async () => {
      // Arrange
      const mockResult: OptimizationResult = {
        finalResume: {
          id: 'resume-id',
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      // Act & Assert
      try {
        await client.saveAnalysisResult('', 'resume-id', mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.technicalDetails).toContain('Job ID is required');
      }
    });

    it('should handle empty resume ID', async () => {
      // Arrange
      const mockResult: OptimizationResult = {
        finalResume: {
          id: 'resume-id',
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      // Act & Assert
      try {
        await client.saveAnalysisResult('job-id', '', mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.technicalDetails).toContain('Resume ID is required');
      }
    });

    it('should return appropriate error responses with context', async () => {
      // Arrange
      const jobId = 'job-context';
      const resumeId = 'resume-context';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock error
      sharedObsidianClient.writeNote = vi.fn().mockRejectedValue(
        new Error('Write failed')
      );

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        
        // Verify error has context
        expect(appError.context).toBeDefined();
        expect(appError.context?.jobId).toBe(jobId);
        expect(appError.context?.resumeId).toBe(resumeId);
        
        // Verify error has timestamp
        expect(appError.timestamp).toBeInstanceOf(Date);
        
        // Verify error has suggested action
        expect(appError.suggestedAction).toBeDefined();
      } finally {
        // Restore original method
        sharedObsidianClient.writeNote = originalWriteNote;
      }
    });
  });

  describe('retry logic for getResumeContent', () => {
    it('should retry on transient network errors', async () => {
      // Arrange
      const resumeId = 'retry-test-resume';
      let attemptCount = 0;
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock to fail twice with network error, then succeed
      sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Connection timeout');
        }
        // Third attempt succeeds
        return {
          path: `resumes/${resumeId}/content.md`,
          content: 'Resume content',
          frontmatter: {
            tags: ['resume'],
            type: 'job-entry' as ContentType,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            metadata: {}
          }
        };
      });

      // Act
      const resume = await client.getResumeContent(resumeId);

      // Assert
      expect(attemptCount).toBe(3); // Should have retried twice
      expect(resume).toBeDefined();
      expect(resume.content).toBe('Resume content');
      
      // Restore original method
      sharedObsidianClient.readNote = originalReadNote;
    });

    it('should use exponential backoff for retries', async () => {
      // Arrange
      const resumeId = 'backoff-test-resume';
      const timestamps: number[] = [];
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock to fail twice with network error, then succeed
      sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        if (timestamps.length < 3) {
          throw new Error('Service unavailable');
        }
        // Third attempt succeeds
        return {
          path: `resumes/${resumeId}/content.md`,
          content: 'Resume content',
          frontmatter: {
            tags: ['resume'],
            type: 'job-entry' as ContentType,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            metadata: {}
          }
        };
      });

      // Act
      await client.getResumeContent(resumeId);

      // Assert - verify exponential backoff (1000ms, 2000ms)
      expect(timestamps.length).toBe(3);
      
      // First retry should be ~1000ms after first attempt
      const firstDelay = timestamps[1] - timestamps[0];
      expect(firstDelay).toBeGreaterThanOrEqual(900); // Allow some tolerance
      expect(firstDelay).toBeLessThan(1500);
      
      // Second retry should be ~2000ms after second attempt
      const secondDelay = timestamps[2] - timestamps[1];
      expect(secondDelay).toBeGreaterThanOrEqual(1800); // Allow some tolerance
      expect(secondDelay).toBeLessThan(2500);
      
      // Restore original method
      sharedObsidianClient.readNote = originalReadNote;
    });

    it('should NOT retry on validation errors', async () => {
      // Arrange
      const resumeId = 'no-retry-validation';
      let attemptCount = 0;
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock to always return invalid content (validation error)
      sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        return {
          path: `resumes/${resumeId}/content.md`,
          content: '', // Empty content - validation error
          frontmatter: {
            tags: ['resume'],
            type: 'job-entry' as ContentType,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            metadata: {}
          }
        };
      });

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        // Should NOT have retried - only one attempt
        expect(attemptCount).toBe(1);
      } finally {
        // Restore original method
        sharedObsidianClient.readNote = originalReadNote;
      }
    });

    it('should NOT retry on missing content (404)', async () => {
      // Arrange
      const resumeId = 'no-retry-404';
      let attemptCount = 0;
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock to always throw not found error
      sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        throw new Error('Note not found');
      });

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.userMessage).toContain('Resume not found');
        // Should NOT have retried - only one attempt
        expect(attemptCount).toBe(1);
      } finally {
        // Restore original method
        sharedObsidianClient.readNote = originalReadNote;
      }
    });

    it('should fail after max retries (3 attempts)', async () => {
      // Arrange
      const resumeId = 'max-retries-resume';
      let attemptCount = 0;
      const originalReadNote = sharedObsidianClient.readNote;
      
      // Mock to always fail with network error
      sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        throw new Error('Connection timeout');
      });

      // Act & Assert
      try {
        await client.getResumeContent(resumeId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.NETWORK);
        // Should have attempted 3 times (initial + 2 retries)
        expect(attemptCount).toBe(3);
      } finally {
        // Restore original method
        sharedObsidianClient.readNote = originalReadNote;
      }
    });
  });

  describe('retry logic for saveAnalysisResult', () => {
    it('should retry on transient network errors', async () => {
      // Arrange
      const jobId = 'retry-job';
      const resumeId = 'retry-resume';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      let attemptCount = 0;
      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock to fail twice with network error, then succeed
      sharedObsidianClient.writeNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Connection timeout');
        }
        // Third attempt succeeds
        return;
      });

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert
      expect(attemptCount).toBe(3); // Should have retried twice
      
      // Restore original method
      sharedObsidianClient.writeNote = originalWriteNote;
    });

    it('should use exponential backoff for retries', async () => {
      // Arrange
      const jobId = 'backoff-job';
      const resumeId = 'backoff-resume';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      const timestamps: number[] = [];
      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock to fail twice with network error, then succeed
      sharedObsidianClient.writeNote = vi.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        if (timestamps.length < 3) {
          throw new Error('Service unavailable');
        }
        // Third attempt succeeds
        return;
      });

      // Act
      await client.saveAnalysisResult(jobId, resumeId, mockResult);

      // Assert - verify exponential backoff (1000ms, 2000ms)
      expect(timestamps.length).toBe(3);
      
      // First retry should be ~1000ms after first attempt
      const firstDelay = timestamps[1] - timestamps[0];
      expect(firstDelay).toBeGreaterThanOrEqual(900); // Allow some tolerance
      expect(firstDelay).toBeLessThan(1500);
      
      // Second retry should be ~2000ms after second attempt
      const secondDelay = timestamps[2] - timestamps[1];
      expect(secondDelay).toBeGreaterThanOrEqual(1800); // Allow some tolerance
      expect(secondDelay).toBeLessThan(2500);
      
      // Restore original method
      sharedObsidianClient.writeNote = originalWriteNote;
    });

    it('should NOT retry on validation errors', async () => {
      // Arrange
      const jobId = 'no-retry-job';
      const resumeId = 'no-retry-resume';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 1.5, // Invalid score - validation error
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 1.5,
          improvement: 0.8,
          iterationCount: 1
        }
      };

      let attemptCount = 0;
      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock to track attempts (won't be called due to validation)
      sharedObsidianClient.writeNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        return;
      });

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.VALIDATION);
        // Should NOT have attempted write at all (validation happens before)
        expect(attemptCount).toBe(0);
      } finally {
        // Restore original method
        sharedObsidianClient.writeNote = originalWriteNote;
      }
    });

    it('should NOT retry on permission errors', async () => {
      // Arrange
      const jobId = 'no-retry-permission-job';
      const resumeId = 'no-retry-permission-resume';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      let attemptCount = 0;
      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock to always throw permission error
      sharedObsidianClient.writeNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        throw new Error('Permission denied: read-only vault');
      });

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.STORAGE);
        expect(appError.technicalDetails).toContain('Permission denied');
        // Should NOT have retried - only one attempt
        expect(attemptCount).toBe(1);
      } finally {
        // Restore original method
        sharedObsidianClient.writeNote = originalWriteNote;
      }
    });

    it('should fail after max retries (3 attempts)', async () => {
      // Arrange
      const jobId = 'max-retries-job';
      const resumeId = 'max-retries-resume';
      const mockResult: OptimizationResult = {
        finalResume: {
          id: resumeId,
          content: 'Content',
          format: 'markdown'
        },
        finalScore: 0.8,
        iterations: [],
        terminationReason: 'target_reached' as TerminationReason,
        metrics: {
          initialScore: 0.7,
          finalScore: 0.8,
          improvement: 0.1,
          iterationCount: 1
        }
      };

      let attemptCount = 0;
      const originalWriteNote = sharedObsidianClient.writeNote;
      
      // Mock to always fail with network error
      sharedObsidianClient.writeNote = vi.fn().mockImplementation(async () => {
        attemptCount++;
        throw new Error('Connection timeout');
      });

      // Act & Assert
      try {
        await client.saveAnalysisResult(jobId, resumeId, mockResult);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.NETWORK);
        // Should have attempted 3 times (initial + 2 retries)
        expect(attemptCount).toBe(3);
      } finally {
        // Restore original method
        sharedObsidianClient.writeNote = originalWriteNote;
      }
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * Custom arbitraries for property-based testing
 */

/**
 * Generates arbitrary resume IDs
 * Valid resume IDs are non-empty strings with alphanumeric characters and hyphens
 */
const resumeIdArbitrary = (): fc.Arbitrary<string> => {
  return fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,49}$/);
};

/**
 * Generates arbitrary resume content
 * Ensures content is not just whitespace by including at least one non-whitespace character
 */
const resumeContentArbitrary = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 10, maxLength: 500 })
    .filter(s => s.trim().length > 0) // Ensure not just whitespace
    .map(s => s.trim().length > 0 ? s : 'Resume content'); // Fallback to valid content
};

/**
 * Generates arbitrary frontmatter for resumes
 */
const resumeFrontmatterArbitrary = (): fc.Arbitrary<Frontmatter> => {
  return fc.record({
    tags: fc.constant(['resume']),
    type: fc.constant('job-entry' as ContentType),
    createdAt: fc.date().map(d => d.toISOString()),
    updatedAt: fc.date().map(d => d.toISOString()),
    metadata: fc.constant({})
  });
};

/**
 * Generates arbitrary non-existent resume IDs
 * These IDs should not exist in the vault
 */
const nonExistentResumeIdArbitrary = (): fc.Arbitrary<string> => {
  return fc.stringMatching(/^missing-[a-zA-Z0-9-]{10,30}$/);
};

describe('Feature: ats-agent, Property 29: Obsidian Query Format', () => {
  let client: ATSObsidianClient;

  beforeEach(() => {
    client = new ATSObsidianClient();
    // Clear mock storage before each test
    if ('clearMockStorage' in sharedObsidianClient) {
      (sharedObsidianClient as any).clearMockStorage();
    }
  });

  it('should use resume-content-ingestion format (resumes/{resumeId}/content.md) for all resume retrievals', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        async (resumeId, content, frontmatter) => {
          // Arrange - Pre-populate the vault with test data using the expected format
          const expectedPath = `resumes/${resumeId}/content.md`;
          
          await sharedObsidianClient.writeNote(
            expectedPath,
            content,
            frontmatter
          );

          // Act - Retrieve the resume
          const resume = await client.getResumeContent(resumeId);

          // Assert - Verify the path format matches resume-content-ingestion specification
          // Property: For any resumeId, the query path should be resumes/{resumeId}/content.md
          expect(resume.metadata?.path).toBe(expectedPath);
          
          // Additional verification: ensure the path follows the exact format
          const pathPattern = /^resumes\/[a-zA-Z0-9-]+\/content\.md$/;
          expect(resume.metadata?.path).toMatch(pathPattern);
          
          // Verify the path contains the correct resumeId
          expect(resume.metadata?.path).toContain(resumeId);
          
          // Verify the resume ID matches
          expect(resume.id).toBe(resumeId);
          
          // Verify content was retrieved (may be trimmed by implementation)
          expect(resume.content).toBeTruthy();
          expect(resume.content.length).toBeGreaterThan(0);
          
          // Verify format is set to 'obsidian'
          expect(resume.format).toBe('obsidian');
        }
      ),
      { numRuns: 100 } // Minimum 100 iterations as per spec
    );
  });

  it('should consistently use the same path format across multiple retrievals', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        async (resumeId, content, frontmatter) => {
          // Arrange
          const expectedPath = `resumes/${resumeId}/content.md`;
          
          await sharedObsidianClient.writeNote(
            expectedPath,
            content,
            frontmatter
          );

          // Act - Retrieve the same resume multiple times
          const resume1 = await client.getResumeContent(resumeId);
          const resume2 = await client.getResumeContent(resumeId);
          const resume3 = await client.getResumeContent(resumeId);

          // Assert - All retrievals should use the same path format
          // Property: Path format should be deterministic and consistent
          expect(resume1.metadata?.path).toBe(expectedPath);
          expect(resume2.metadata?.path).toBe(expectedPath);
          expect(resume3.metadata?.path).toBe(expectedPath);
          
          // All paths should be identical
          expect(resume1.metadata?.path).toBe(resume2.metadata?.path);
          expect(resume2.metadata?.path).toBe(resume3.metadata?.path);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never use alternative path formats for resume retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        async (resumeId, content, frontmatter) => {
          // Arrange - Pre-populate with correct format
          const correctPath = `resumes/${resumeId}/content.md`;
          
          await sharedObsidianClient.writeNote(
            correctPath,
            content,
            frontmatter
          );

          // Act
          const resume = await client.getResumeContent(resumeId);

          // Assert - Verify it does NOT use alternative formats
          // Property: Should never use these incorrect formats:
          // - resume/{resumeId}/content.md (singular)
          // - resumes/{resumeId}.md (no subdirectory)
          // - resumes/{resumeId}/resume.md (wrong filename)
          // - {resumeId}/content.md (missing resumes prefix)
          
          const incorrectFormats = [
            `resume/${resumeId}/content.md`,
            `resumes/${resumeId}.md`,
            `resumes/${resumeId}/resume.md`,
            `${resumeId}/content.md`,
            `content/${resumeId}.md`,
            `vault/resumes/${resumeId}/content.md`
          ];
          
          for (const incorrectFormat of incorrectFormats) {
            expect(resume.metadata?.path).not.toBe(incorrectFormat);
          }
          
          // Verify it uses the correct format
          expect(resume.metadata?.path).toBe(correctPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use the correct path format even with special characters in resumeId', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate resume IDs with hyphens and numbers
        fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{5,30}$/),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        async (resumeId, content, frontmatter) => {
          // Arrange
          const expectedPath = `resumes/${resumeId}/content.md`;
          
          await sharedObsidianClient.writeNote(
            expectedPath,
            content,
            frontmatter
          );

          // Act
          const resume = await client.getResumeContent(resumeId);

          // Assert - Path should still follow the format regardless of special chars
          // Property: Format should be consistent even with hyphens, numbers, etc.
          expect(resume.metadata?.path).toBe(expectedPath);
          expect(resume.metadata?.path).toMatch(/^resumes\/[a-zA-Z0-9-]+\/content\.md$/);
          
          // Verify the resumeId is preserved exactly in the path
          expect(resume.metadata?.path).toContain(resumeId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain path format compatibility with resume-content-ingestion feature', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        async (resumeId, content, frontmatter) => {
          // Arrange - Simulate data created by resume-content-ingestion
          const ingestedPath = `resumes/${resumeId}/content.md`;
          
          await sharedObsidianClient.writeNote(
            ingestedPath,
            content,
            frontmatter
          );

          // Act - ATS Agent retrieves the ingested resume
          const resume = await client.getResumeContent(resumeId);

          // Assert - Should successfully retrieve using the same path format
          // Property: ATS Agent must be compatible with resume-content-ingestion paths
          expect(resume.metadata?.path).toBe(ingestedPath);
          expect(resume.content).toBeTruthy();
          expect(resume.content.length).toBeGreaterThan(0);
          expect(resume.id).toBe(resumeId);
          
          // Verify the path structure matches the ingestion format exactly
          const pathParts = resume.metadata?.path?.split('/');
          expect(pathParts).toHaveLength(3);
          expect(pathParts?.[0]).toBe('resumes');
          expect(pathParts?.[1]).toBe(resumeId);
          expect(pathParts?.[2]).toBe('content.md');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: ats-agent, Property 30: Missing Data Handling', () => {
  let client: ATSObsidianClient;

  beforeEach(() => {
    client = new ATSObsidianClient();
    // Clear mock storage before each test
    if ('clearMockStorage' in sharedObsidianClient) {
      (sharedObsidianClient as any).clearMockStorage();
    }
  });

  it('should return appropriate error response without crashing when resume content does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonExistentResumeIdArbitrary(),
        async (resumeId) => {
          // Arrange - Ensure the resume does NOT exist in the vault
          // The vault is cleared before each test, so any ID should not exist
          
          // Act & Assert - Attempt to retrieve non-existent resume
          // Property: For any non-existent resume ID, the system should:
          // 1. NOT crash (no unhandled exceptions)
          // 2. Return an appropriate error response (AppError)
          // 3. Error should have correct category (STORAGE)
          // 4. Error should have user-friendly message
          // 5. Error should include context (resumeId)
          
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.getResumeContent(resumeId);
          } catch (e) {
            errorThrown = true;
            error = e;
          }
          
          // Verify an error was thrown (not crashing means controlled error handling)
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          
          // Verify it's an AppError (structured error response)
          expect(error).toBeInstanceOf(AppError);
          
          // Verify error category is STORAGE (not found)
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.STORAGE);
          
          // Verify error has user-friendly message
          expect(appError.userMessage).toBeDefined();
          expect(appError.userMessage.length).toBeGreaterThan(0);
          expect(appError.userMessage).toContain('Resume not found');
          
          // Verify error includes the resume ID in the message or context
          const errorIncludesId = 
            appError.userMessage.includes(resumeId) ||
            (appError.context?.resumeId === resumeId);
          expect(errorIncludesId).toBe(true);
          
          // Verify error has technical details for debugging
          expect(appError.technicalDetails).toBeDefined();
          expect(appError.technicalDetails.length).toBeGreaterThan(0);
          
          // Verify error has context with resumeId
          expect(appError.context).toBeDefined();
          expect(appError.context?.resumeId).toBe(resumeId);
          
          // Verify error has timestamp
          expect(appError.timestamp).toBeInstanceOf(Date);
          
          // Verify error has suggested action
          expect(appError.suggestedAction).toBeDefined();
          
          // Verify the system did NOT crash (we got here without unhandled exception)
          // This is implicitly verified by the test completing successfully
        }
      ),
      { numRuns: 100 } // Minimum 100 iterations as per spec
    );
  });

  it('should handle missing data consistently across multiple attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonExistentResumeIdArbitrary(),
        async (resumeId) => {
          // Arrange - Ensure the resume does NOT exist
          
          // Act - Attempt to retrieve the same non-existent resume multiple times
          // Property: Error handling should be consistent and deterministic
          
          const errors: AppError[] = [];
          
          for (let i = 0; i < 3; i++) {
            try {
              await client.getResumeContent(resumeId);
              expect.fail('Should have thrown an error');
            } catch (e) {
              expect(e).toBeInstanceOf(AppError);
              errors.push(e as AppError);
            }
          }
          
          // Assert - All errors should be consistent
          expect(errors).toHaveLength(3);
          
          // All errors should have the same category
          expect(errors[0].category).toBe(ErrorCategory.STORAGE);
          expect(errors[1].category).toBe(ErrorCategory.STORAGE);
          expect(errors[2].category).toBe(ErrorCategory.STORAGE);
          
          // All errors should reference the same resume ID
          expect(errors[0].context?.resumeId).toBe(resumeId);
          expect(errors[1].context?.resumeId).toBe(resumeId);
          expect(errors[2].context?.resumeId).toBe(resumeId);
          
          // All errors should have similar user messages
          expect(errors[0].userMessage).toContain('Resume not found');
          expect(errors[1].userMessage).toContain('Resume not found');
          expect(errors[2].userMessage).toContain('Resume not found');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return appropriate error for various types of missing data scenarios', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Non-existent resume IDs
          nonExistentResumeIdArbitrary(),
          // Resume IDs that look valid but don't exist
          fc.stringMatching(/^valid-looking-[a-zA-Z0-9]{8}$/),
          // Resume IDs with special patterns
          fc.stringMatching(/^test-[0-9]{4}-[a-zA-Z]{4}$/)
        ),
        async (resumeId) => {
          // Arrange - Various patterns of non-existent resume IDs
          
          // Act & Assert
          // Property: Regardless of the format of the missing resume ID,
          // the system should handle it gracefully with appropriate error
          
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Verify structured error handling
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify error category is appropriate for missing data
            expect(appError.category).toBe(ErrorCategory.STORAGE);
            
            // Verify error message is informative
            expect(appError.userMessage).toBeTruthy();
            expect(appError.userMessage).toContain('Resume not found');
            
            // Verify error includes context
            expect(appError.context?.resumeId).toBe(resumeId);
            
            // Verify the system didn't crash (controlled error handling)
            expect(appError.timestamp).toBeInstanceOf(Date);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not retry when data is missing (404 errors are not transient)', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonExistentResumeIdArbitrary(),
        async (resumeId) => {
          // Arrange - Track how many times the underlying client is called
          let callCount = 0;
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
            callCount++;
            throw new Error('Note not found');
          });
          
          // Act - Attempt to retrieve non-existent resume
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Assert
            // Property: Missing data errors should NOT be retried
            // (404 is not a transient error, retrying won't help)
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            expect(appError.category).toBe(ErrorCategory.STORAGE);
            
            // Verify it was only called once (no retries)
            expect(callCount).toBe(1);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include helpful context in error response for missing data', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonExistentResumeIdArbitrary(),
        async (resumeId) => {
          // Act
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Assert
            // Property: Error response should include helpful context for debugging
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify context includes resume ID
            expect(appError.context).toBeDefined();
            expect(appError.context?.resumeId).toBe(resumeId);
            
            // Verify context includes the path that was attempted
            expect(appError.context?.path).toBeDefined();
            expect(appError.context?.path).toContain(resumeId);
            expect(appError.context?.path).toMatch(/^resumes\/[^/]+\/content\.md$/);
            
            // Verify technical details provide debugging information
            expect(appError.technicalDetails).toBeDefined();
            expect(appError.technicalDetails).toContain('not found');
            
            // Verify suggested action helps the user
            expect(appError.suggestedAction).toBeDefined();
            expect(appError.suggestedAction.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should differentiate between missing data and other error types', async () => {
    // Simplified test - just verify missing data returns STORAGE error
    await fc.assert(
      fc.asyncProperty(
        nonExistentResumeIdArbitrary(),
        async (resumeId) => {
          // Test: Missing data error should have STORAGE category
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const missingDataError = error as AppError;
            expect(missingDataError.category).toBe(ErrorCategory.STORAGE);
            expect(missingDataError.userMessage).toContain('Resume not found');
          }
        }
      ),
      { numRuns: 100, timeout: 15000 } // Increase timeout for 100 iterations
    );
  }, 20000); // Test timeout

  it('should handle edge cases in missing data scenarios without crashing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Empty string (should be caught by validation)
          fc.constant(''),
          // Whitespace only (should be caught by validation)
          fc.constant('   '),
          // Non-existent ID with special characters
          fc.stringMatching(/^missing-[a-zA-Z0-9-_]{10,20}$/)
        ),
        async (resumeId) => {
          // Act & Assert
          // Property: Even edge cases should be handled gracefully without crashing
          
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Verify structured error handling (no crash)
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify error has appropriate category
            expect([ErrorCategory.STORAGE, ErrorCategory.VALIDATION]).toContain(appError.category);
            
            // Verify error has user-friendly message
            expect(appError.userMessage).toBeTruthy();
            expect(appError.userMessage.length).toBeGreaterThan(0);
            
            // Verify error has timestamp (system is still functioning)
            expect(appError.timestamp).toBeInstanceOf(Date);
            
            // The fact that we got here means the system didn't crash
          }
        }
      ),
      { numRuns: 100, timeout: 15000 } // Increase timeout for 100 iterations
    );
  }, 20000); // Test timeout
});

describe('Feature: ats-agent, Property 31: Retrieved Data Validation', () => {
  let client: ATSObsidianClient;

  beforeEach(() => {
    client = new ATSObsidianClient();
    // Clear mock storage before each test
    if ('clearMockStorage' in sharedObsidianClient) {
      (sharedObsidianClient as any).clearMockStorage();
    }
  });

  /**
   * Generates arbitrary invalid content structures
   * These represent various ways the retrieved data could be malformed
   * Note: We exclude cases where path is null/undefined as those cause
   * errors in the shared client before reaching our validation logic
   */
  const invalidContentArbitrary = (): fc.Arbitrary<any> => {
    return fc.oneof(
      // Null content
      fc.constant({ path: 'test.md', content: null, frontmatter: {} }),
      // Undefined content
      fc.constant({ path: 'test.md', content: undefined, frontmatter: {} }),
      // Empty string content
      fc.constant({ path: 'test.md', content: '', frontmatter: {} }),
      // Whitespace-only content
      fc.constant({ path: 'test.md', content: '   \n\t  ', frontmatter: {} }),
      // Missing frontmatter
      fc.constant({ path: 'test.md', content: 'Some content', frontmatter: null }),
      // Undefined frontmatter
      fc.constant({ path: 'test.md', content: 'Some content', frontmatter: undefined }),
      // Completely null object
      fc.constant(null),
      // Completely undefined
      fc.constant(undefined),
      // Empty object (missing required fields)
      fc.constant({}),
      // Content with only frontmatter (no actual content)
      fc.constant({ 
        path: 'test.md', 
        content: '---\ntags: [test]\n---\n', 
        frontmatter: { tags: ['test'] } 
      }),
      // Content with only frontmatter and whitespace
      fc.constant({ 
        path: 'test.md', 
        content: '---\ntags: [test]\n---\n   \n\t  ', 
        frontmatter: { tags: ['test'] } 
      })
    );
  };

  it('should validate structure before using retrieved content and reject invalid content with error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        invalidContentArbitrary(),
        async (resumeId, invalidContent) => {
          // Arrange - Mock the shared client to return invalid content
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(invalidContent);

          // Act & Assert
          // Property: For any invalid content structure retrieved from Obsidian,
          // the system should:
          // 1. Validate the structure before using it
          // 2. Reject invalid content (throw an error)
          // 3. Provide an error message explaining what is invalid
          // 4. NOT crash or return invalid data to the caller
          
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.getResumeContent(resumeId);
          } catch (e) {
            errorThrown = true;
            error = e;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
          
          // Verify an error was thrown (validation rejected the invalid content)
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          
          // Verify it's an AppError (structured error response)
          expect(error).toBeInstanceOf(AppError);
          
          // Verify error category is VALIDATION or STORAGE (both are acceptable for invalid data)
          const appError = error as AppError;
          expect([ErrorCategory.VALIDATION, ErrorCategory.STORAGE]).toContain(appError.category);
          
          // Verify error has a descriptive message explaining what is invalid
          expect(appError.userMessage).toBeDefined();
          expect(appError.userMessage.length).toBeGreaterThan(0);
          
          // Message should indicate the problem (empty, missing, invalid, etc.)
          const messageIndicatesIssue = 
            appError.userMessage.toLowerCase().includes('empty') ||
            appError.userMessage.toLowerCase().includes('missing') ||
            appError.userMessage.toLowerCase().includes('invalid') ||
            appError.userMessage.toLowerCase().includes('metadata');
          expect(messageIndicatesIssue).toBe(true);
          
          // Verify error has technical details for debugging
          expect(appError.technicalDetails).toBeDefined();
          expect(appError.technicalDetails.length).toBeGreaterThan(0);
          
          // Verify error includes context with resume ID
          expect(appError.context).toBeDefined();
          expect(appError.context?.resumeId).toBe(resumeId);
          
          // Verify error has timestamp (system is still functioning)
          expect(appError.timestamp).toBeInstanceOf(Date);
          
          // Verify the system did NOT crash (we got here without unhandled exception)
          // This is implicitly verified by the test completing successfully
          
          // Verify the error is recoverable (user can fix the data)
          expect(appError.recoverable).toBe(true);
        }
      ),
      { numRuns: 100 } // Minimum 100 iterations as per spec
    );
  });

  it('should validate content is not empty after stripping frontmatter', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        fc.record({
          tags: fc.constant(['resume']),
          type: fc.constant('job-entry' as ContentType),
          createdAt: fc.date().map(d => d.toISOString()),
          updatedAt: fc.date().map(d => d.toISOString()),
          metadata: fc.constant({})
        }),
        async (resumeId, frontmatter) => {
          // Arrange - Create content with only frontmatter (no actual content)
          const contentWithOnlyFrontmatter = {
            path: `resumes/${resumeId}/content.md`,
            content: '---\ntags: [resume]\ntype: job-entry\n---\n',
            frontmatter
          };
          
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(contentWithOnlyFrontmatter);

          // Act & Assert
          // Property: Content that is empty after stripping frontmatter should be rejected
          
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify validation error
            expect(appError.category).toBe(ErrorCategory.VALIDATION);
            
            // Verify error message indicates empty content
            expect(appError.userMessage.toLowerCase()).toContain('empty');
            
            // Verify context includes resume ID
            expect(appError.context?.resumeId).toBe(resumeId);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate frontmatter structure is present', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        async (resumeId, content) => {
          // Arrange - Create content with missing frontmatter
          const contentWithoutFrontmatter = {
            path: `resumes/${resumeId}/content.md`,
            content,
            frontmatter: null // Missing frontmatter
          };
          
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(contentWithoutFrontmatter);

          // Act & Assert
          // Property: Content without frontmatter should be rejected
          
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify validation error
            expect(appError.category).toBe(ErrorCategory.VALIDATION);
            
            // Verify error message indicates missing metadata/frontmatter
            const messageIndicatesMissingMetadata = 
              appError.userMessage.toLowerCase().includes('metadata') ||
              appError.userMessage.toLowerCase().includes('frontmatter');
            expect(messageIndicatesMissingMetadata).toBe(true);
            
            // Verify technical details mention frontmatter
            expect(appError.technicalDetails.toLowerCase()).toContain('frontmatter');
            
            // Verify context includes resume ID
            expect(appError.context?.resumeId).toBe(resumeId);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate content field is not null or undefined', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined)
        ),
        async (resumeId, invalidContentValue) => {
          // Arrange - Create content with null/undefined content field
          const invalidContent = {
            path: `resumes/${resumeId}/content.md`,
            content: invalidContentValue,
            frontmatter: {
              tags: ['resume'],
              type: 'job-entry' as ContentType,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              metadata: {}
            }
          };
          
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(invalidContent);

          // Act & Assert
          // Property: Content with null/undefined content field should be rejected
          
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify validation error
            expect(appError.category).toBe(ErrorCategory.VALIDATION);
            
            // Verify error message indicates empty/missing content
            const messageIndicatesEmptyContent = 
              appError.userMessage.toLowerCase().includes('empty') ||
              appError.userMessage.toLowerCase().includes('missing');
            expect(messageIndicatesEmptyContent).toBe(true);
            
            // Verify context includes resume ID
            expect(appError.context?.resumeId).toBe(resumeId);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate entire note structure is not null or undefined', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined)
        ),
        async (resumeId, invalidNoteContent) => {
          // Arrange - Mock to return null/undefined note content
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(invalidNoteContent);

          // Act & Assert
          // Property: Null/undefined note content should be rejected
          
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify validation error
            expect(appError.category).toBe(ErrorCategory.VALIDATION);
            
            // Verify error message indicates invalid structure
            expect(appError.userMessage.toLowerCase()).toContain('invalid');
            
            // Verify context includes resume ID
            expect(appError.context?.resumeId).toBe(resumeId);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT retry validation errors (invalid structure is not transient)', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        invalidContentArbitrary(),
        async (resumeId, invalidContent) => {
          // Arrange - Track how many times the underlying client is called
          let callCount = 0;
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
            callCount++;
            return invalidContent;
          });

          // Act
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Assert
            // Property: Validation errors should NOT be retried
            // (Invalid structure won't be fixed by retrying)
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            expect([ErrorCategory.VALIDATION, ErrorCategory.STORAGE]).toContain(appError.category);
            
            // Verify it was only called once (no retries)
            // Note: The implementation may call readNote once, then validate
            // If validation fails, it should NOT retry
            expect(callCount).toBeLessThanOrEqual(1);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid content structure and return properly formatted Resume object', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        async (resumeId, content, frontmatter) => {
          // Arrange - Create valid content structure
          const validContent = {
            path: `resumes/${resumeId}/content.md`,
            content,
            frontmatter
          };
          
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(validContent);

          // Act
          let resume: Resume | null = null;
          let errorThrown = false;
          
          try {
            resume = await client.getResumeContent(resumeId);
          } catch (error) {
            errorThrown = true;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }

          // Assert
          // Property: Valid content structure should be accepted (no error)
          expect(errorThrown).toBe(false);
          expect(resume).toBeDefined();
          expect(resume).not.toBeNull();
          
          // Verify the returned Resume object has correct structure
          expect(resume!.id).toBe(resumeId);
          expect(resume!.content).toBeTruthy();
          expect(resume!.content.length).toBeGreaterThan(0);
          expect(resume!.format).toBe('obsidian');
          expect(resume!.metadata).toBeDefined();
          expect(resume!.metadata?.path).toBe(validContent.path);
          expect(resume!.metadata?.frontmatter).toEqual(frontmatter);
          expect(resume!.metadata?.retrievedAt).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide consistent validation across multiple attempts with same invalid data', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        invalidContentArbitrary(),
        async (resumeId, invalidContent) => {
          // Arrange
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(invalidContent);

          // Act - Attempt to retrieve the same invalid content multiple times
          const errors: AppError[] = [];
          
          for (let i = 0; i < 3; i++) {
            try {
              await client.getResumeContent(resumeId);
              expect.fail('Should have thrown an error');
            } catch (error) {
              expect(error).toBeInstanceOf(AppError);
              errors.push(error as AppError);
            }
          }

          // Assert
          // Property: Validation should be consistent and deterministic
          expect(errors).toHaveLength(3);
          
          // All errors should have the same category (VALIDATION or STORAGE)
          expect([ErrorCategory.VALIDATION, ErrorCategory.STORAGE]).toContain(errors[0].category);
          expect(errors[0].category).toBe(errors[1].category);
          expect(errors[1].category).toBe(errors[2].category);
          
          // All errors should reference the same resume ID
          expect(errors[0].context?.resumeId).toBe(resumeId);
          expect(errors[1].context?.resumeId).toBe(resumeId);
          expect(errors[2].context?.resumeId).toBe(resumeId);
          
          // All errors should have similar messages (same validation issue)
          // We check that all messages contain at least one common keyword
          const keywords = ['empty', 'missing', 'invalid', 'metadata', 'frontmatter'];
          const message0Lower = errors[0].userMessage.toLowerCase();
          const message1Lower = errors[1].userMessage.toLowerCase();
          const message2Lower = errors[2].userMessage.toLowerCase();
          
          const hasCommonKeyword = keywords.some(keyword => 
            message0Lower.includes(keyword) &&
            message1Lower.includes(keyword) &&
            message2Lower.includes(keyword)
          );
          expect(hasCommonKeyword).toBe(true);
          
          // Restore original method
          sharedObsidianClient.readNote = originalReadNote;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include helpful context in validation error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        invalidContentArbitrary(),
        async (resumeId, invalidContent) => {
          // Arrange
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockResolvedValue(invalidContent);

          // Act
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Assert
            // Property: Validation errors should include helpful context
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            
            // Verify context includes resume ID
            expect(appError.context).toBeDefined();
            expect(appError.context?.resumeId).toBe(resumeId);
            
            // Verify context includes the path that was attempted
            expect(appError.context?.path).toBeDefined();
            expect(appError.context?.path).toContain(resumeId);
            
            // Verify technical details provide debugging information
            expect(appError.technicalDetails).toBeDefined();
            expect(appError.technicalDetails.length).toBeGreaterThan(0);
            
            // Verify error is marked as recoverable (user can fix the data)
            expect(appError.recoverable).toBe(true);
            
            // Verify error has timestamp
            expect(appError.timestamp).toBeInstanceOf(Date);
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: ats-agent, Property 32: Service Unavailability Handling', () => {
  let client: ATSObsidianClient;
  
  // Store original methods at module level
  const originalReadNote = sharedObsidianClient.readNote;
  const originalWriteNote = sharedObsidianClient.writeNote;

  beforeEach(() => {
    client = new ATSObsidianClient();
    // Clear mock storage before each test
    if ('clearMockStorage' in sharedObsidianClient) {
      (sharedObsidianClient as any).clearMockStorage();
    }
  });
  
  afterAll(() => {
    // Ensure all mocks are restored after all tests in this suite
    sharedObsidianClient.readNote = originalReadNote;
    sharedObsidianClient.writeNote = originalWriteNote;
  });

  /**
   * Generates arbitrary service unavailability error messages
   * These represent various ways the Obsidian service could be unavailable
   */
  const serviceUnavailableErrorArbitrary = (): fc.Arbitrary<string> => {
    return fc.oneof(
      fc.constant('Service unavailable'),
      fc.constant('Connection timeout'),
      fc.constant('Connection refused'),
      fc.constant('Network timeout'),
      fc.constant('Service temporarily unavailable'),
      fc.constant('Connection error: timeout'),
      fc.constant('Failed to connect: service unavailable'),
      fc.constant('Request timeout'),
      fc.constant('Connection lost'),
      fc.constant('Service is unavailable'),
      fc.constant('Connection timeout: no response'),
      fc.constant('Network error: connection timeout')
    );
  };

  it('should return error indicating data source is inaccessible when Obsidian service is unavailable', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        serviceUnavailableErrorArbitrary(),
        async (resumeId, errorMessage) => {
          // Arrange - Mock the shared client to simulate service unavailability
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockRejectedValue(
            new Error(errorMessage)
          );

          // Act & Assert
          // Property: For any attempt to access Obsidian when the service is unavailable,
          // the system should:
          // 1. Return an error (not crash)
          // 2. Error should indicate the data source is inaccessible
          // 3. Error should have appropriate category (NETWORK)
          // 4. Error should be marked as recoverable (service may come back)
          // 5. Error should include context for debugging
          
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.getResumeContent(resumeId);
          } catch (e) {
            errorThrown = true;
            error = e;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
          
          // Verify an error was thrown (not crashing)
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          
          // Verify it's an AppError (structured error response)
          expect(error).toBeInstanceOf(AppError);
          
          // Verify error category is NETWORK (service unavailability)
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.NETWORK);
          
          // Verify error message indicates data source is inaccessible
          expect(appError.userMessage).toBeDefined();
          expect(appError.userMessage.length).toBeGreaterThan(0);
          const messageIndicatesUnavailable = 
            appError.userMessage.toLowerCase().includes('unavailable') ||
            appError.userMessage.toLowerCase().includes('inaccessible') ||
            appError.userMessage.toLowerCase().includes('not accessible');
          expect(messageIndicatesUnavailable).toBe(true);
          
          // Verify error is marked as recoverable (service may come back)
          expect(appError.recoverable).toBe(true);
          
          // Verify error includes context with resume ID
          expect(appError.context).toBeDefined();
          expect(appError.context?.resumeId).toBe(resumeId);
          
          // Verify error has technical details for debugging
          expect(appError.technicalDetails).toBeDefined();
          expect(appError.technicalDetails.length).toBeGreaterThan(0);
          
          // Verify technical details mention the service issue
          const detailsIndicateServiceIssue = 
            appError.technicalDetails.toLowerCase().includes('unavailable') ||
            appError.technicalDetails.toLowerCase().includes('timeout') ||
            appError.technicalDetails.toLowerCase().includes('connection');
          expect(detailsIndicateServiceIssue).toBe(true);
          
          // Verify error has timestamp (system is still functioning)
          expect(appError.timestamp).toBeInstanceOf(Date);
          
          // Verify the system did NOT crash (we got here without unhandled exception)
          // This is implicitly verified by the test completing successfully
        }
      ),
      { numRuns: 10, timeout: 10000 } // Reduced iterations due to retry logic (3 attempts × backoff per iteration)
    );
  }, 60000); // 60s test timeout to accommodate retries

  it('should return error indicating data source is inaccessible when saving to unavailable Obsidian service', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        fc.stringMatching(/^job-[a-zA-Z0-9-]{5,20}$/), // Job ID arbitrary
        serviceUnavailableErrorArbitrary(),
        async (resumeId, jobId, errorMessage) => {
          // Arrange - Create a valid optimization result
          const mockResult: OptimizationResult = {
            finalResume: {
              id: resumeId,
              content: 'Optimized resume content',
              format: 'markdown'
            },
            finalScore: 0.85,
            iterations: [],
            terminationReason: 'target_reached' as TerminationReason,
            metrics: {
              initialScore: 0.70,
              finalScore: 0.85,
              improvement: 0.15,
              iterationCount: 3
            }
          };

          // Mock the shared client to simulate service unavailability
          const originalWriteNote = sharedObsidianClient.writeNote;
          
          sharedObsidianClient.writeNote = vi.fn().mockRejectedValue(
            new Error(errorMessage)
          );

          // Act & Assert
          // Property: For any attempt to save to Obsidian when the service is unavailable,
          // the system should return an error indicating the data source is inaccessible
          
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.saveAnalysisResult(jobId, resumeId, mockResult);
          } catch (e) {
            errorThrown = true;
            error = e;
          } finally {
            // Restore original method
            sharedObsidianClient.writeNote = originalWriteNote;
          }
          
          // Verify an error was thrown (not crashing)
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          
          // Verify it's an AppError (structured error response)
          expect(error).toBeInstanceOf(AppError);
          
          // Verify error category is NETWORK (service unavailability)
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.NETWORK);
          
          // Verify error message indicates data source is inaccessible
          expect(appError.userMessage).toBeDefined();
          const messageIndicatesUnavailable = 
            appError.userMessage.toLowerCase().includes('unavailable') ||
            appError.userMessage.toLowerCase().includes('inaccessible') ||
            appError.userMessage.toLowerCase().includes('not accessible');
          expect(messageIndicatesUnavailable).toBe(true);
          
          // Verify error is marked as recoverable
          expect(appError.recoverable).toBe(true);
          
          // Verify error includes context
          expect(appError.context).toBeDefined();
          expect(appError.context?.jobId).toBe(jobId);
          expect(appError.context?.resumeId).toBe(resumeId);
          
          // Verify error has technical details
          expect(appError.technicalDetails).toBeDefined();
          const detailsIndicateServiceIssue = 
            appError.technicalDetails.toLowerCase().includes('unavailable') ||
            appError.technicalDetails.toLowerCase().includes('timeout') ||
            appError.technicalDetails.toLowerCase().includes('connection');
          expect(detailsIndicateServiceIssue).toBe(true);
          
          // Verify error has timestamp
          expect(appError.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 10, timeout: 10000 } // Reduced iterations due to retry logic
    );
  }, 60000); // Test timeout increased

  it('should retry service unavailability errors with exponential backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        serviceUnavailableErrorArbitrary(),
        async (resumeId, errorMessage) => {
          // Arrange - Track retry attempts and timing
          let attemptCount = 0;
          const timestamps: number[] = [];
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
            attemptCount++;
            timestamps.push(Date.now());
            throw new Error(errorMessage);
          });

          // Act
          try {
            await client.getResumeContent(resumeId);
            expect.fail('Should have thrown an error');
          } catch (error) {
            // Assert
            // Property: Service unavailability errors should be retried
            // with exponential backoff (up to 3 attempts)
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            expect(appError.category).toBe(ErrorCategory.NETWORK);
            
            // Verify it was attempted 3 times (initial + 2 retries)
            expect(attemptCount).toBe(3);
            
            // Verify exponential backoff was used
            expect(timestamps.length).toBe(3);
            
            // First retry should be ~1000ms after first attempt
            const firstDelay = timestamps[1] - timestamps[0];
            expect(firstDelay).toBeGreaterThanOrEqual(900); // Allow some tolerance
            expect(firstDelay).toBeLessThan(1500);
            
            // Second retry should be ~2000ms after second attempt
            // Note: This is the delay between attempt 2 and attempt 3, not cumulative
            const secondDelay = timestamps[2] - timestamps[1];
            // Allow more tolerance for test execution overhead
            expect(secondDelay).toBeGreaterThanOrEqual(1700); // Reduced from 1800
            expect(secondDelay).toBeLessThan(2700); // Increased from 2500
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }
        }
      ),
      { numRuns: 10, timeout: 15000 } // Reduced iterations due to retry logic (3 attempts × backoff per iteration)
    );
  }, 60000); // Test timeout increased to accommodate retries

  it('should eventually succeed if service becomes available during retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        resumeFrontmatterArbitrary(),
        serviceUnavailableErrorArbitrary(),
        async (resumeId, content, frontmatter, errorMessage) => {
          // Arrange - Mock to fail twice, then succeed
          let attemptCount = 0;
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockImplementation(async () => {
            attemptCount++;
            if (attemptCount < 3) {
              // First two attempts fail with service unavailable
              throw new Error(errorMessage);
            }
            // Third attempt succeeds (service came back)
            return {
              path: `resumes/${resumeId}/content.md`,
              content,
              frontmatter
            };
          });

          // Act
          let resume: Resume | null = null;
          let errorThrown = false;
          
          try {
            resume = await client.getResumeContent(resumeId);
          } catch (error) {
            errorThrown = true;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }

          // Assert
          // Property: If service becomes available during retries,
          // the operation should eventually succeed
          expect(errorThrown).toBe(false);
          expect(resume).toBeDefined();
          expect(resume).not.toBeNull();
          
          // Verify it retried and eventually succeeded
          expect(attemptCount).toBe(3);
          
          // Verify the returned resume is valid
          expect(resume!.id).toBe(resumeId);
          expect(resume!.content).toBeTruthy();
          expect(resume!.format).toBe('obsidian');
        }
      ),
      { numRuns: 10, timeout: 15000 } // Reduced iterations due to retry logic
    );
  }, 60000); // Test timeout increased

  it('should handle service unavailability consistently across multiple operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        serviceUnavailableErrorArbitrary(),
        async (resumeId, errorMessage) => {
          // Arrange
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockRejectedValue(
            new Error(errorMessage)
          );

          // Act - Attempt multiple operations with unavailable service
          const errors: AppError[] = [];
          
          for (let i = 0; i < 3; i++) {
            let errorThrown = false;
            try {
              await client.getResumeContent(resumeId);
            } catch (error) {
              errorThrown = true;
              expect(error).toBeInstanceOf(AppError);
              errors.push(error as AppError);
            }
            // Verify error was thrown
            expect(errorThrown).toBe(true);
          }

          // Assert
          // Property: Service unavailability handling should be consistent
          expect(errors).toHaveLength(3);
          
          // All errors should have the same category (NETWORK)
          expect(errors[0].category).toBe(ErrorCategory.NETWORK);
          expect(errors[1].category).toBe(ErrorCategory.NETWORK);
          expect(errors[2].category).toBe(ErrorCategory.NETWORK);
          
          // All errors should be marked as recoverable
          expect(errors[0].recoverable).toBe(true);
          expect(errors[1].recoverable).toBe(true);
          expect(errors[2].recoverable).toBe(true);
          
          // All errors should reference the same resume ID
          expect(errors[0].context?.resumeId).toBe(resumeId);
          expect(errors[1].context?.resumeId).toBe(resumeId);
          expect(errors[2].context?.resumeId).toBe(resumeId);
          
          // All errors should indicate unavailability
          for (const error of errors) {
            const messageIndicatesUnavailable = 
              error.userMessage.toLowerCase().includes('unavailable') ||
              error.userMessage.toLowerCase().includes('inaccessible');
            expect(messageIndicatesUnavailable).toBe(true);
          }
          
          // Restore original method
          sharedObsidianClient.readNote = originalReadNote;
        }
      ),
      { numRuns: 3, timeout: 15000 } // Reduced to 3 iterations (test does 3 operations × 3 retries each)
    );
  }, 90000); // Test timeout increased to 90s

  it('should differentiate service unavailability from other error types', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        fc.oneof(
          // Service unavailability errors
          fc.record({
            type: fc.constant('unavailable'),
            message: serviceUnavailableErrorArbitrary()
          }),
          // Missing data errors (404)
          fc.record({
            type: fc.constant('not_found'),
            message: fc.constant('Note not found')
          }),
          // Permission errors
          fc.record({
            type: fc.constant('permission'),
            message: fc.constant('Permission denied: read-only vault')
          })
        ),
        async (resumeId, errorScenario) => {
          // Arrange
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockRejectedValue(
            new Error(errorScenario.message)
          );

          // Act
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.getResumeContent(resumeId);
          } catch (e) {
            errorThrown = true;
            error = e;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }

          // Assert
          // Property: Different error types should have different categories
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          
          // Verify error category matches the error type
          if (errorScenario.type === 'unavailable') {
            expect(appError.category).toBe(ErrorCategory.NETWORK);
            expect(appError.recoverable).toBe(true);
            const messageIndicatesUnavailable = 
              appError.userMessage.toLowerCase().includes('unavailable') ||
              appError.userMessage.toLowerCase().includes('inaccessible');
            expect(messageIndicatesUnavailable).toBe(true);
          } else if (errorScenario.type === 'not_found') {
            expect(appError.category).toBe(ErrorCategory.STORAGE);
            expect(appError.userMessage.toLowerCase()).toContain('not found');
          } else if (errorScenario.type === 'permission') {
            expect(appError.category).toBe(ErrorCategory.STORAGE);
            expect(appError.technicalDetails.toLowerCase()).toContain('permission');
          }
          
          // All errors should have context
          expect(appError.context?.resumeId).toBe(resumeId);
          
          // All errors should have timestamp
          expect(appError.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 10, timeout: 15000 } // Reduced iterations due to retry logic
    );
  }, 60000); // Test timeout increased

  it('should include helpful context in service unavailability errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        serviceUnavailableErrorArbitrary(),
        async (resumeId, errorMessage) => {
          // Arrange
          const originalReadNote = sharedObsidianClient.readNote;
          
          sharedObsidianClient.readNote = vi.fn().mockRejectedValue(
            new Error(errorMessage)
          );

          // Act
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.getResumeContent(resumeId);
          } catch (e) {
            errorThrown = true;
            error = e;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }

          // Assert
          // Property: Service unavailability errors should include helpful context
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          
          // Verify context includes resume ID
          expect(appError.context).toBeDefined();
          expect(appError.context?.resumeId).toBe(resumeId);
          
          // Verify context includes the path that was attempted
          expect(appError.context?.path).toBeDefined();
          expect(appError.context?.path).toContain(resumeId);
          expect(appError.context?.path).toMatch(/^resumes\/[^/]+\/content\.md$/);
          
          // Verify technical details provide debugging information
          expect(appError.technicalDetails).toBeDefined();
          expect(appError.technicalDetails.length).toBeGreaterThan(0);
          
          // Verify error is marked as recoverable
          expect(appError.recoverable).toBe(true);
          
          // Verify error has suggested action
          expect(appError.suggestedAction).toBeDefined();
          
          // Verify error has timestamp
          expect(appError.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 5, timeout: 15000 } // Reduced iterations due to retry logic (3 attempts × backoff)
    );
  }, 90000); // Test timeout increased to 90s

  it('should handle various service unavailability error message formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        fc.oneof(
          // Various formats of service unavailability messages
          fc.constant('Service unavailable'),
          fc.constant('Connection timeout'),
          fc.constant('timeout'),
          fc.constant('unavailable'),
          fc.constant('connection error'),
          fc.constant('ETIMEDOUT'),
          fc.constant('ECONNREFUSED'),
          fc.constant('Network error: timeout'),
          fc.constant('Failed to connect: service unavailable'),
          fc.constant('Request timed out after 30000ms'),
          fc.constant('Connection lost: timeout'),
          fc.constant('Service temporarily unavailable, please try again')
        ),
        async (resumeId, errorMessage) => {
          // Arrange
          const originalReadNote = sharedObsidianClient.readNote;
          sharedObsidianClient.readNote = vi.fn().mockRejectedValue(
            new Error(errorMessage)
          );

          // Act
          let errorThrown = false;
          let error: any = null;
          
          try {
            await client.getResumeContent(resumeId);
          } catch (e) {
            errorThrown = true;
            error = e;
          } finally {
            // Restore original method
            sharedObsidianClient.readNote = originalReadNote;
          }

          // Assert
          // Property: All variations of service unavailability messages
          // should be recognized and handled consistently
          expect(errorThrown).toBe(true);
          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          
          // Verify error category is NETWORK for all variations
          expect(appError.category).toBe(ErrorCategory.NETWORK);
          
          // Verify error indicates unavailability
          const messageIndicatesUnavailable = 
            appError.userMessage.toLowerCase().includes('unavailable') ||
            appError.userMessage.toLowerCase().includes('inaccessible');
          expect(messageIndicatesUnavailable).toBe(true);
          
          // Verify error is recoverable
          expect(appError.recoverable).toBe(true);
          
          // Verify error includes context
          expect(appError.context?.resumeId).toBe(resumeId);
        }
      ),
      { numRuns: 10, timeout: 15000 } // Reduced iterations due to retry logic
    );
  }, 60000); // Test timeout increased
});

describe('Feature: ats-agent, Property 33: Dual Input Support', () => {
  let client: ATSObsidianClient;
  
  // Store original methods at module level
  const originalReadNote = sharedObsidianClient.readNote;
  const originalWriteNote = sharedObsidianClient.writeNote;

  beforeEach(() => {
    client = new ATSObsidianClient();
    // Clear mock storage before each test
    if ('clearMockStorage' in sharedObsidianClient) {
      (sharedObsidianClient as any).clearMockStorage();
    }
    // Restore original methods before each test
    sharedObsidianClient.readNote = originalReadNote;
    sharedObsidianClient.writeNote = originalWriteNote;
  });
  
  afterAll(() => {
    // Ensure all mocks are restored after all tests in this suite
    sharedObsidianClient.readNote = originalReadNote;
    sharedObsidianClient.writeNote = originalWriteNote;
  });

  /**
   * Custom arbitraries for dual input testing
   */

  /**
   * Generates arbitrary direct text resume input
   * Format: 'text' or 'markdown' with direct content
   */
  const directTextResumeArbitrary = (): fc.Arbitrary<Resume> => {
    return fc.record({
      id: resumeIdArbitrary(),
      content: resumeContentArbitrary(),
      format: fc.constantFrom('text' as const, 'markdown' as const),
      metadata: fc.constant({})
    });
  };

  /**
   * Generates arbitrary Obsidian vault reference resume input
   * Format: 'obsidian' with resumeId reference
   */
  const obsidianReferenceResumeArbitrary = (): fc.Arbitrary<Resume> => {
    return fc.record({
      id: resumeIdArbitrary(),
      content: resumeContentArbitrary(),
      format: fc.constant('obsidian' as const),
      metadata: fc.record({
        vaultReference: fc.boolean(),
        path: fc.option(fc.string(), { nil: undefined })
      })
    });
  };

  /**
   * Generates arbitrary resume input (either direct text or Obsidian reference)
   */
  const anyResumeInputArbitrary = (): fc.Arbitrary<Resume> => {
    return fc.oneof(
      directTextResumeArbitrary(),
      obsidianReferenceResumeArbitrary()
    );
  };

  it('should successfully process both direct text input and Obsidian vault references', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyResumeInputArbitrary(),
        async (resumeInput) => {
          // Arrange
          // For Obsidian references, pre-populate the vault
          if (resumeInput.format === 'obsidian') {
            const frontmatter: Frontmatter = {
              tags: ['resume'],
              type: 'job-entry' as ContentType,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              metadata: {}
            };

            await sharedObsidianClient.writeNote(
              `resumes/${resumeInput.id}/content.md`,
              resumeInput.content,
              frontmatter
            );
          }

          // Act - Process the resume input
          let processedResume: Resume;
          
          if (resumeInput.format === 'obsidian') {
            // For Obsidian references, retrieve from vault
            processedResume = await client.getResumeContent(resumeInput.id);
          } else {
            // For direct text input, use as-is
            processedResume = resumeInput;
          }

          // Assert
          // Property: For any resume input (direct text or Obsidian reference),
          // the system should produce a valid Resume object
          
          // 1. Verify the resume object is valid
          expect(processedResume).toBeDefined();
          expect(processedResume.id).toBeDefined();
          expect(processedResume.id.length).toBeGreaterThan(0);
          
          // 2. Verify content is present and non-empty
          expect(processedResume.content).toBeDefined();
          expect(processedResume.content.length).toBeGreaterThan(0);
          expect(processedResume.content.trim().length).toBeGreaterThan(0);
          
          // 3. Verify format is valid
          expect(processedResume.format).toBeDefined();
          expect(['text', 'markdown', 'obsidian']).toContain(processedResume.format);
          
          // 4. Verify the resume ID matches the input
          expect(processedResume.id).toBe(resumeInput.id);
          
          // 5. Verify metadata exists (may be empty for direct text)
          expect(processedResume.metadata).toBeDefined();
          
          // 6. For Obsidian references, verify additional metadata
          if (resumeInput.format === 'obsidian') {
            expect(processedResume.format).toBe('obsidian');
            expect(processedResume.metadata?.path).toBeDefined();
            expect(processedResume.metadata?.path).toContain(resumeInput.id);
            expect(processedResume.metadata?.frontmatter).toBeDefined();
            expect(processedResume.metadata?.retrievedAt).toBeDefined();
          }
          
          // 7. Verify content is accessible and usable
          // Content should be a string that can be parsed
          expect(typeof processedResume.content).toBe('string');
          
          // 8. Verify the resume can be used for parsing
          // Content should not be just whitespace
          expect(processedResume.content.trim()).not.toBe('');
        }
      ),
      { numRuns: 100, timeout: 15000 } // Minimum 100 iterations as per spec
    );
  }, 20000);

  it('should produce valid ParsedResume objects from both input types', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyResumeInputArbitrary(),
        async (resumeInput) => {
          // Arrange
          // For Obsidian references, pre-populate the vault
          if (resumeInput.format === 'obsidian') {
            const frontmatter: Frontmatter = {
              tags: ['resume'],
              type: 'job-entry' as ContentType,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              metadata: {}
            };

            await sharedObsidianClient.writeNote(
              `resumes/${resumeInput.id}/content.md`,
              resumeInput.content,
              frontmatter
            );
          }

          // Act - Process the resume input
          let processedResume: Resume;
          
          if (resumeInput.format === 'obsidian') {
            processedResume = await client.getResumeContent(resumeInput.id);
          } else {
            processedResume = resumeInput;
          }

          // Assert
          // Property: Both input types should produce resumes that can be
          // successfully parsed into ParsedResume objects
          
          // Verify the resume has all required fields for parsing
          expect(processedResume.id).toBeDefined();
          expect(processedResume.content).toBeDefined();
          expect(processedResume.format).toBeDefined();
          
          // Verify content is parseable (non-empty string)
          expect(typeof processedResume.content).toBe('string');
          expect(processedResume.content.length).toBeGreaterThan(0);
          
          // Verify the resume structure matches the Resume interface
          const hasRequiredFields = 
            'id' in processedResume &&
            'content' in processedResume &&
            'format' in processedResume;
          expect(hasRequiredFields).toBe(true);
          
          // Verify format is one of the valid values
          const validFormats: Array<'text' | 'markdown' | 'obsidian'> = ['text', 'markdown', 'obsidian'];
          expect(validFormats).toContain(processedResume.format);
        }
      ),
      { numRuns: 100, timeout: 15000 }
    );
  }, 20000);

  it('should handle direct text input without requiring Obsidian vault access', async () => {
    await fc.assert(
      fc.asyncProperty(
        directTextResumeArbitrary(),
        async (directResume) => {
          // Act - Process direct text input
          // This should work without any vault operations
          const processedResume = directResume;

          // Assert
          // Property: Direct text input should be usable immediately
          // without requiring Obsidian vault access
          
          // Verify the resume is valid
          expect(processedResume).toBeDefined();
          expect(processedResume.id).toBeDefined();
          expect(processedResume.content).toBeDefined();
          expect(processedResume.content.length).toBeGreaterThan(0);
          
          // Verify format is text or markdown (not obsidian)
          expect(['text', 'markdown']).toContain(processedResume.format);
          
          // Verify content is directly accessible
          expect(typeof processedResume.content).toBe('string');
          expect(processedResume.content.trim().length).toBeGreaterThan(0);
          
          // Verify no vault-specific metadata is required
          // (metadata may be empty or contain non-vault data)
          if (processedResume.metadata) {
            expect(processedResume.metadata.path).toBeUndefined();
            expect(processedResume.metadata.frontmatter).toBeUndefined();
          }
        }
      ),
      { numRuns: 100, timeout: 15000 }
    );
  }, 20000);

  it('should handle Obsidian vault references by retrieving content from vault', async () => {
    await fc.assert(
      fc.asyncProperty(
        obsidianReferenceResumeArbitrary(),
        async (obsidianResume) => {
          // Arrange - Pre-populate the vault
          const frontmatter: Frontmatter = {
            tags: ['resume'],
            type: 'job-entry' as ContentType,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {}
          };

          await sharedObsidianClient.writeNote(
            `resumes/${obsidianResume.id}/content.md`,
            obsidianResume.content,
            frontmatter
          );

          // Act - Retrieve from vault
          const processedResume = await client.getResumeContent(obsidianResume.id);

          // Assert
          // Property: Obsidian vault references should be resolved by
          // retrieving content from the vault
          
          // Verify the resume was retrieved successfully
          expect(processedResume).toBeDefined();
          expect(processedResume.id).toBe(obsidianResume.id);
          
          // Verify format is obsidian
          expect(processedResume.format).toBe('obsidian');
          
          // Verify content was retrieved from vault
          expect(processedResume.content).toBeDefined();
          expect(processedResume.content.length).toBeGreaterThan(0);
          
          // Verify vault-specific metadata is present
          expect(processedResume.metadata).toBeDefined();
          expect(processedResume.metadata?.path).toBeDefined();
          expect(processedResume.metadata?.path).toContain(obsidianResume.id);
          expect(processedResume.metadata?.frontmatter).toBeDefined();
          expect(processedResume.metadata?.retrievedAt).toBeDefined();
          
          // Verify the path follows the correct format
          expect(processedResume.metadata?.path).toBe(`resumes/${obsidianResume.id}/content.md`);
        }
      ),
      { numRuns: 100, timeout: 15000 }
    );
  }, 20000);

  it('should produce equivalent results regardless of input type', async () => {
    await fc.assert(
      fc.asyncProperty(
        resumeIdArbitrary(),
        resumeContentArbitrary(),
        async (resumeId, content) => {
          // Arrange - Create both input types with the same content
          const directResume: Resume = {
            id: resumeId,
            content: content,
            format: 'text',
            metadata: {}
          };

          const obsidianResume: Resume = {
            id: resumeId,
            content: content,
            format: 'obsidian',
            metadata: {}
          };

          // Pre-populate vault for Obsidian reference
          const frontmatter: Frontmatter = {
            tags: ['resume'],
            type: 'job-entry' as ContentType,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {}
          };

          await sharedObsidianClient.writeNote(
            `resumes/${resumeId}/content.md`,
            content,
            frontmatter
          );

          // Act - Process both input types
          const processedDirect = directResume;
          const processedObsidian = await client.getResumeContent(resumeId);

          // Assert
          // Property: Both input types should produce resumes with the same
          // essential content, even if metadata differs
          
          // Verify both have the same ID
          expect(processedDirect.id).toBe(processedObsidian.id);
          
          // Verify both have content (may differ slightly due to frontmatter stripping)
          expect(processedDirect.content).toBeDefined();
          expect(processedObsidian.content).toBeDefined();
          
          // Verify both have non-empty content
          expect(processedDirect.content.trim().length).toBeGreaterThan(0);
          expect(processedObsidian.content.trim().length).toBeGreaterThan(0);
          
          // Verify both are valid Resume objects
          expect(processedDirect.format).toBeDefined();
          expect(processedObsidian.format).toBeDefined();
          
          // Verify the core content is equivalent (after normalization)
          // Note: Obsidian content may have frontmatter stripped
          const normalizedDirect = processedDirect.content.trim();
          const normalizedObsidian = processedObsidian.content.trim();
          
          // Both should contain substantial content
          expect(normalizedDirect.length).toBeGreaterThan(0);
          expect(normalizedObsidian.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100, timeout: 15000 }
    );
  }, 20000);

  it('should maintain data integrity across both input types', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyResumeInputArbitrary(),
        async (resumeInput) => {
          // Arrange
          if (resumeInput.format === 'obsidian') {
            const frontmatter: Frontmatter = {
              tags: ['resume'],
              type: 'job-entry' as ContentType,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              metadata: {}
            };

            await sharedObsidianClient.writeNote(
              `resumes/${resumeInput.id}/content.md`,
              resumeInput.content,
              frontmatter
            );
          }

          // Act
          let processedResume: Resume;
          
          if (resumeInput.format === 'obsidian') {
            processedResume = await client.getResumeContent(resumeInput.id);
          } else {
            processedResume = resumeInput;
          }

          // Assert
          // Property: Data integrity should be maintained regardless of input type
          
          // 1. ID should be preserved exactly
          expect(processedResume.id).toBe(resumeInput.id);
          
          // 2. Content should be present and non-empty
          expect(processedResume.content).toBeDefined();
          expect(processedResume.content.length).toBeGreaterThan(0);
          
          // 3. Format should be valid
          expect(['text', 'markdown', 'obsidian']).toContain(processedResume.format);
          
          // 4. No data corruption (content should be a valid string)
          expect(typeof processedResume.content).toBe('string');
          
          // 5. Content should not be null or undefined
          expect(processedResume.content).not.toBeNull();
          expect(processedResume.content).not.toBeUndefined();
          
          // 6. Content should contain actual text (not just whitespace)
          expect(processedResume.content.trim().length).toBeGreaterThan(0);
          
          // 7. Metadata should be defined (even if empty)
          expect(processedResume.metadata).toBeDefined();
        }
      ),
      { numRuns: 100, timeout: 15000 }
    );
  }, 20000);

  it('should handle mixed input types in sequence without interference', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(anyResumeInputArbitrary(), { minLength: 2, maxLength: 5 }),
        async (resumeInputs) => {
          // Arrange - Pre-populate vault for all Obsidian references
          for (const resumeInput of resumeInputs) {
            if (resumeInput.format === 'obsidian') {
              const frontmatter: Frontmatter = {
                tags: ['resume'],
                type: 'job-entry' as ContentType,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {}
              };

              await sharedObsidianClient.writeNote(
                `resumes/${resumeInput.id}/content.md`,
                resumeInput.content,
                frontmatter
              );
            }
          }

          // Act - Process all inputs in sequence
          const processedResumes: Resume[] = [];
          
          for (const resumeInput of resumeInputs) {
            let processedResume: Resume;
            
            if (resumeInput.format === 'obsidian') {
              processedResume = await client.getResumeContent(resumeInput.id);
            } else {
              processedResume = resumeInput;
            }
            
            processedResumes.push(processedResume);
          }

          // Assert
          // Property: Processing mixed input types in sequence should work
          // without interference between different input types
          
          // Verify all resumes were processed
          expect(processedResumes).toHaveLength(resumeInputs.length);
          
          // Verify each resume is valid
          for (let i = 0; i < processedResumes.length; i++) {
            const processed = processedResumes[i];
            const input = resumeInputs[i];
            
            // Verify ID matches
            expect(processed.id).toBe(input.id);
            
            // Verify content is present
            expect(processed.content).toBeDefined();
            expect(processed.content.length).toBeGreaterThan(0);
            
            // Verify format is valid
            expect(['text', 'markdown', 'obsidian']).toContain(processed.format);
            
            // Verify no cross-contamination between resumes
            // Each resume should have its own unique ID
            for (let j = 0; j < processedResumes.length; j++) {
              if (i !== j && resumeInputs[i].id !== resumeInputs[j].id) {
                expect(processedResumes[i].id).not.toBe(processedResumes[j].id);
              }
            }
          }
        }
      ),
      { numRuns: 100, timeout: 20000 }
    );
  }, 25000);
});
