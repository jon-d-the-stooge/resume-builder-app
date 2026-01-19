/**
 * Tests for Job Description Parser
 * 
 * Tests the parseJobDescription function including:
 * - Basic parsing functionality
 * - Importance score assignment
 * - Multi-word phrase handling
 * - Deduplication
 * - Error handling
 * - Various job description formats
 */

import { describe, it, expect } from 'vitest';
import { parseJobDescription, hasValidImportanceScores, getCriticalElements, getParsingStats } from '../../ats-agent/parser/jobParser';
import { LLMClient } from '../../shared/llm/client';
import { JobPosting, ParsedJob } from '../../ats-agent/types';

// Mock LLM client for testing
class MockLLMClient extends LLMClient {
  private mockResponse: any;

  constructor(mockResponse?: any) {
    // Create a minimal valid config
    super({ apiKey: 'test-key', provider: 'anthropic' });
    this.mockResponse = mockResponse;
  }

  async complete(): Promise<any> {
    if (this.mockResponse) {
      return {
        content: JSON.stringify(this.mockResponse),
        model: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      };
    }

    // Default mock response with various elements and importance scores
    return {
      content: JSON.stringify({
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming', 'language'],
            category: 'skill',
            context: 'Python programming is required',
            importance: 0.9,
            position: { start: 0, end: 6 }
          },
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['technical_skill', 'ai'],
            category: 'skill',
            context: 'Experience with machine learning',
            importance: 0.8,
            position: { start: 10, end: 26 }
          },
          {
            text: 'communication',
            normalizedText: 'communication',
            tags: ['soft_skill'],
            category: 'attribute',
            context: 'Strong communication skills',
            importance: 0.6,
            position: { start: 30, end: 43 }
          }
        ]
      }),
      model: 'test-model',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
    };
  }

  parseJsonResponse(text: string): any {
    return JSON.parse(text);
  }
}

describe('Job Description Parser', () => {

  describe('parseJobDescription', () => {
    it('should parse a basic job description', async () => {
      const mockClient = new MockLLMClient();
      const jobPosting: JobPosting = {
        id: 'test-job-1',
        title: 'Software Engineer',
        description: 'We are looking for a software engineer with Python experience.',
        requirements: 'Python programming is required. Experience with Django is preferred.',
        qualifications: 'Bachelor\'s degree in Computer Science'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      expect(result).toBeDefined();
      expect(result.elements).toBeDefined();
      expect(Array.isArray(result.elements)).toBe(true);
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.rawText).toContain('Software Engineer');
      expect(result.metadata.jobId).toBe('test-job-1');
    });

    it('should extract multi-word phrases as single elements', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['technical_skill', 'ai'],
            category: 'skill',
            context: 'Experience with machine learning algorithms',
            importance: 0.9,
            position: { start: 0, end: 16 }
          },
          {
            text: 'data analysis',
            normalizedText: 'data analysis',
            tags: ['technical_skill', 'analytics'],
            category: 'skill',
            context: 'Strong data analysis capabilities',
            importance: 0.8,
            position: { start: 20, end: 33 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobPosting: JobPosting = {
        id: 'test-job-2',
        title: 'Machine Learning Engineer',
        description: 'Experience with machine learning and data analysis required.',
        requirements: 'Strong background in machine learning algorithms.',
        qualifications: 'PhD in Computer Science or related field'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      // Check for multi-word phrases
      const mlElement = result.elements.find(el => 
        el.normalizedText.includes('machine learning')
      );
      expect(mlElement).toBeDefined();

      const dataAnalysisElement = result.elements.find(el =>
        el.normalizedText.includes('data analysis')
      );
      expect(dataAnalysisElement).toBeDefined();
    });

    it('should assign importance scores in range [0.0, 1.0]', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Java',
            normalizedText: 'java',
            tags: ['programming'],
            category: 'skill',
            context: 'Java is required',
            importance: 0.95,
            position: { start: 0, end: 4 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Python is preferred',
            importance: 0.5,
            position: { start: 10, end: 16 }
          },
          {
            text: 'Ruby',
            normalizedText: 'ruby',
            tags: ['programming'],
            category: 'skill',
            context: 'Knowledge of Ruby is a bonus',
            importance: 0.3,
            position: { start: 20, end: 24 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobPosting: JobPosting = {
        id: 'test-job-3',
        title: 'Senior Developer',
        description: 'Looking for a senior developer.',
        requirements: 'Java is required. Python is preferred. Knowledge of Ruby is a bonus.',
        qualifications: 'Bachelor\'s degree required'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      // Validate all importance scores
      expect(hasValidImportanceScores(result)).toBe(true);

      // Check that all elements have importance scores
      for (const element of result.elements) {
        const importance = (element as any).importance;
        expect(typeof importance).toBe('number');
        expect(importance).toBeGreaterThanOrEqual(0.0);
        expect(importance).toBeLessThanOrEqual(1.0);
      }
    });

    it('should assign high importance to "required" elements', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Node.js',
            normalizedText: 'nodejs',
            tags: ['runtime', 'javascript'],
            category: 'skill',
            context: 'Node.js is required',
            importance: 0.95,
            position: { start: 0, end: 7 }
          },
          {
            text: 'TypeScript',
            normalizedText: 'typescript',
            tags: ['programming', 'language'],
            category: 'skill',
            context: 'TypeScript is essential',
            importance: 0.9,
            position: { start: 10, end: 20 }
          },
          {
            text: 'React',
            normalizedText: 'react',
            tags: ['framework', 'javascript'],
            category: 'skill',
            context: 'React is preferred',
            importance: 0.5,
            position: { start: 25, end: 30 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobPosting: JobPosting = {
        id: 'test-job-4',
        title: 'Backend Developer',
        description: 'Backend developer position.',
        requirements: 'Node.js is required. TypeScript is essential. React is preferred.',
        qualifications: 'Bachelor\'s degree'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      // Find elements marked as required/essential
      const nodeElement = result.elements.find(el =>
        el.normalizedText.includes('node') || el.normalizedText.includes('nodejs')
      );
      
      if (nodeElement) {
        const importance = (nodeElement as any).importance;
        expect(importance).toBeGreaterThanOrEqual(0.8);
      }

      // Check that we have at least some critical elements
      const criticalElements = getCriticalElements(result);
      expect(criticalElements.length).toBeGreaterThan(0);
    });

    it('should assign low importance to "preferred" or "bonus" elements', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            category: 'skill',
            context: 'JavaScript is required',
            importance: 0.9,
            position: { start: 0, end: 10 }
          },
          {
            text: 'GraphQL',
            normalizedText: 'graphql',
            tags: ['api', 'query_language'],
            category: 'skill',
            context: 'Knowledge of GraphQL is a nice to have',
            importance: 0.4,
            position: { start: 15, end: 22 }
          },
          {
            text: 'Docker',
            normalizedText: 'docker',
            tags: ['containerization', 'devops'],
            category: 'skill',
            context: 'Experience with Docker is a bonus',
            importance: 0.3,
            position: { start: 25, end: 31 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobPosting: JobPosting = {
        id: 'test-job-5',
        title: 'Full Stack Developer',
        description: 'Full stack developer needed.',
        requirements: 'JavaScript is required.',
        qualifications: 'Knowledge of GraphQL is a nice to have. Experience with Docker is a bonus.'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      // Find elements marked as nice to have or bonus
      const elements = result.elements.filter(el => {
        const text = el.normalizedText.toLowerCase();
        return text.includes('graphql') || text.includes('docker');
      });

      // At least one should have low importance
      const hasLowImportance = elements.some(el => {
        const importance = (el as any).importance;
        return importance <= 0.5;
      });

      expect(hasLowImportance).toBe(true);
    });

    it('should handle various job description formats', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Python programming',
            importance: 0.9,
            position: { start: 0, end: 6 }
          },
          {
            text: 'SQL',
            normalizedText: 'sql',
            tags: ['database', 'query_language'],
            category: 'skill',
            context: 'SQL databases',
            importance: 0.85,
            position: { start: 10, end: 13 }
          },
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['ai', 'technical_skill'],
            category: 'skill',
            context: 'Build machine learning models',
            importance: 0.8,
            position: { start: 20, end: 36 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobPosting: JobPosting = {
        id: 'test-job-6',
        title: 'Data Scientist',
        description: `
          We are seeking a talented Data Scientist to join our team.
          
          Responsibilities:
          - Analyze large datasets
          - Build machine learning models
          - Collaborate with engineering team
        `,
        requirements: `
          Must have:
          * Python programming
          * SQL databases
          * Statistical analysis
          
          Nice to have:
          * R programming
          * Tableau
        `,
        qualifications: 'Master\'s degree in Statistics, Computer Science, or related field'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      expect(result.elements.length).toBeGreaterThan(0);
      expect(hasValidImportanceScores(result)).toBe(true);

      // Should extract skills from different sections
      const pythonElement = result.elements.find(el =>
        el.normalizedText.includes('python')
      );
      expect(pythonElement).toBeDefined();
    });

    it('should deduplicate elements and keep maximum importance', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Python is required for automation scripts',
            importance: 0.9,
            position: { start: 0, end: 6 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Python experience is preferred',
            importance: 0.5,
            position: { start: 50, end: 56 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Strong Python skills',
            importance: 0.7,
            position: { start: 100, end: 106 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobPosting: JobPosting = {
        id: 'test-job-7',
        title: 'DevOps Engineer',
        description: 'Python experience is preferred.',
        requirements: 'Python is required for automation scripts.',
        qualifications: 'Strong Python skills'
      };

      const result = await parseJobDescription(jobPosting, mockClient);

      // Count Python mentions
      const pythonElements = result.elements.filter(el =>
        el.normalizedText.includes('python')
      );

      // Should be deduplicated to one element
      expect(pythonElements.length).toBe(1);

      // Should have maximum importance (0.9 from "required")
      const importance = (pythonElements[0] as any).importance;
      expect(importance).toBe(0.9);
    });

    it('should throw error for invalid job posting', async () => {
      const mockClient = new MockLLMClient();
      const invalidJob = {
        id: '',
        title: '',
        description: '',
        requirements: '',
        qualifications: ''
      } as JobPosting;

      await expect(
        parseJobDescription(invalidJob, mockClient)
      ).rejects.toThrow();
    });

    it('should throw error for missing required fields', async () => {
      const mockClient = new MockLLMClient();
      const invalidJob = {
        description: 'Some description'
      } as JobPosting;

      await expect(
        parseJobDescription(invalidJob, mockClient)
      ).rejects.toThrow('Job posting must have id and title');
    });

    it('should throw error for empty content', async () => {
      const mockClient = new MockLLMClient();
      const emptyJob: JobPosting = {
        id: 'test-empty',
        title: 'Empty Job',
        description: '',
        requirements: '',
        qualifications: ''
      };

      await expect(
        parseJobDescription(emptyJob, mockClient)
      ).rejects.toThrow();
    });
  });

  describe('hasValidImportanceScores', () => {
    it('should return true for valid importance scores', () => {
      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['skill'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            importance: 0.9
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['skill'],
            context: 'JavaScript experience',
            position: { start: 10, end: 20 },
            importance: 0.5
          } as any
        ],
        rawText: 'Python and JavaScript',
        metadata: {}
      };

      expect(hasValidImportanceScores(parsedJob)).toBe(true);
    });

    it('should return false for invalid importance scores', () => {
      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['skill'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            importance: 1.5 // Invalid: > 1.0
          } as any
        ],
        rawText: 'Python',
        metadata: {}
      };

      expect(hasValidImportanceScores(parsedJob)).toBe(false);
    });
  });

  describe('getCriticalElements', () => {
    it('should return elements with importance >= 0.8', () => {
      const parsedJob: ParsedJob = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['skill'],
            context: 'Python required',
            position: { start: 0, end: 6 },
            importance: 0.9
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['skill'],
            context: 'JavaScript preferred',
            position: { start: 10, end: 20 },
            importance: 0.5
          } as any,
          {
            text: 'TypeScript',
            normalizedText: 'typescript',
            tags: ['skill'],
            context: 'TypeScript essential',
            position: { start: 25, end: 35 },
            importance: 0.85
          } as any
        ],
        rawText: 'Python, JavaScript, TypeScript',
        metadata: {}
      };

      const critical = getCriticalElements(parsedJob);
      expect(critical.length).toBe(2);
      expect(critical.some(el => el.text === 'Python')).toBe(true);
      expect(critical.some(el => el.text === 'TypeScript')).toBe(true);
    });
  });

  describe('getParsingStats', () => {
    it('should calculate correct statistics', () => {
      const parsedJob: ParsedJob = {
        elements: [
          { importance: 0.9 } as any,
          { importance: 0.8 } as any,
          { importance: 0.6 } as any,
          { importance: 0.4 } as any,
          { importance: 0.2 } as any
        ],
        rawText: 'test',
        metadata: {}
      };

      const stats = getParsingStats(parsedJob);
      expect(stats.totalElements).toBe(5);
      expect(stats.criticalElements).toBe(2); // >= 0.8
      expect(stats.highImportance).toBe(1); // >= 0.6 and < 0.8
      expect(stats.mediumImportance).toBe(1); // >= 0.4 and < 0.6
      expect(stats.lowImportance).toBe(1); // < 0.4
      expect(stats.averageImportance).toBeCloseTo(0.58, 2);
    });
  });
});
