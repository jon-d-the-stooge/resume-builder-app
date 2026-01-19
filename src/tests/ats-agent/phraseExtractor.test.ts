/**
 * Tests for LLM-based Phrase Extraction
 * 
 * Tests the phrase extractor's ability to identify multi-word phrases,
 * compound terms, and structured elements from text.
 */

import { LLMClient } from '../../shared/llm/client';
import {
  extractPhrases,
  extractPhrasesFromSections,
  hasMultiWordPhrases,
  findMultiWordPhrases
} from '../../ats-agent/parser/phraseExtractor';
import { Element } from '../../ats-agent/types';

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

    // Default mock response with multi-word phrases
    return {
      content: JSON.stringify({
        elements: [
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['technical_skill', 'programming'],
            context: 'Experience with machine learning required',
            position: { start: 0, end: 16 }
          },
          {
            text: 'project management',
            normalizedText: 'project management',
            tags: ['soft_skill', 'leadership'],
            context: 'Strong project management skills',
            position: { start: 20, end: 38 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming', 'language'],
            context: 'Proficiency in Python programming',
            position: { start: 40, end: 46 }
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

describe('Phrase Extraction', () => {
  describe('extractPhrases', () => {
    it('should extract multi-word phrases as single elements', async () => {
      const mockClient = new MockLLMClient();
      const text = 'Looking for someone with machine learning and project management experience';

      const elements = await extractPhrases(text, mockClient, 'job');

      expect(elements.length).toBeGreaterThan(0);
      
      // Check for multi-word phrases
      const mlPhrase = elements.find(el => el.text === 'machine learning');
      expect(mlPhrase).toBeDefined();
      expect(mlPhrase?.text).toBe('machine learning');
      
      const pmPhrase = elements.find(el => el.text === 'project management');
      expect(pmPhrase).toBeDefined();
      expect(pmPhrase?.text).toBe('project management');
    });

    it('should handle compound terms correctly', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'data analysis',
            normalizedText: 'data analysis',
            tags: ['skill'],
            context: 'Strong data analysis skills required',
            position: { start: 0, end: 13 }
          },
          {
            text: 'software development',
            normalizedText: 'software development',
            tags: ['skill'],
            context: 'Experience in software development',
            position: { start: 15, end: 35 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const text = 'Need data analysis and software development skills';

      const elements = await extractPhrases(text, mockClient, 'job');

      expect(elements.length).toBe(2);
      expect(elements[0].text).toBe('data analysis');
      expect(elements[1].text).toBe('software development');
    });

    it('should preserve technical terms with full context', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'React.js',
            normalizedText: 'reactjs',
            tags: ['framework', 'javascript'],
            context: 'Experience with React.js framework',
            position: { start: 0, end: 8 }
          },
          {
            text: 'Node.js',
            normalizedText: 'nodejs',
            tags: ['runtime', 'javascript'],
            context: 'Backend development using Node.js',
            position: { start: 10, end: 17 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const text = 'React.js and Node.js experience required';

      const elements = await extractPhrases(text, mockClient, 'job');

      expect(elements.length).toBe(2);
      expect(elements[0].text).toBe('React.js');
      expect(elements[1].text).toBe('Node.js');
    });

    it('should return empty array for empty text', async () => {
      const mockClient = new MockLLMClient();
      
      const elements1 = await extractPhrases('', mockClient, 'job');
      expect(elements1).toEqual([]);

      const elements2 = await extractPhrases('   ', mockClient, 'job');
      expect(elements2).toEqual([]);
    });

    it('should include context for each element', async () => {
      const mockClient = new MockLLMClient();
      const text = 'Looking for machine learning expertise';

      const elements = await extractPhrases(text, mockClient, 'job');

      elements.forEach(el => {
        expect(el.context).toBeDefined();
        expect(typeof el.context).toBe('string');
        expect(el.context.length).toBeGreaterThan(0);
      });
    });

    it('should include position information', async () => {
      const mockClient = new MockLLMClient();
      const text = 'Python and machine learning required';

      const elements = await extractPhrases(text, mockClient, 'job');

      elements.forEach(el => {
        expect(el.position).toBeDefined();
        expect(el.position.start).toBeGreaterThanOrEqual(0);
        expect(el.position.end).toBeGreaterThanOrEqual(el.position.start);
      });
    });

    it('should normalize text in normalizedText field', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'Machine Learning',
            normalizedText: 'machine learning',
            tags: ['skill'],
            context: 'Machine Learning experience',
            position: { start: 0, end: 16 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const text = 'Machine Learning required';

      const elements = await extractPhrases(text, mockClient, 'job');

      expect(elements[0].text).toBe('Machine Learning');
      expect(elements[0].normalizedText).toBe('machine learning');
    });

    it('should handle LLM errors gracefully', async () => {
      const mockClient = new MockLLMClient();
      // Override complete to throw error
      mockClient.complete = async () => {
        throw new Error('LLM API error');
      };

      const text = 'Some job description';

      await expect(extractPhrases(text, mockClient, 'job'))
        .rejects.toThrow('Failed to extract phrases');
    });

    it('should handle invalid JSON responses', async () => {
      const mockClient = new MockLLMClient();
      // Override to return invalid JSON
      mockClient.complete = async () => ({
        content: 'not valid json',
        model: 'test',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
      });

      const text = 'Some job description';

      await expect(extractPhrases(text, mockClient, 'job'))
        .rejects.toThrow();
    });

    it('should handle missing elements array in response', async () => {
      const mockResponse = {
        // Missing elements array
        data: []
      };

      const mockClient = new MockLLMClient(mockResponse);
      const text = 'Some job description';

      await expect(extractPhrases(text, mockClient, 'job'))
        .rejects.toThrow('Invalid response structure');
    });

    it('should work with both job and resume source types', async () => {
      const mockClient = new MockLLMClient();
      const text = 'Experience with machine learning';

      const jobElements = await extractPhrases(text, mockClient, 'job');
      expect(jobElements.length).toBeGreaterThan(0);

      const resumeElements = await extractPhrases(text, mockClient, 'resume');
      expect(resumeElements.length).toBeGreaterThan(0);
    });
  });

  describe('extractPhrasesFromSections', () => {
    it('should extract phrases from multiple sections', async () => {
      const mockClient = new MockLLMClient();
      const sections = [
        { label: 'Requirements', text: 'Python and machine learning required' },
        { label: 'Qualifications', text: 'Project management experience preferred' }
      ];

      const elements = await extractPhrasesFromSections(sections, mockClient, 'job');

      expect(elements.length).toBeGreaterThan(0);
      
      // Check that section labels are added to context
      const hasRequirementsContext = elements.some(el => 
        el.context.includes('[Requirements]')
      );
      expect(hasRequirementsContext).toBe(true);
    });

    it('should skip empty sections', async () => {
      const mockClient = new MockLLMClient();
      const sections = [
        { label: 'Requirements', text: 'Python required' },
        { label: 'Empty', text: '' },
        { label: 'Whitespace', text: '   ' }
      ];

      const elements = await extractPhrasesFromSections(sections, mockClient, 'job');

      // Should only process the first section
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should continue processing if one section fails', async () => {
      const mockClient = new MockLLMClient();
      let callCount = 0;
      
      // Override to fail on first call, succeed on second
      mockClient.complete = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First section failed');
        }
        return {
          content: JSON.stringify({
            elements: [
              {
                text: 'test',
                normalizedText: 'test',
                tags: [],
                context: 'test context',
                position: { start: 0, end: 4 }
              }
            ]
          }),
          model: 'test',
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
        };
      };

      const sections = [
        { label: 'Section1', text: 'First section' },
        { label: 'Section2', text: 'Second section' }
      ];

      const elements = await extractPhrasesFromSections(sections, mockClient, 'job');

      // Should have elements from second section
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should combine elements from all sections', async () => {
      const mockClient = new MockLLMClient({
        elements: [
          {
            text: 'test phrase',
            normalizedText: 'test phrase',
            tags: [],
            context: 'context',
            position: { start: 0, end: 11 }
          }
        ]
      });

      const sections = [
        { label: 'Section1', text: 'Text 1' },
        { label: 'Section2', text: 'Text 2' },
        { label: 'Section3', text: 'Text 3' }
      ];

      const elements = await extractPhrasesFromSections(sections, mockClient, 'job');

      // Should have 1 element after deduplication (all 3 sections return same phrase)
      // Context should include all 3 section labels
      expect(elements.length).toBe(1);
      expect(elements[0].context).toContain('[Section1]');
      expect(elements[0].context).toContain('[Section2]');
      expect(elements[0].context).toContain('[Section3]');
    });
  });

  describe('hasMultiWordPhrases', () => {
    it('should return true when multi-word phrases are present', () => {
      const elements: Element[] = [
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: [],
          context: '',
          position: { start: 0, end: 16 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        }
      ];

      expect(hasMultiWordPhrases(elements)).toBe(true);
    });

    it('should return false when only single words are present', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        },
        {
          text: 'Java',
          normalizedText: 'java',
          tags: [],
          context: '',
          position: { start: 0, end: 4 }
        }
      ];

      expect(hasMultiWordPhrases(elements)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(hasMultiWordPhrases([])).toBe(false);
    });
  });

  describe('findMultiWordPhrases', () => {
    it('should find specified multi-word phrases', () => {
      const elements: Element[] = [
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: [],
          context: '',
          position: { start: 0, end: 16 }
        },
        {
          text: 'project management',
          normalizedText: 'project management',
          tags: [],
          context: '',
          position: { start: 0, end: 18 }
        },
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        }
      ];

      const found = findMultiWordPhrases(elements, ['machine learning', 'data science']);

      expect(found.length).toBe(1);
      expect(found[0].text).toBe('machine learning');
    });

    it('should be case-insensitive', () => {
      const elements: Element[] = [
        {
          text: 'Machine Learning',
          normalizedText: 'machine learning',
          tags: [],
          context: '',
          position: { start: 0, end: 16 }
        }
      ];

      const found = findMultiWordPhrases(elements, ['MACHINE LEARNING']);

      expect(found.length).toBe(1);
    });

    it('should only return multi-word phrases', () => {
      const elements: Element[] = [
        {
          text: 'Python',
          normalizedText: 'python',
          tags: [],
          context: '',
          position: { start: 0, end: 6 }
        }
      ];

      const found = findMultiWordPhrases(elements, ['Python']);

      expect(found.length).toBe(0); // Single word, not a multi-word phrase
    });

    it('should return empty array when no matches found', () => {
      const elements: Element[] = [
        {
          text: 'machine learning',
          normalizedText: 'machine learning',
          tags: [],
          context: '',
          position: { start: 0, end: 16 }
        }
      ];

      const found = findMultiWordPhrases(elements, ['data science', 'deep learning']);

      expect(found).toEqual([]);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle real-world job description text', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'machine learning',
            normalizedText: 'machine learning',
            tags: ['technical_skill', 'ai'],
            context: 'Experience with machine learning algorithms',
            position: { start: 0, end: 16 }
          },
          {
            text: 'data analysis',
            normalizedText: 'data analysis',
            tags: ['technical_skill', 'analytics'],
            context: 'Strong data analysis capabilities',
            position: { start: 20, end: 33 }
          },
          {
            text: 'Python',
            normalizedText: 'python',
            tags: ['programming', 'language'],
            context: 'Proficiency in Python',
            position: { start: 35, end: 41 }
          },
          {
            text: 'team collaboration',
            normalizedText: 'team collaboration',
            tags: ['soft_skill'],
            context: 'Excellent team collaboration skills',
            position: { start: 45, end: 63 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const jobText = `
        We are looking for a Data Scientist with experience in machine learning
        and data analysis. Must be proficient in Python and have excellent
        team collaboration skills.
      `;

      const elements = await extractPhrases(jobText, mockClient, 'job');

      expect(elements.length).toBe(4);
      expect(hasMultiWordPhrases(elements)).toBe(true);
      
      const multiWordPhrases = findMultiWordPhrases(
        elements,
        ['machine learning', 'data analysis', 'team collaboration']
      );
      expect(multiWordPhrases.length).toBe(3);
    });

    it('should handle resume text with experience descriptions', async () => {
      const mockResponse = {
        elements: [
          {
            text: 'software development',
            normalizedText: 'software development',
            tags: ['experience', 'technical'],
            context: '5 years of software development experience',
            position: { start: 0, end: 20 }
          },
          {
            text: 'project management',
            normalizedText: 'project management',
            tags: ['experience', 'leadership'],
            context: 'Led project management for multiple teams',
            position: { start: 25, end: 43 }
          },
          {
            text: 'agile methodologies',
            normalizedText: 'agile methodologies',
            tags: ['methodology', 'process'],
            context: 'Experienced with agile methodologies',
            position: { start: 50, end: 69 }
          }
        ]
      };

      const mockClient = new MockLLMClient(mockResponse);
      const resumeText = `
        Senior Software Engineer with 5 years of software development experience.
        Led project management for multiple teams using agile methodologies.
      `;

      const elements = await extractPhrases(resumeText, mockClient, 'resume');

      expect(elements.length).toBe(3);
      expect(hasMultiWordPhrases(elements)).toBe(true);
    });
  });
});
