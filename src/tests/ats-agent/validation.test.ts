/**
 * Unit Tests for Input Validation
 * 
 * Tests validation with invalid inputs and error message generation.
 * Validates Requirements 8.1, 8.3, 8.4
 */

import { describe, it, expect } from 'vitest';
import {
  jobPostingValidator,
  resumeValidator,
  recommendationsValidator,
  configValidator,
  formatValidationError,
  createMissingFieldError,
  createInvalidFieldError
} from '../../ats-agent/validation';
import type {
  JobPosting,
  Resume,
  Recommendations
} from '../../ats-agent/types';

describe('Job Posting Validation', () => {
  describe('Valid Inputs', () => {
    it('should validate a complete job posting', () => {
      const jobPosting: JobPosting = {
        id: 'job-123',
        title: 'Software Engineer',
        description: 'We are looking for a talented software engineer...',
        requirements: 'Bachelor\'s degree in Computer Science',
        qualifications: '5+ years of experience'
      };

      const result = jobPostingValidator.validate(jobPosting);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate job posting with optional metadata', () => {
      const jobPosting: JobPosting = {
        id: 'job-456',
        title: 'Data Scientist',
        description: 'Join our data science team...',
        requirements: 'PhD in Statistics or related field',
        qualifications: 'Experience with Python and R',
        metadata: {
          location: 'San Francisco, CA',
          salary: '$150,000 - $200,000'
        }
      };

      const result = jobPostingValidator.validate(jobPosting);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate job posting with empty requirements and qualifications', () => {
      const jobPosting: JobPosting = {
        id: 'job-789',
        title: 'Product Manager',
        description: 'Lead product development...',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(jobPosting);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid Inputs', () => {
    it('should reject job posting with missing id', () => {
      const invalidJobPosting = {
        title: 'Software Engineer',
        description: 'We are looking for...',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(err => err.field === 'id')).toBe(true);
    });

    it('should reject job posting with empty id', () => {
      const invalidJobPosting = {
        id: '',
        title: 'Software Engineer',
        description: 'We are looking for...',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'id')).toBe(true);
    });

    it('should reject job posting with missing title', () => {
      const invalidJobPosting = {
        id: 'job-123',
        description: 'We are looking for...',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'title')).toBe(true);
    });

    it('should reject job posting with empty title', () => {
      const invalidJobPosting = {
        id: 'job-123',
        title: '',
        description: 'We are looking for...',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'title')).toBe(true);
    });

    it('should reject job posting with missing description', () => {
      const invalidJobPosting = {
        id: 'job-123',
        title: 'Software Engineer',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'description')).toBe(true);
    });

    it('should reject job posting with empty description', () => {
      const invalidJobPosting = {
        id: 'job-123',
        title: 'Software Engineer',
        description: '',
        requirements: '',
        qualifications: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'description')).toBe(true);
    });

    it('should provide descriptive error messages', () => {
      const invalidJobPosting = {
        id: '',
        title: '',
        description: ''
      };

      const result = jobPostingValidator.validate(invalidJobPosting);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      result.errors.forEach(err => {
        expect(err.field).toBeTruthy();
        expect(err.message).toBeTruthy();
        expect(typeof err.message).toBe('string');
      });
    });
  });
});

describe('Resume Validation', () => {
  describe('Valid Inputs', () => {
    it('should validate resume with text format', () => {
      const resume: Resume = {
        id: 'resume-123',
        content: 'John Doe\nSoftware Engineer\n...',
        format: 'text'
      };

      const result = resumeValidator.validate(resume);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate resume with markdown format', () => {
      const resume: Resume = {
        id: 'resume-456',
        content: '# John Doe\n## Experience\n...',
        format: 'markdown'
      };

      const result = resumeValidator.validate(resume);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate resume with obsidian format', () => {
      const resume: Resume = {
        id: 'resume-789',
        content: '[[Resume Content]]',
        format: 'obsidian'
      };

      const result = resumeValidator.validate(resume);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate resume with optional metadata', () => {
      const resume: Resume = {
        id: 'resume-101',
        content: 'Resume content...',
        format: 'text',
        metadata: {
          lastUpdated: '2024-01-15',
          version: 3
        }
      };

      const result = resumeValidator.validate(resume);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid Inputs', () => {
    it('should reject resume with missing id', () => {
      const invalidResume = {
        content: 'Resume content...',
        format: 'text'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'id')).toBe(true);
    });

    it('should reject resume with empty id', () => {
      const invalidResume = {
        id: '',
        content: 'Resume content...',
        format: 'text'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'id')).toBe(true);
    });

    it('should reject resume with missing content', () => {
      const invalidResume = {
        id: 'resume-123',
        format: 'text'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'content')).toBe(true);
    });

    it('should reject resume with empty content', () => {
      const invalidResume = {
        id: 'resume-123',
        content: '',
        format: 'text'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'content')).toBe(true);
    });

    it('should reject resume with missing format', () => {
      const invalidResume = {
        id: 'resume-123',
        content: 'Resume content...'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'format')).toBe(true);
    });

    it('should reject resume with invalid format', () => {
      const invalidResume = {
        id: 'resume-123',
        content: 'Resume content...',
        format: 'pdf'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'format')).toBe(true);
    });

    it('should provide descriptive error messages', () => {
      const invalidResume = {
        id: '',
        content: '',
        format: 'invalid'
      };

      const result = resumeValidator.validate(invalidResume);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      result.errors.forEach(err => {
        expect(err.field).toBeTruthy();
        expect(err.message).toBeTruthy();
        expect(typeof err.message).toBe('string');
      });
    });
  });
});

describe('Recommendations Validation', () => {
  describe('Valid Inputs', () => {
    it('should validate complete recommendations', () => {
      const recommendations: Recommendations = {
        summary: 'Your resume matches 75% of the job requirements. Focus on adding Python experience.',
        priority: [
          {
            type: 'add_skill',
            element: 'Python',
            importance: 0.9,
            suggestion: 'Add Python programming experience to your skills section',
            example: 'Developed Python scripts for data analysis'
          }
        ],
        optional: [
          {
            type: 'add_experience',
            element: 'Machine Learning',
            importance: 0.6,
            suggestion: 'Consider adding machine learning projects'
          }
        ],
        rewording: [
          {
            type: 'reword',
            element: 'Team collaboration',
            importance: 0.7,
            suggestion: 'Strengthen your teamwork description',
            example: 'Led cross-functional team of 5 engineers'
          }
        ],
        metadata: {
          iterationRound: 1,
          currentScore: 0.75,
          targetScore: 0.8
        }
      };

      const result = recommendationsValidator.validate(recommendations);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate recommendations with empty arrays', () => {
      const recommendations: Recommendations = {
        summary: 'Your resume is excellent!',
        priority: [],
        optional: [],
        rewording: [],
        metadata: {
          iterationRound: 0,
          currentScore: 0.95,
          targetScore: 0.8
        }
      };

      const result = recommendationsValidator.validate(recommendations);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid Inputs', () => {
    it('should reject recommendations with missing summary', () => {
      const invalidRecommendations = {
        priority: [],
        optional: [],
        rewording: [],
        metadata: {
          iterationRound: 0,
          currentScore: 0.75,
          targetScore: 0.8
        }
      };

      const result = recommendationsValidator.validate(invalidRecommendations);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'summary')).toBe(true);
    });

    it('should reject recommendations with missing metadata', () => {
      const invalidRecommendations = {
        summary: 'Test summary',
        priority: [],
        optional: [],
        rewording: []
      };

      const result = recommendationsValidator.validate(invalidRecommendations);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field === 'metadata')).toBe(true);
    });

    it('should reject recommendations with invalid importance score', () => {
      const invalidRecommendations = {
        summary: 'Test summary',
        priority: [
          {
            type: 'add_skill',
            element: 'Python',
            importance: 1.5, // Invalid: > 1.0
            suggestion: 'Add Python'
          }
        ],
        optional: [],
        rewording: [],
        metadata: {
          iterationRound: 0,
          currentScore: 0.75,
          targetScore: 0.8
        }
      };

      const result = recommendationsValidator.validate(invalidRecommendations);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field.includes('importance'))).toBe(true);
    });

    it('should reject recommendations with invalid recommendation type', () => {
      const invalidRecommendations = {
        summary: 'Test summary',
        priority: [
          {
            type: 'invalid_type',
            element: 'Python',
            importance: 0.9,
            suggestion: 'Add Python'
          }
        ],
        optional: [],
        rewording: [],
        metadata: {
          iterationRound: 0,
          currentScore: 0.75,
          targetScore: 0.8
        }
      };

      const result = recommendationsValidator.validate(invalidRecommendations);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.field.includes('type'))).toBe(true);
    });

    it('should provide descriptive error messages', () => {
      const invalidRecommendations = {
        summary: '',
        priority: [
          {
            type: 'add_skill',
            element: '',
            importance: 2.0,
            suggestion: ''
          }
        ]
      };

      const result = recommendationsValidator.validate(invalidRecommendations);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      result.errors.forEach(err => {
        expect(err.field).toBeTruthy();
        expect(err.message).toBeTruthy();
        expect(typeof err.message).toBe('string');
      });
    });
  });
});

describe('Configuration Validation', () => {
  it('should validate valid optimization config', () => {
    const config = {
      targetScore: 0.8,
      maxIterations: 10,
      earlyStoppingRounds: 2,
      minImprovement: 0.01
    };

    const result = configValidator.validate(config);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should apply default values for missing fields', () => {
    const config = {};
    const parsed = configValidator.validateAndParse(config);
    
    expect(parsed.targetScore).toBe(0.8);
    expect(parsed.maxIterations).toBe(10);
    expect(parsed.earlyStoppingRounds).toBe(2);
    expect(parsed.minImprovement).toBe(0.01);
  });

  it('should reject config with invalid target score', () => {
    const invalidConfig = {
      targetScore: 1.5 // Invalid: > 1.0
    };

    const result = configValidator.validate(invalidConfig);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(err => err.field === 'targetScore')).toBe(true);
  });

  it('should reject config with negative max iterations', () => {
    const invalidConfig = {
      maxIterations: -5
    };

    const result = configValidator.validate(invalidConfig);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(err => err.field === 'maxIterations')).toBe(true);
  });
});

describe('Error Formatting', () => {
  it('should format validation errors into error response', () => {
    const invalidJobPosting = {
      id: '',
      title: '',
      description: ''
    };

    const validationResult = jobPostingValidator.validate(invalidJobPosting);
    const errorResponse = formatValidationError(validationResult, 'Job posting');

    expect(errorResponse.error).toBe('INVALID_INPUT');
    expect(errorResponse.message).toContain('Job posting');
    expect(errorResponse.message).toContain('validation failed');
    expect(errorResponse.details).toBeDefined();
    expect(errorResponse.timestamp).toBeDefined();
  });

  it('should create missing field error', () => {
    const error = createMissingFieldError('description');

    expect(error.error).toBe('INVALID_INPUT');
    expect(error.message).toContain('description');
    expect(error.message).toContain('missing');
    expect(error.details).toBeDefined();
    expect(error.timestamp).toBeDefined();
  });

  it('should create invalid field error', () => {
    const error = createInvalidFieldError('format', 'pdf', 'text, markdown, or obsidian');

    expect(error.error).toBe('INVALID_INPUT');
    expect(error.message).toContain('format');
    expect(error.message).toContain('expected');
    expect(error.details).toBeDefined();
    expect(error.details.received).toBe('pdf');
    expect(error.timestamp).toBeDefined();
  });
});

