/**
 * Resume Parser Tests
 * 
 * Tests for the parseResume function and related utilities.
 * 
 * Requirements: 4.1, 4.3, 4.4 (Resume Parsing)
 * Task: 2.5 (Create parseResume function)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMClient } from '../../shared/llm/client';
import {
  parseResume,
  parseResumes,
  getElementsBySection,
  getExperienceElements,
  getExperienceLevelIndicators,
  getParsingStats,
  hasValidSections,
  hasExperienceLevelIndicators
} from '../../ats-agent/parser/resumeParser';
import { Resume, ParsedResume } from '../../ats-agent/types';

// Mock LLM client for testing
class MockLLMClient extends LLMClient {
  private mockResponse: any;

  constructor(mockResponse: any) {
    super({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0,
      maxTokens: 4096,
      timeout: 30000
    });
    this.mockResponse = mockResponse;
  }

  async complete(): Promise<{ content: string; usage?: any }> {
    return {
      content: JSON.stringify(this.mockResponse)
    };
  }

  parseJsonResponse(content: string): any {
    return JSON.parse(content);
  }
}

describe('Resume Parser', () => {
  describe('parseResume', () => {
    it('should parse a basic resume with sections', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming', 'technical_skill'],
            category: 'skill',
            context: 'Proficient in Python programming',
            section: 'skills',
            position: { start: 0, end: 6 }
          },
          {
            text: 'Software Engineer',
            normalizedText: 'software engineer',
            tags: ['role', 'experience_level'],
            category: 'attribute',
            context: 'Senior Software Engineer at Tech Corp',
            section: 'experience',
            position: { start: 50, end: 67 }
          },
          {
            text: '5 years',
            normalizedText: '5 years',
            tags: ['experience_level', 'duration'],
            category: 'attribute',
            context: '5 years of experience in software development',
            section: 'summary',
            position: { start: 100, end: 107 }
          }
        ],
        sections: [
          {
            type: 'summary',
            content: 'Experienced software engineer with 5 years of experience',
            startPosition: 0,
            endPosition: 56
          },
          {
            type: 'experience',
            content: 'Senior Software Engineer at Tech Corp',
            startPosition: 57,
            endPosition: 94
          },
          {
            type: 'skills',
            content: 'Python, JavaScript, React',
            startPosition: 95,
            endPosition: 120
          }
        ]
      };

      const llmClient = new MockLLMClient(mockResponse);

      const resume: Resume = {
        id: 'test-resume-1',
        content: 'Experienced software engineer with 5 years of experience. Senior Software Engineer at Tech Corp. Skills: Python, JavaScript, React.',
        format: 'text'
      };

      const parsed = await parseResume(resume, llmClient);

      expect(parsed).toBeDefined();
      expect(parsed.elements).toHaveLength(3);
      expect(parsed.rawText).toBe(resume.content);
      expect(parsed.metadata.resumeId).toBe('test-resume-1');
      expect(parsed.metadata.format).toBe('text');
      expect(parsed.metadata.elementCount).toBe(3);
      expect(parsed.metadata.sections).toHaveLength(3);
    });

    it('should extract experience descriptions and accomplishments separately', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Led team of 5 engineers',
            normalizedText: 'led team of 5 engineers',
            tags: ['leadership', 'accomplishment'],
            category: 'experience',
            context: 'Led team of 5 engineers to deliver project on time',
            section: 'experience',
            position: { start: 0, end: 23 }
          },
          {
            text: 'Increased sales by 30%',
            normalizedText: 'increased sales by 30%',
            tags: ['accomplishment', 'quantifiable'],
            category: 'experience',
            context: 'Increased sales by 30% through optimization',
            section: 'experience',
            position: { start: 50, end: 72 }
          },
          {
            text: 'Developed microservices architecture',
            normalizedText: 'developed microservices architecture',
            tags: ['technical', 'accomplishment'],
            category: 'experience',
            context: 'Developed microservices architecture for scalability',
            section: 'experience',
            position: { start: 100, end: 136 }
          }
        ],
        sections: [
          {
            type: 'experience',
            content: 'Led team of 5 engineers. Increased sales by 30%. Developed microservices architecture.',
            startPosition: 0,
            endPosition: 86
          }
        ]
      };

      const llmClient = new MockLLMClient(mockResponse);

      const resume: Resume = {
        id: 'test-resume-2',
        content: 'Led team of 5 engineers to deliver project on time. Increased sales by 30% through optimization. Developed microservices architecture for scalability.',
        format: 'text'
      };

      const parsed = await parseResume(resume, llmClient);

      expect(parsed.elements).toHaveLength(3);
      
      // All elements should be experience category
      const experienceElements = getExperienceElements(parsed);
      expect(experienceElements).toHaveLength(3);
      
      // Check for accomplishments
      const accomplishments = parsed.elements.filter(el => 
        el.tags.includes('accomplishment')
      );
      expect(accomplishments.length).toBeGreaterThan(0);
    });

    it('should identify level of experience indicators', async () => {
      const mockResponse = {
        elements: [
          {
            text: '5 years',
            normalizedText: '5 years',
            tags: ['experience_level', 'duration'],
            category: 'attribute',
            context: '5 years of experience in software development',
            section: 'summary',
            position: { start: 0, end: 7 }
          },
          {
            text: 'Senior',
            normalizedText: 'senior',
            tags: ['experience_level', 'seniority'],
            category: 'attribute',
            context: 'Senior Software Engineer',
            section: 'experience',
            position: { start: 50, end: 56 }
          },
          {
            text: 'Lead Developer',
            normalizedText: 'lead developer',
            tags: ['experience_level', 'role'],
            category: 'attribute',
            context: 'Lead Developer at Tech Company',
            section: 'experience',
            position: { start: 100, end: 114 }
          }
        ],
        sections: [
          {
            type: 'summary',
            content: '5 years of experience in software development',
            startPosition: 0,
            endPosition: 46
          }
        ]
      };

      const llmClient = new MockLLMClient(mockResponse);

      const resume: Resume = {
        id: 'test-resume-3',
        content: '5 years of experience in software development. Senior Software Engineer. Lead Developer at Tech Company.',
        format: 'text'
      };

      const parsed = await parseResume(resume, llmClient);

      const levelIndicators = getExperienceLevelIndicators(parsed);
      expect(levelIndicators.length).toBeGreaterThan(0);
      expect(hasExperienceLevelIndicators(parsed)).toBe(true);
      
      // Check for specific indicators
      const hasYears = levelIndicators.some(el => /\d+\s*years?/.test(el.normalizedText));
      const hasSeniority = levelIndicators.some(el => 
        el.normalizedText.includes('senior') || el.tags.includes('senior')
      );
      const hasRole = levelIndicators.some(el => 
        el.normalizedText.includes('lead') || el.tags.includes('lead')
      );
      
      expect(hasYears || hasSeniority || hasRole).toBe(true);
    });

    it('should handle multi-word phrases as single elements', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['technical_skill', 'ai'],
            category: 'skill',
            context: 'Experience with machine learning algorithms',
            section: 'skills',
            position: { start: 0, end: 16 }
          },
          {
            text: 'project management',
            normalizedText: 'project management',
            tags: ['soft_skill', 'management'],
            category: 'skill',
            context: 'Strong project management skills',
            section: 'skills',
            position: { start: 50, end: 68 }
          }
        ],
        sections: [
          {
            type: 'skills',
            content: 'machine learning, project management',
            startPosition: 0,
            endPosition: 36
          }
        ]
      };

      const llmClient = new MockLLMClient(mockResponse);

      const resume: Resume = {
        id: 'test-resume-4',
        content: 'Experience with machine learning algorithms. Strong project management skills.',
        format: 'text'
      };

      const parsed = await parseResume(resume, llmClient);

      // Check that multi-word phrases are kept together
      const mlElement = parsed.elements.find(el => el.text === 'machine learning');
      expect(mlElement).toBeDefined();
      expect(mlElement?.normalizedText).toBe('machine learning');
      
      const pmElement = parsed.elements.find(el => el.text === 'project management');
      expect(pmElement).toBeDefined();
      expect(pmElement?.normalizedText).toBe('project management');
    });

    it('should throw error for missing resume', async () => {
      const llmClient = new MockLLMClient({});

      await expect(parseResume(null as any, llmClient)).rejects.toThrow('Resume is required');
    });

    it('should throw error for resume without id', async () => {
      const llmClient = new MockLLMClient({});

      const resume: Resume = {
        id: '',
        content: 'Some content',
        format: 'text'
      };

      await expect(parseResume(resume, llmClient)).rejects.toThrow('Resume must have an id');
    });

    it('should throw error for resume without content', async () => {
      const llmClient = new MockLLMClient({});

      const resume: Resume = {
        id: 'test-resume',
        content: '',
        format: 'text'
      };

      await expect(parseResume(resume, llmClient)).rejects.toThrow('Resume must have content');
    });

    it('should throw error for invalid LLM response', async () => {
      const llmClient = new MockLLMClient({ invalid: 'response' });

      const resume: Resume = {
        id: 'test-resume',
        content: 'Some content',
        format: 'text'
      };

      await expect(parseResume(resume, llmClient)).rejects.toThrow('Invalid response structure');
    });
  });

  describe('parseResumes (batch)', () => {
    it('should parse multiple resumes', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Python programming',
            section: 'skills',
            position: { start: 0, end: 6 }
          }
        ],
        sections: [
          {
            type: 'skills',
            content: 'Python',
            startPosition: 0,
            endPosition: 6
          }
        ]
      };

      const llmClient = new MockLLMClient(mockResponse);

      const resumes: Resume[] = [
        {
          id: 'resume-1',
          content: 'Python developer',
          format: 'text'
        },
        {
          id: 'resume-2',
          content: 'JavaScript developer',
          format: 'text'
        }
      ];

      const results = await parseResumes(resumes, llmClient);

      expect(results).toHaveLength(2);
      expect(results[0].metadata.resumeId).toBe('resume-1');
      expect(results[1].metadata.resumeId).toBe('resume-2');
    });

    it('should continue parsing on error', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            category: 'skill',
            context: 'Python programming',
            section: 'skills',
            position: { start: 0, end: 6 }
          }
        ],
        sections: []
      };

      const llmClient = new MockLLMClient(mockResponse);

      const resumes: Resume[] = [
        {
          id: 'resume-1',
          content: 'Python developer',
          format: 'text'
        },
        {
          id: '',  // Invalid - missing id
          content: 'JavaScript developer',
          format: 'text'
        },
        {
          id: 'resume-3',
          content: 'Java developer',
          format: 'text'
        }
      ];

      const results = await parseResumes(resumes, llmClient);

      // Should have 2 results (skipped the invalid one)
      expect(results).toHaveLength(2);
      expect(results[0].metadata.resumeId).toBe('resume-1');
      expect(results[1].metadata.resumeId).toBe('resume-3');
    });
  });

  describe('getElementsBySection', () => {
    it('should filter elements by section', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            section: 'skills'
          } as any,
          {
            text: 'Led team',
            normalizedText: 'led team',
            tags: ['leadership'],
            context: 'Led team of engineers',
            position: { start: 10, end: 18 },
            section: 'experience'
          } as any,
          {
            text: 'JavaScript',
            normalizedText: 'javascript',
            tags: ['programming'],
            context: 'JavaScript development',
            position: { start: 20, end: 30 },
            section: 'skills'
          } as any
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      const skillsElements = getElementsBySection(parsedResume, 'skills');
      expect(skillsElements).toHaveLength(2);
      expect(skillsElements[0].text).toBe('Python');
      expect(skillsElements[1].text).toBe('JavaScript');

      const experienceElements = getElementsBySection(parsedResume, 'experience');
      expect(experienceElements).toHaveLength(1);
      expect(experienceElements[0].text).toBe('Led team');
    });
  });

  describe('getExperienceElements', () => {
    it('should filter elements by experience category', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            category: 'skill'
          } as any,
          {
            text: 'Led team',
            normalizedText: 'led team',
            tags: ['leadership'],
            context: 'Led team of engineers',
            position: { start: 10, end: 18 },
            category: 'experience'
          } as any,
          {
            text: 'Developed system',
            normalizedText: 'developed system',
            tags: ['technical'],
            context: 'Developed system architecture',
            position: { start: 20, end: 36 },
            category: 'experience'
          } as any
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      const experienceElements = getExperienceElements(parsedResume);
      expect(experienceElements).toHaveLength(2);
      expect(experienceElements[0].text).toBe('Led team');
      expect(experienceElements[1].text).toBe('Developed system');
    });
  });

  describe('getExperienceLevelIndicators', () => {
    it('should identify years of experience', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: '5 years',
            normalizedText: '5 years',
            tags: ['duration'],
            context: '5 years of experience',
            position: { start: 0, end: 7 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 10, end: 16 }
          }
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      const indicators = getExperienceLevelIndicators(parsedResume);
      expect(indicators.length).toBeGreaterThan(0);
      expect(indicators[0].text).toBe('5 years');
    });

    it('should identify seniority levels', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Senior Engineer',
            normalizedText: 'senior engineer',
            tags: ['seniority'],
            context: 'Senior Engineer at Tech Corp',
            position: { start: 0, end: 15 }
          }
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      const indicators = getExperienceLevelIndicators(parsedResume);
      expect(indicators.length).toBeGreaterThan(0);
      expect(indicators[0].normalizedText).toContain('senior');
    });

    it('should identify role indicators', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Engineering Manager',
            normalizedText: 'engineering manager',
            tags: ['role'],
            context: 'Engineering Manager at Tech Corp',
            position: { start: 0, end: 19 }
          }
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      const indicators = getExperienceLevelIndicators(parsedResume);
      expect(indicators.length).toBeGreaterThan(0);
      expect(indicators[0].normalizedText).toContain('manager');
    });
  });

  describe('getParsingStats', () => {
    it('should calculate statistics correctly', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            section: 'skills',
            category: 'skill'
          } as any,
          {
            text: 'Led team',
            normalizedText: 'led team',
            tags: ['leadership'],
            context: 'Led team of engineers',
            position: { start: 10, end: 18 },
            section: 'experience',
            category: 'experience'
          } as any,
          {
            text: '5 years',
            normalizedText: '5 years',
            tags: ['duration'],
            context: '5 years of experience',
            position: { start: 20, end: 27 },
            section: 'summary',
            category: 'attribute'
          } as any
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      const stats = getParsingStats(parsedResume);

      expect(stats.totalElements).toBe(3);
      expect(stats.bySection.skills).toBe(1);
      expect(stats.bySection.experience).toBe(1);
      expect(stats.bySection.summary).toBe(1);
      expect(stats.byCategory.skill).toBe(1);
      expect(stats.byCategory.experience).toBe(1);
      expect(stats.byCategory.attribute).toBe(1);
      expect(stats.experienceLevelIndicators).toBeGreaterThan(0);
    });
  });

  describe('hasValidSections', () => {
    it('should return true for valid sections', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            section: 'skills'
          } as any,
          {
            text: 'Led team',
            normalizedText: 'led team',
            tags: ['leadership'],
            context: 'Led team of engineers',
            position: { start: 10, end: 18 },
            section: 'experience'
          } as any
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      expect(hasValidSections(parsedResume)).toBe(true);
    });

    it('should return false for invalid sections', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 0, end: 6 },
            section: 'invalid_section'
          } as any
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      expect(hasValidSections(parsedResume)).toBe(false);
    });
  });

  describe('hasExperienceLevelIndicators', () => {
    it('should return true when indicators exist', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: '5 years',
            normalizedText: '5 years',
            tags: ['duration'],
            context: '5 years of experience',
            position: { start: 0, end: 7 }
          }
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      expect(hasExperienceLevelIndicators(parsedResume)).toBe(true);
    });

    it('should return false when no indicators exist', () => {
      const parsedResume: ParsedResume = {
        elements: [
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming'],
            context: 'Python programming',
            position: { start: 0, end: 6 }
          }
        ],
        rawText: 'Test resume',
        metadata: {}
      };

      expect(hasExperienceLevelIndicators(parsedResume)).toBe(false);
    });
  });
});
