/**
 * Integration Tests for ATS Agent
 * 
 * Tests end-to-end optimization loop, component interactions,
 * and external agent communication.
 * 
 * Requirements: All (integration testing)
 */

import 'dotenv/config';
import { describe, it, expect, beforeEach } from 'vitest';
import { ATSAgentOrchestrator, createATSAgent, analyzeResume } from '../../ats-agent/orchestrator';
import { ExternalAgentClient } from '../../ats-agent/communication/agentClient';
import {
  convertJobSearchPayload,
  convertToResumeWriterRequest,
  convertResumeWriterResponse,
  convertToJobSearchResult
} from '../../ats-agent/communication/protocols';
import { ConfigManager, initializeConfig } from '../../ats-agent/config';
import type {
  JobPosting,
  Resume,
  Recommendations,
  OptimizationResult
} from '../../ats-agent/types';
import type {
  JobSearchPayload,
  ResumeWriterRequest,
  ResumeWriterResponse
} from '../../ats-agent/communication/protocols';

// ============================================================================
// Test Data
// ============================================================================

const testJobPosting: JobPosting = {
  id: 'job-123',
  title: 'Senior Software Engineer',
  description: 'We are looking for an experienced software engineer with strong Python and JavaScript skills.',
  requirements: 'Required: Python, JavaScript, React. Preferred: TypeScript, Node.js',
  qualifications: 'Bachelor\'s degree in Computer Science or equivalent. 5+ years of experience.',
  metadata: {}
};

const testResume: Resume = {
  id: 'resume-456',
  content: 'Experienced software engineer with 6 years of Python development. Proficient in Django and Flask.',
  format: 'text',
  metadata: {}
};

const testJobSearchPayload: JobSearchPayload = {
  job: {
    id: 'job-123',
    title: 'Senior Software Engineer',
    company: 'Tech Corp',
    description: 'We are looking for an experienced software engineer.',
    requirements: 'Python, JavaScript required',
    qualifications: 'Bachelor\'s degree',
    posted_date: '2024-01-15',
    location: 'San Francisco, CA',
    salary_range: '$120k-$180k'
  },
  metadata: {
    source: 'LinkedIn',
    url: 'https://example.com/job/123',
    retrieved_at: '2024-01-16T10:00:00Z'
  }
};

// ============================================================================
// End-to-End Optimization Loop Tests
// ============================================================================

describe('End-to-End Optimization Loop', () => {
  let agent: ATSAgentOrchestrator;

  beforeEach(() => {
    agent = createATSAgent({
      targetScore: 0.8,
      maxIterations: 3,
      earlyStoppingRounds: 2,
      minImprovement: 0.01
    });
  });

  it('should perform single-shot analysis', async () => {
    const result = await agent.analyzeMatch(testJobPosting, testResume);

    expect(result.matchResult).toBeDefined();
    expect(result.matchResult.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.matchResult.overallScore).toBeLessThanOrEqual(1);

    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.summary).toBeDefined();

    expect(result.parsedJob).toBeDefined();
    expect(result.parsedJob.elements.length).toBeGreaterThan(0);

    expect(result.parsedResume).toBeDefined();
    expect(result.parsedResume.elements.length).toBeGreaterThan(0);
  });

  it('should run optimization loop with mock Resume Writer Agent', async () => {
    let iterationCount = 0;

    const mockResumeWriter = async (
      recommendations: Recommendations,
      iteration: number
    ): Promise<Resume> => {
      iterationCount++;

      // Simulate resume improvement
      const improvedContent = testResume.content + ` Added skills: ${recommendations.priority.map(r => r.element).join(', ')}`;

      return {
        id: testResume.id,
        content: improvedContent,
        format: 'text',
        metadata: {
          version: iteration + 1,
          changes_made: recommendations.priority.map(r => r.suggestion)
        }
      };
    };

    const result = await agent.optimize(
      testJobPosting,
      testResume,
      mockResumeWriter
    );

    expect(result).toBeDefined();
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(1);
    expect(result.iterations.length).toBeGreaterThan(0);
    expect(result.iterations.length).toBeLessThanOrEqual(3);
    expect(result.terminationReason).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.metrics.iterationCount).toBe(iterationCount);
  });

  it('should terminate on target score reached', async () => {
    const mockResumeWriter = async (): Promise<Resume> => {
      // Return a resume that will score very high
      return {
        id: testResume.id,
        content: 'Python JavaScript React TypeScript Node.js expert with 10 years experience',
        format: 'text',
        metadata: { version: 2 }
      };
    };

    const result = await agent.optimize(
      testJobPosting,
      testResume,
      mockResumeWriter
    );

    // Should terminate quickly if target is reached
    expect(result.terminationReason).toBeDefined();
    expect(result.iterations.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// Component Interaction Tests
// ============================================================================

describe('Component Interactions', () => {
  it('should integrate parser, analyzer, scorer, and recommender', async () => {
    const result = await analyzeResume(testJobPosting, testResume);

    // All components should work together
    expect(result.matchResult).toBeDefined();
    expect(result.matchResult.breakdown).toBeDefined();
    expect(result.matchResult.gaps).toBeDefined();
    expect(result.matchResult.strengths).toBeDefined();

    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.priority).toBeDefined();
    expect(result.recommendations.optional).toBeDefined();
    expect(result.recommendations.rewording).toBeDefined();
  });

  it('should maintain consistency across multiple analyses', async () => {
    const result1 = await analyzeResume(testJobPosting, testResume);
    const result2 = await analyzeResume(testJobPosting, testResume);

    // Same inputs should produce same scores (deterministic)
    expect(result1.matchResult.overallScore).toBe(result2.matchResult.overallScore);
  });
});

// ============================================================================
// External Agent Communication Tests
// ============================================================================

describe('External Agent Communication', () => {
  let agentClient: ExternalAgentClient;

  beforeEach(() => {
    agentClient = new ExternalAgentClient();
  });

  it('should convert job search payload to internal format', () => {
    const jobPosting = convertJobSearchPayload(testJobSearchPayload);

    expect(jobPosting.id).toBe(testJobSearchPayload.job.id);
    expect(jobPosting.title).toBe(testJobSearchPayload.job.title);
    expect(jobPosting.description).toBe(testJobSearchPayload.job.description);
    expect(jobPosting.metadata?.company).toBe(testJobSearchPayload.job.company);
  });

  it('should validate and accept valid job posting', async () => {
    const response = await agentClient.receiveJobPosting(testJobSearchPayload);

    expect(response.status).toBe('accepted');
    expect(response.job_id).toBe(testJobSearchPayload.job.id);
  });

  it('should reject invalid job posting', async () => {
    const invalidPayload: JobSearchPayload = {
      ...testJobSearchPayload,
      job: {
        ...testJobSearchPayload.job,
        id: '', // Invalid: empty ID
        title: '' // Invalid: empty title
      }
    };

    const response = await agentClient.receiveJobPosting(invalidPayload);

    expect(response.status).toBe('rejected');
    expect(response.errors).toBeDefined();
    expect(response.errors!.length).toBeGreaterThan(0);
  });

  it('should send recommendations to Resume Writer Agent', async () => {
    const mockHandler = async (request: ResumeWriterRequest): Promise<ResumeWriterResponse> => {
      return {
        response_id: 'resp-789',
        request_id: request.request_id,
        resume_id: request.resume_id,
        resume: {
          id: request.resume_id,
          content: 'Updated resume content',
          format: 'text',
          version: 2
        },
        changes_made: ['Added Python experience', 'Added JavaScript skills'],
        metadata: {
          timestamp: new Date().toISOString(),
          processing_time_ms: 1500
        }
      };
    };

    const result = await analyzeResume(testJobPosting, testResume);
    
    const request = convertToResumeWriterRequest(
      'req-123',
      testJobPosting.id,
      testResume.id,
      1,
      result.matchResult,
      result.recommendations,
      []
    );

    const response = await agentClient.sendRecommendations(request, mockHandler);

    expect(response.response_id).toBeDefined();
    expect(response.resume.content).toBeDefined();
    expect(response.changes_made.length).toBeGreaterThan(0);
  });

  it('should convert Resume Writer response to internal format', () => {
    const response: ResumeWriterResponse = {
      response_id: 'resp-789',
      request_id: 'req-123',
      resume_id: 'resume-456',
      resume: {
        id: 'resume-456',
        content: 'Updated content',
        format: 'text',
        version: 2
      },
      changes_made: ['Change 1', 'Change 2'],
      metadata: {
        timestamp: '2024-01-16T10:00:00Z',
        processing_time_ms: 1500
      }
    };

    const resume = convertResumeWriterResponse(response);

    expect(resume.id).toBe(response.resume.id);
    expect(resume.content).toBe(response.resume.content);
    expect(resume.metadata?.version).toBe(2);
    expect(resume.metadata?.changes_made).toEqual(response.changes_made);
  });

  it('should convert optimization result to job search result format', () => {
    const optimizationResult: OptimizationResult = {
      finalResume: testResume,
      finalScore: 0.85,
      iterations: [],
      terminationReason: 'target_reached',
      metrics: {
        initialScore: 0.60,
        finalScore: 0.85,
        improvement: 0.25,
        iterationCount: 3
      }
    };

    const result = convertToJobSearchResult(
      testJobPosting.id,
      testResume.id,
      optimizationResult
    );

    expect(result.job_id).toBe(testJobPosting.id);
    expect(result.resume_id).toBe(testResume.id);
    expect(result.final_score).toBe(0.85);
    expect(result.initial_score).toBe(0.60);
    expect(result.improvement).toBe(0.25);
    expect(result.iterations).toBe(3);
    expect(result.termination_reason).toBe('target_reached');
  });
});

// ============================================================================
// Configuration Management Tests
// ============================================================================

describe('Configuration Management', () => {
  it('should load default configuration', () => {
    const config = new ConfigManager();
    const cfg = config.getConfig();

    expect(cfg.optimization.targetScore).toBe(0.8);
    expect(cfg.optimization.maxIterations).toBe(10);
    expect(cfg.scoring.dimensionWeights.skills).toBe(0.35);
  });

  it('should merge custom configuration with defaults', () => {
    const config = new ConfigManager({
      optimization: {
        targetScore: 0.9,
        maxIterations: 5,
        earlyStoppingRounds: 2,
        minImprovement: 0.01
      }
    });

    const cfg = config.getConfig();

    expect(cfg.optimization.targetScore).toBe(0.9);
    expect(cfg.optimization.maxIterations).toBe(5);
    // Other defaults should remain
    expect(cfg.scoring.dimensionWeights.skills).toBe(0.35);
  });

  it('should validate configuration on creation', () => {
    expect(() => {
      new ConfigManager({
        optimization: {
          targetScore: 1.5, // Invalid: > 1.0
          maxIterations: 10,
          earlyStoppingRounds: 2,
          minImprovement: 0.01
        }
      });
    }).toThrow();
  });

  it('should validate dimension weights sum to 1.0', () => {
    expect(() => {
      new ConfigManager({
        scoring: {
          dimensionWeights: {
            keywords: 0.5,
            skills: 0.5,
            attributes: 0.5, // Sum > 1.0
            experience: 0.0,
            level: 0.0
          }
        }
      });
    }).toThrow();
  });

  it('should update configuration dynamically', () => {
    const config = new ConfigManager();
    
    config.updateConfig({
      optimization: {
        targetScore: 0.85,
        maxIterations: 10,
        earlyStoppingRounds: 2,
        minImprovement: 0.01
      }
    });

    const cfg = config.getConfig();
    expect(cfg.optimization.targetScore).toBe(0.85);
  });
});
