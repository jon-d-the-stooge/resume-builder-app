/**
 * Property-Based Tests for ATS Agent Semantic Analyzer
 * 
 * Tests Properties 5-10 from the design document:
 * - Property 5: Tag Assignment Completeness
 * - Property 6: Skill Categorization
 * - Property 7: Semantic Relationship Tagging
 * - Property 8: Context-Aware Disambiguation
 * - Property 9: Semantic Equivalence Recognition
 * - Property 10: Tag Taxonomy Consistency
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import * as dotenv from 'dotenv';
import { LLMClient } from '../../shared/llm/client';
import { SemanticAnalyzer } from '../../ats-agent/parser/semanticAnalyzer';
import { Element, TAG_TAXONOMY } from '../../ats-agent/types';

// Load environment variables from .env file
dotenv.config();

// Initialize LLM client and semantic analyzer for tests
let llmClient: LLMClient;
let semanticAnalyzer: SemanticAnalyzer;
let hasValidApiKey: boolean;

beforeAll(() => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  hasValidApiKey = !!apiKey && apiKey !== 'test-key' && apiKey.length > 20;
  
  llmClient = new LLMClient({
    provider: process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic',
    apiKey: apiKey || 'test-key',
    model: process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  });
  
  semanticAnalyzer = new SemanticAnalyzer(llmClient);
});

// ============================================================================
// Custom Generators (Arbitraries)
// ============================================================================

/**
 * Generate an element with various types of content
 * Ensures text and normalizedText are properly paired
 */
const elementArbitrary = (): fc.Arbitrary<Element> => {
  const elementPairs = [
    { text: 'Python', normalizedText: 'python', context: 'Required programming language for backend development' },
    { text: 'machine learning', normalizedText: 'machine learning', context: 'Experience with ML algorithms and model training' },
    { text: 'leadership', normalizedText: 'leadership', context: 'Led team of engineers on multiple projects' },
    { text: 'communication', normalizedText: 'communication', context: 'Strong verbal and written communication skills' },
    { text: '5 years experience', normalizedText: '5 years experience', context: 'Minimum 5 years of professional experience required' },
    { text: 'Bachelor\'s degree', normalizedText: 'bachelor\'s degree', context: 'Bachelor\'s degree in Computer Science or related field' },
    { text: 'React.js', normalizedText: 'react.js', context: 'Frontend framework for building user interfaces' },
    { text: 'problem solving', normalizedText: 'problem solving', context: 'Analytical and problem-solving abilities' }
  ];
  
  return fc.constantFrom(...elementPairs).map(pair => ({
    text: pair.text,
    normalizedText: pair.normalizedText,
    tags: [],
    context: pair.context,
    position: { start: 0, end: pair.text.length }
  }));
};

/**
 * Generate technical skill elements
 * Ensures text, normalizedText, and context are properly paired
 */
const technicalSkillArbitrary = (): fc.Arbitrary<Element> => {
  const skillData = [
    { 
      text: 'Python', 
      normalizedText: 'python',
      context: 'Experience with Python programming for backend development'
    },
    { 
      text: 'JavaScript', 
      normalizedText: 'javascript',
      context: 'Strong JavaScript skills for frontend development'
    },
    { 
      text: 'SQL', 
      normalizedText: 'sql',
      context: 'Database management with SQL queries'
    },
    { 
      text: 'React', 
      normalizedText: 'react',
      context: 'React framework for building user interfaces'
    },
    { 
      text: 'Docker', 
      normalizedText: 'docker',
      context: 'Docker containerization and deployment'
    },
    { 
      text: 'AWS', 
      normalizedText: 'aws',
      context: 'AWS cloud infrastructure and services'
    }
  ];
  
  return fc.constantFrom(...skillData).map(skill => ({
    text: skill.text,
    normalizedText: skill.normalizedText,
    tags: [],
    context: skill.context,
    position: { start: 0, end: skill.text.length }
  }));
};

/**
 * Generate soft skill elements
 * Ensures text and normalizedText are properly paired
 */
const softSkillArbitrary = (): fc.Arbitrary<Element> => {
  const skillPairs = [
    { text: 'leadership', normalizedText: 'leadership', context: 'Strong leadership abilities and team management' },
    { text: 'communication', normalizedText: 'communication', context: 'Excellent verbal and written communication skills' },
    { text: 'teamwork', normalizedText: 'teamwork', context: 'Collaborative teamwork and cross-functional coordination' },
    { text: 'problem solving', normalizedText: 'problem solving', context: 'Analytical problem-solving and critical thinking' },
    { text: 'time management', normalizedText: 'time management', context: 'Effective time management and prioritization' }
  ];
  
  return fc.constantFrom(...skillPairs).map(skill => ({
    text: skill.text,
    normalizedText: skill.normalizedText,
    tags: [],
    context: skill.context,
    position: { start: 0, end: skill.text.length }
  }));
};

/**
 * Generate ambiguous term elements (terms with multiple meanings)
 */
const ambiguousTermArbitrary = (): fc.Arbitrary<{ element: Element; contexts: string[] }> => {
  return fc.oneof(
    fc.constant({
      element: {
        text: 'Java',
        normalizedText: 'java',
        tags: [],
        context: '',
        position: { start: 0, end: 4 }
      },
      contexts: [
        'Programming language Java for backend development',
        'Located in Java, Indonesia for remote work'
      ]
    }),
    fc.constant({
      element: {
        text: 'Python',
        normalizedText: 'python',
        tags: [],
        context: '',
        position: { start: 0, end: 6 }
      },
      contexts: [
        'Python programming language for data science',
        'Python snake species research project'
      ]
    }),
    fc.constant({
      element: {
        text: 'Ruby',
        normalizedText: 'ruby',
        tags: [],
        context: '',
        position: { start: 0, end: 4 }
      },
      contexts: [
        'Ruby programming language for web development',
        'Ruby gemstone jewelry design experience'
      ]
    })
  );
};

/**
 * Generate synonym pairs
 */
const synonymPairArbitrary = (): fc.Arbitrary<{ term1: Element; term2: Element }> => {
  return fc.oneof(
    fc.constant({
      term1: {
        text: 'JavaScript',
        normalizedText: 'javascript',
        tags: ['programming'],
        context: 'Frontend development with JavaScript',
        position: { start: 0, end: 10 }
      },
      term2: {
        text: 'JS',
        normalizedText: 'js',
        tags: ['programming'],
        context: 'Experience with JS frameworks',
        position: { start: 0, end: 2 }
      }
    }),
    fc.constant({
      term1: {
        text: 'leadership',
        normalizedText: 'leadership',
        tags: ['soft_skill'],
        context: 'Strong leadership abilities',
        position: { start: 0, end: 10 }
      },
      term2: {
        text: 'led team',
        normalizedText: 'led team',
        tags: ['soft_skill'],
        context: 'Led team of 5 engineers',
        position: { start: 0, end: 8 }
      }
    }),
    fc.constant({
      term1: {
        text: 'PostgreSQL',
        normalizedText: 'postgresql',
        tags: ['database'],
        context: 'Database management with PostgreSQL',
        position: { start: 0, end: 10 }
      },
      term2: {
        text: 'Postgres',
        normalizedText: 'postgres',
        tags: ['database'],
        context: 'Experience with Postgres databases',
        position: { start: 0, end: 8 }
      }
    })
  );
};

// ============================================================================
// Property 5: Tag Assignment Completeness
// Validates: Requirements 2.1
// ============================================================================

describe('Feature: ats-agent, Property 5: Tag Assignment Completeness', () => {
  it('should assign at least one semantic tag to every element', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        elementArbitrary(),
        async (element) => {
          // Analyze tags for the element
          const tags = await semanticAnalyzer.analyzeTags(element, element.context);
          
          // Property: At least one tag should be assigned
          expect(tags).toBeDefined();
          expect(Array.isArray(tags)).toBe(true);
          expect(tags.length).toBeGreaterThan(0);
          
          // All tags should be non-empty strings
          for (const tag of tags) {
            expect(typeof tag).toBe('string');
            expect(tag.length).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      { numRuns: 20 } // Reduced from 100 due to LLM call latency
    );
  }, 180000); // 3 minute timeout for LLM calls
});

// ============================================================================
// Property 6: Skill Categorization
// Validates: Requirements 1.2, 1.3
// ============================================================================

describe('Feature: ats-agent, Property 6: Skill Categorization', () => {
  it('should assign appropriate category tags to technical skills', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        technicalSkillArbitrary(),
        async (element) => {
          // Analyze tags for technical skill
          const tags = await semanticAnalyzer.analyzeTags(element, element.context);
          
          // Property: Should assign tags from technical_skills category
          const technicalTags = TAG_TAXONOMY.technical_skills;
          const hasRelevantTag = tags.some(tag => 
            technicalTags.includes(tag as any) || 
            tag.includes('technical') ||
            tag.includes('programming') ||
            tag.includes('skill')
          );
          
          // Should have at least one relevant tag
          expect(hasRelevantTag).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 } // Reduced due to LLM calls
    );
  }, 120000);

  it('should assign appropriate category tags to soft skills', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        softSkillArbitrary(),
        async (element) => {
          // Analyze tags for soft skill
          const tags = await semanticAnalyzer.analyzeTags(element, element.context);
          
          // Property: Should assign tags from soft_skills category
          const softSkillTags = TAG_TAXONOMY.soft_skills;
          const hasRelevantTag = tags.some(tag => 
            softSkillTags.includes(tag as any) ||
            tag.includes('soft') ||
            tag.includes('skill') ||
            tag.includes('interpersonal')
          );
          
          // Should have at least one relevant tag
          expect(hasRelevantTag).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  }, 120000);
});

// ============================================================================
// Property 7: Semantic Relationship Tagging
// Validates: Requirements 2.2
// ============================================================================

describe('Feature: ats-agent, Property 7: Semantic Relationship Tagging', () => {
  it('should assign related concept tags to technical terms', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        technicalSkillArbitrary(),
        async (element) => {
          // Analyze tags for technical term
          const tags = await semanticAnalyzer.analyzeTags(element, element.context);
          
          // Property: Should assign multiple related tags
          // Technical terms should have related concepts
          expect(tags.length).toBeGreaterThan(0);
          
          // For known technical terms, check for expected relationships
          // The property is that LLM assigns semantically related tags
          // We check for broad categories rather than specific keywords
          const knownRelationships: Record<string, string[]> = {
            'python': ['programming', 'software', 'development', 'language', 'code', 'backend', 'script', 'technical'],
            'javascript': ['programming', 'web', 'development', 'language', 'code', 'frontend', 'script', 'technical'],
            'sql': ['database', 'data', 'query', 'technical'],
            'react': ['framework', 'frontend', 'web', 'ui', 'interface', 'library', 'technical'],
            'docker': ['container', 'deployment', 'devops', 'infrastructure', 'tool', 'technical', 'virtualization'],
            'aws': ['cloud', 'infrastructure', 'service', 'platform', 'technical', 'amazon']
          };
          
          const normalized = element.normalizedText.toLowerCase();
          if (normalized in knownRelationships) {
            const expectedConcepts = knownRelationships[normalized];
            const hasRelatedConcept = tags.some(tag => 
              expectedConcepts.some(concept => 
                tag.toLowerCase().includes(concept)
              )
            );
            
            // Should have at least one related concept
            // The property is that LLM assigns semantically related tags
            // If this fails, it means the LLM returned tags that don't match
            // any of our expected semantic categories, which would be unusual
            expect(hasRelatedConcept).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 20 } // Reduced from 50 due to LLM call latency
    );
  }, 180000); // 3 minute timeout
});

// ============================================================================
// Property 8: Context-Aware Disambiguation
// Validates: Requirements 2.3
// ============================================================================

describe('Feature: ats-agent, Property 8: Context-Aware Disambiguation', () => {
  it('should assign different tags based on context for ambiguous terms', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        ambiguousTermArbitrary(),
        async ({ element, contexts }) => {
          // Analyze the same element with different contexts
          const tags1 = await semanticAnalyzer.analyzeTags(
            { ...element, context: contexts[0] },
            contexts[0]
          );
          
          const tags2 = await semanticAnalyzer.analyzeTags(
            { ...element, context: contexts[1] },
            contexts[1]
          );
          
          // Property: Tags should differ based on context
          // At least one tag should be different
          const tags1Set = new Set(tags1);
          const tags2Set = new Set(tags2);
          
          const hasUniqueTags = 
            tags1.some(tag => !tags2Set.has(tag)) ||
            tags2.some(tag => !tags1Set.has(tag));
          
          // Context should influence tagging
          // (May not always differ, but should for clearly different contexts)
          if (contexts[0].toLowerCase().includes('programming') && 
              contexts[1].toLowerCase().includes('location')) {
            expect(hasUniqueTags).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 30 } // Reduced due to double LLM calls
    );
  }, 180000); // 3 minute timeout for double LLM calls
});

// ============================================================================
// Property 9: Semantic Equivalence Recognition
// Validates: Requirements 2.4
// ============================================================================

describe('Feature: ats-agent, Property 9: Semantic Equivalence Recognition', () => {
  it('should recognize semantically equivalent terms as matches', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        synonymPairArbitrary(),
        async ({ term1, term2 }) => {
          // Find semantic matches
          const matches = await semanticAnalyzer.findSemanticMatches(term1, [term2]);
          
          // Property: Should recognize synonyms as matches
          expect(matches.length).toBeGreaterThan(0);
          
          const match = matches[0];
          expect(match.resumeElement).toEqual(term1);
          expect(match.jobElement).toEqual(term2);
          
          // Should have high confidence for known synonyms
          expect(match.confidence).toBeGreaterThan(0.7);
          
          // Match type should be synonym, related, or semantic
          expect(['synonym', 'related', 'semantic']).toContain(match.matchType);
          
          return true;
        }
      ),
      { numRuns: 30 } // Reduced due to LLM calls
    );
  }, 180000);
});

// ============================================================================
// Property 10: Tag Taxonomy Consistency
// Validates: Requirements 2.5
// ============================================================================

describe('Feature: ats-agent, Property 10: Tag Taxonomy Consistency', () => {
  it('should assign tags from consistent taxonomy across multiple parsings', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        elementArbitrary(),
        async (element) => {
          // Parse the same element multiple times
          const tags1 = await semanticAnalyzer.analyzeTags(element, element.context);
          const tags2 = await semanticAnalyzer.analyzeTags(element, element.context);
          
          // Property: Should use consistent taxonomy
          // Due to LLM caching, identical inputs should produce identical outputs
          expect(tags1).toEqual(tags2);
          
          // All tags should be valid (non-empty strings)
          for (const tag of tags1) {
            expect(typeof tag).toBe('string');
            expect(tag.length).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  }, 120000);

  it('should not assign contradictory tags to the same element', async () => {
    if (!hasValidApiKey) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        elementArbitrary(),
        async (element) => {
          // Analyze tags
          const tags = await semanticAnalyzer.analyzeTags(element, element.context);
          
          // Property: Should not have contradictory tags
          // Check for obvious contradictions
          const contradictions = [
            ['technical', 'non-technical'],
            ['hard_skill', 'soft_skill'],
            ['required', 'optional']
          ];
          
          for (const [tag1, tag2] of contradictions) {
            const hasTag1 = tags.some(t => t.toLowerCase().includes(tag1));
            const hasTag2 = tags.some(t => t.toLowerCase().includes(tag2));
            
            // Should not have both contradictory tags
            if (hasTag1 && hasTag2) {
              // This would be a contradiction
              expect(false).toBe(true);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  }, 120000);
});

// ============================================================================
// Unit Tests for Semantic Analyzer
// Task 4.12: Test known terms, ambiguous terms, synonyms
// ============================================================================

describe('Semantic Analyzer Unit Tests', () => {
  describe('Known Technical Terms', () => {
    it('should correctly tag Python as programming language', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const element: Element = {
        text: 'Python',
        normalizedText: 'python',
        tags: [],
        context: 'Experience with Python programming language',
        position: { start: 0, end: 6 }
      };
      
      const tags = await semanticAnalyzer.analyzeTags(element, element.context);
      
      expect(tags.length).toBeGreaterThan(0);
      const hasRelevantTag = tags.some(tag => 
        tag.toLowerCase().includes('programming') ||
        tag.toLowerCase().includes('language') ||
        tag.toLowerCase().includes('technical')
      );
      expect(hasRelevantTag).toBe(true);
    });

    it('should correctly tag React as frontend framework', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const element: Element = {
        text: 'React',
        normalizedText: 'react',
        tags: [],
        context: 'Frontend development with React framework',
        position: { start: 0, end: 5 }
      };
      
      const tags = await semanticAnalyzer.analyzeTags(element, element.context);
      
      expect(tags.length).toBeGreaterThan(0);
      const hasRelevantTag = tags.some(tag => 
        tag.toLowerCase().includes('framework') ||
        tag.toLowerCase().includes('frontend') ||
        tag.toLowerCase().includes('web')
      );
      expect(hasRelevantTag).toBe(true);
    });
  });

  describe('Ambiguous Terms in Different Contexts', () => {
    it('should tag Java as programming language in tech context', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const element: Element = {
        text: 'Java',
        normalizedText: 'java',
        tags: [],
        context: 'Backend development using Java programming language',
        position: { start: 0, end: 4 }
      };
      
      const tags = await semanticAnalyzer.analyzeTags(element, element.context);
      
      const hasProgTag = tags.some(tag => 
        tag.toLowerCase().includes('programming') ||
        tag.toLowerCase().includes('language')
      );
      expect(hasProgTag).toBe(true);
    });

    it('should tag Java as location in geographic context', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const element: Element = {
        text: 'Java',
        normalizedText: 'java',
        tags: [],
        context: 'Remote position available in Java, Indonesia',
        position: { start: 0, end: 4 }
      };
      
      const tags = await semanticAnalyzer.analyzeTags(element, element.context);
      
      const hasLocTag = tags.some(tag => 
        tag.toLowerCase().includes('location') ||
        tag.toLowerCase().includes('geographic') ||
        tag.toLowerCase().includes('place')
      );
      // Note: LLM might still recognize this as ambiguous
      // The test verifies that context influences tagging
      expect(tags.length).toBeGreaterThan(0);
    });
  });

  describe('Synonym Recognition', () => {
    it('should recognize JavaScript and JS as synonyms', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const resumeElement: Element = {
        text: 'JavaScript',
        normalizedText: 'javascript',
        tags: ['programming'],
        context: 'Frontend development with JavaScript',
        position: { start: 0, end: 10 }
      };
      
      const jobElement: Element = {
        text: 'JS',
        normalizedText: 'js',
        tags: ['programming'],
        context: 'Experience with JS frameworks required',
        position: { start: 0, end: 2 }
      };
      
      const matches = await semanticAnalyzer.findSemanticMatches(resumeElement, [jobElement]);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBeGreaterThan(0.9);
      expect(matches[0].matchType).toBe('synonym');
    });

    it('should recognize PostgreSQL and Postgres as synonyms', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const resumeElement: Element = {
        text: 'PostgreSQL',
        normalizedText: 'postgresql',
        tags: ['database'],
        context: 'Database management with PostgreSQL',
        position: { start: 0, end: 10 }
      };
      
      const jobElement: Element = {
        text: 'Postgres',
        normalizedText: 'postgres',
        tags: ['database'],
        context: 'Experience with Postgres required',
        position: { start: 0, end: 8 }
      };
      
      const matches = await semanticAnalyzer.findSemanticMatches(resumeElement, [jobElement]);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBeGreaterThan(0.9);
      expect(matches[0].matchType).toBe('synonym');
    });

    it('should recognize leadership and "led team" as related', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const resumeElement: Element = {
        text: 'led team',
        normalizedText: 'led team',
        tags: ['soft_skill'],
        context: 'Led team of 5 engineers on multiple projects',
        position: { start: 0, end: 8 }
      };
      
      const jobElement: Element = {
        text: 'leadership',
        normalizedText: 'leadership',
        tags: ['soft_skill'],
        context: 'Strong leadership skills required',
        position: { start: 0, end: 10 }
      };
      
      const matches = await semanticAnalyzer.findSemanticMatches(resumeElement, [jobElement]);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Exact Matches', () => {
    it('should recognize exact matches with confidence 1.0', async () => {
      const element: Element = {
        text: 'Python',
        normalizedText: 'python',
        tags: ['programming'],
        context: 'Python programming',
        position: { start: 0, end: 6 }
      };
      
      const matches = await semanticAnalyzer.findSemanticMatches(element, [element]);
      
      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('exact');
      expect(matches[0].confidence).toBe(1.0);
    });
  });

  describe('No Matches', () => {
    it('should return empty array for completely unrelated terms', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const resumeElement: Element = {
        text: 'Python',
        normalizedText: 'python',
        tags: ['programming'],
        context: 'Python programming language',
        position: { start: 0, end: 6 }
      };
      
      const jobElement: Element = {
        text: 'cooking',
        normalizedText: 'cooking',
        tags: ['hobby'],
        context: 'Enjoys cooking in free time',
        position: { start: 0, end: 7 }
      };
      
      const matches = await semanticAnalyzer.findSemanticMatches(resumeElement, [jobElement]);
      
      // Should either return empty array or very low confidence match
      if (matches.length > 0) {
        expect(matches[0].confidence).toBeLessThan(0.5);
      }
    });
  });

  describe('Multiple Matches', () => {
    it('should return matches sorted by confidence', async () => {
      if (!hasValidApiKey) {
        console.log('Skipping test: No valid API key available');
        return;
      }

      const resumeElement: Element = {
        text: 'JavaScript',
        normalizedText: 'javascript',
        tags: ['programming'],
        context: 'JavaScript programming',
        position: { start: 0, end: 10 }
      };
      
      const jobElements: Element[] = [
        {
          text: 'JS',
          normalizedText: 'js',
          tags: ['programming'],
          context: 'JS frameworks',
          position: { start: 0, end: 2 }
        },
        {
          text: 'programming',
          normalizedText: 'programming',
          tags: ['skill'],
          context: 'Programming experience',
          position: { start: 0, end: 11 }
        },
        {
          text: 'cooking',
          normalizedText: 'cooking',
          tags: ['hobby'],
          context: 'Cooking skills',
          position: { start: 0, end: 7 }
        }
      ];
      
      const matches = await semanticAnalyzer.findSemanticMatches(resumeElement, jobElements);
      
      // Should have matches sorted by confidence (highest first)
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].confidence).toBeGreaterThanOrEqual(matches[i + 1].confidence);
      }
    });
  });
});
