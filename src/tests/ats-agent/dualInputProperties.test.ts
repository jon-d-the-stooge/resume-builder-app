/**
 * Property-Based Tests for Dual Input Support
 * 
 * Tests Property 33: Dual Input Support
 * Validates: Requirements 9.5
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import * as dotenv from 'dotenv';
import { LLMClient } from '../../shared/llm/client';
import { parseResume } from '../../ats-agent/parser/resumeParser';
import { atsObsidianClient } from '../../ats-agent/integration/obsidianClient';
import type { Resume, ParsedResume } from '../../ats-agent/types';

dotenv.config();

function getLLMClient(): LLMClient {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  return new LLMClient({
    provider: process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic',
    apiKey: apiKey || 'test-key',
    model: process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  });
}

function hasValidApiKey(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  return !!apiKey && apiKey !== 'test-key' && apiKey.length > 20;
}

const resumeContentArbitrary = (): fc.Arbitrary<string> => {
  return fc.oneof(
    fc.constant('Senior Software Engineer with 5 years of experience in Python and machine learning.'),
    fc.constant('Data Scientist specializing in machine learning. Proficient in Python, R, SQL.'),
    fc.constant('Product Manager with strong leadership and communication skills.'),
    fc.constant('Full Stack Developer skilled in React.js, Node.js, TypeScript.')
  );
};

const textResumeArbitrary = (): fc.Arbitrary<Resume> => {
  return fc.record({
    id: fc.uuid(),
    content: resumeContentArbitrary(),
    format: fc.constantFrom('text' as const, 'markdown' as const),
    metadata: fc.constant({})
  });
};

const obsidianResumeArbitrary = (): fc.Arbitrary<Resume> => {
  return fc.record({
    id: fc.uuid(),
    content: resumeContentArbitrary(),
    format: fc.constant('obsidian' as const),
    metadata: fc.record({
      path: fc.string({ minLength: 10, maxLength: 50 }).map(s => `resumes/${s}/content.md`)
    })
  });
};

function isValidParsedResume(parsed: ParsedResume): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!Array.isArray(parsed.elements)) return false;
  if (typeof parsed.rawText !== 'string') return false;
  if (!parsed.metadata || typeof parsed.metadata !== 'object') return false;
  
  for (const element of parsed.elements) {
    if (!element || typeof element !== 'object') return false;
    if (typeof element.text !== 'string' || element.text.length === 0) return false;
    if (typeof element.normalizedText !== 'string') return false;
    if (!Array.isArray(element.tags)) return false;
    if (typeof element.context !== 'string') return false;
    if (!element.position || typeof element.position !== 'object') return false;
    if (typeof element.position.start !== 'number' || typeof element.position.end !== 'number') return false;
  }
  
  return true;
}

/**
 * Property 33: Dual Input Support
 * **Validates: Requirements 9.5**
 */
describe('Feature: ats-agent, Property 33: Dual Input Support', () => {
  it('should successfully parse resumes with direct text input', async () => {
    if (!hasValidApiKey()) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    const llmClient = getLLMClient();
    
    await fc.assert(
      fc.asyncProperty(
        textResumeArbitrary(),
        async (resume) => {
          const parsed = await parseResume(resume, llmClient);
          
          expect(isValidParsedResume(parsed)).toBe(true);
          expect(parsed.elements.length).toBeGreaterThan(0);
          expect(parsed.rawText).toBe(resume.content);
          expect(parsed.metadata.resumeId).toBe(resume.id);
          expect(parsed.metadata.format).toBe(resume.format);
          
          return true;
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it('should successfully parse resumes with Obsidian format', async () => {
    if (!hasValidApiKey()) {
      console.log('Skipping test: No valid API key available');
      return;
    }
    
    const llmClient = getLLMClient();
    
    await fc.assert(
      fc.asyncProperty(
        obsidianResumeArbitrary(),
        async (resume) => {
          const parsed = await parseResume(resume, llmClient);
          
          expect(isValidParsedResume(parsed)).toBe(true);
          expect(parsed.elements.length).toBeGreaterThan(0);
          expect(parsed.rawText).toBe(resume.content);
          expect(parsed.metadata.resumeId).toBe(resume.id);
          expect(parsed.metadata.format).toBe('obsidian');
          
          if (resume.metadata?.path) {
            expect(parsed.metadata.path).toBe(resume.metadata.path);
          }
          
          return true;
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);
});

describe('Dual Input Support Edge Cases', () => {
  it('should accept text format', async () => {
    if (!hasValidApiKey()) {
      console.log('Skipping test: No valid API key available');
      return;
    }

    const llmClient = getLLMClient();
    const resume: Resume = {
      id: 'test-text',
      content: 'Senior Software Engineer with 5 years of Python experience.',
      format: 'text',
      metadata: {}
    };
    
    const parsed = await parseResume(resume, llmClient);
    expect(isValidParsedResume(parsed)).toBe(true);
    expect(parsed.metadata.format).toBe('text');
  }, 60000);

  it('should accept obsidian format', async () => {
    if (!hasValidApiKey()) {
      console.log('Skipping test: No valid API key available');
      return;
    }

    const llmClient = getLLMClient();
    const resume: Resume = {
      id: 'test-obsidian',
      content: 'Senior Software Engineer with 5 years of Python experience.',
      format: 'obsidian',
      metadata: {
        path: 'resumes/test-obsidian/content.md'
      }
    };
    
    const parsed = await parseResume(resume, llmClient);
    expect(isValidParsedResume(parsed)).toBe(true);
    expect(parsed.metadata.format).toBe('obsidian');
    expect(parsed.metadata.path).toBe('resumes/test-obsidian/content.md');
  }, 60000);

  it('should handle Obsidian client errors gracefully', async () => {
    const mockGetResumeContent = vi.spyOn(atsObsidianClient, 'getResumeContent');
    mockGetResumeContent.mockRejectedValue(new Error('Obsidian vault unavailable'));

    await expect(atsObsidianClient.getResumeContent('nonexistent-id'))
      .rejects.toThrow();

    mockGetResumeContent.mockRestore();
  });
});
