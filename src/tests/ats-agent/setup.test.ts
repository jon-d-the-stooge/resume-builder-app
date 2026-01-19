/**
 * ATS Agent Setup Tests
 * 
 * Basic tests to verify the ATS Agent project structure and type definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  TAG_TAXONOMY,
  DEFAULT_CONFIG,
  type JobPosting,
  type Resume,
  type Element,
  type ParsedJob,
  type ParsedResume,
  type SemanticMatch,
  type TaggedElement,
  type MatchResult,
  type Recommendations,
  type OptimizationConfig,
  type OptimizationResult
} from '../../ats-agent/types';

describe('ATS Agent Setup', () => {
  describe('Type Definitions', () => {
    it('should have valid TAG_TAXONOMY structure', () => {
      expect(TAG_TAXONOMY).toBeDefined();
      expect(TAG_TAXONOMY.technical_skills).toBeInstanceOf(Array);
      expect(TAG_TAXONOMY.soft_skills).toBeInstanceOf(Array);
      expect(TAG_TAXONOMY.attributes).toBeInstanceOf(Array);
      expect(TAG_TAXONOMY.concepts).toBeInstanceOf(Array);
    });

    it('should have valid DEFAULT_CONFIG structure', () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.scoring).toBeDefined();
      expect(DEFAULT_CONFIG.iteration).toBeDefined();
      expect(DEFAULT_CONFIG.retry).toBeDefined();
      expect(DEFAULT_CONFIG.cache).toBeDefined();
    });

    it('should have scoring dimension weights that sum to 1.0', () => {
      const weights = DEFAULT_CONFIG.scoring.dimensionWeights;
      const sum = weights.keywords + weights.skills + weights.attributes + 
                  weights.experience + weights.level;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have valid default target score', () => {
      expect(DEFAULT_CONFIG.scoring.targetScore).toBe(0.8);
      expect(DEFAULT_CONFIG.scoring.targetScore).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_CONFIG.scoring.targetScore).toBeLessThanOrEqual(1);
    });

    it('should have valid iteration config', () => {
      expect(DEFAULT_CONFIG.iteration.maxIterations).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.iteration.earlyStoppingRounds).toBeGreaterThan(0);
    });
  });

  describe('Interface Compatibility', () => {
    it('should create valid JobPosting object', () => {
      const jobPosting: JobPosting = {
        id: 'test-job-1',
        title: 'Software Engineer',
        description: 'We are looking for a software engineer',
        requirements: 'Python, JavaScript',
        qualifications: 'Bachelor degree'
      };
      
      expect(jobPosting.id).toBe('test-job-1');
      expect(jobPosting.title).toBe('Software Engineer');
    });

    it('should create valid Resume object', () => {
      const resume: Resume = {
        id: 'test-resume-1',
        content: 'John Doe\nSoftware Engineer',
        format: 'text'
      };
      
      expect(resume.id).toBe('test-resume-1');
      expect(resume.format).toBe('text');
    });

    it('should create valid Element object', () => {
      const element: Element = {
        text: 'Python',
        normalizedText: 'python',
        tags: ['programming', 'technical_skill'],
        context: 'Experience with Python programming',
        position: { start: 0, end: 6 }
      };
      
      expect(element.text).toBe('Python');
      expect(element.tags).toContain('programming');
    });

    it('should create valid OptimizationConfig object', () => {
      const config: OptimizationConfig = {
        targetScore: 0.85,
        maxIterations: 5,
        earlyStoppingRounds: 2,
        minImprovement: 0.01
      };
      
      expect(config.targetScore).toBe(0.85);
      expect(config.maxIterations).toBe(5);
    });
  });

  describe('Environment Configuration', () => {
    it('should have access to environment variables', () => {
      // Check that we can access environment variables
      // (actual values may not be set in test environment)
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const provider = process.env.LLM_PROVIDER;
      
      // Just verify we can read them (they may be undefined in tests)
      expect(['string', 'undefined']).toContain(typeof anthropicKey);
      expect(['string', 'undefined']).toContain(typeof openaiKey);
      expect(['string', 'undefined']).toContain(typeof provider);
    });
  });
});
