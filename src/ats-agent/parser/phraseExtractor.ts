/**
 * LLM-based Phrase Extraction
 * 
 * Uses the shared LLM client to intelligently extract multi-word phrases,
 * keywords, skills, and concepts from job descriptions and resumes.
 * 
 * Requirements: 1.4 (Multi-word phrase handling)
 */

import { LLMClient } from '../../shared/llm/client';
import { LLMRequest } from '../../shared/llm/types';
import { Element } from '../types';
import { prepareForParsing } from './textNormalizer';
import { deduplicateElements } from './deduplicator';

/**
 * System prompt for phrase extraction
 * Instructs the LLM to identify multi-word phrases and extract structured elements
 */
const PHRASE_EXTRACTION_SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) parser. Your job is to extract structured elements from job descriptions and resumes.

Extract:
- Keywords: Important terms and phrases
- Skills: Technical and soft skills (e.g., "Python", "leadership", "communication")
- Multi-word phrases: Compound terms that should be kept together (e.g., "machine learning", "project management", "data analysis")
- Attributes: Qualifications, certifications, experience levels
- Concepts: Methodologies, practices, principles

CRITICAL RULES:
1. Identify multi-word phrases as SINGLE elements (e.g., "machine learning" NOT "machine" and "learning")
2. Keep compound terms together (e.g., "project management", "software development", "customer service")
3. Extract technical terms with their full context (e.g., "React.js", "Node.js", "SQL Server")
4. Preserve acronyms and abbreviations (e.g., "API", "REST", "CI/CD")
5. Include the surrounding context (1-2 sentences) for each element
6. Record the approximate position where each element appears in the text

Return a JSON object with this exact structure:
{
  "elements": [
    {
      "text": "the exact phrase as it appears",
      "normalizedText": "lowercase normalized version",
      "tags": ["initial", "tags"],
      "context": "surrounding sentence or phrase for context",
      "position": { "start": 0, "end": 10 }
    }
  ]
}`;

/**
 * Interface for the LLM response structure
 */
interface PhraseExtractionResponse {
  elements: Array<{
    text: string;
    normalizedText: string;
    tags: string[];
    context: string;
    position: { start: number; end: number };
  }>;
}

/**
 * Extract phrases and elements from text using LLM
 * 
 * @param text - The text to extract phrases from (job description or resume)
 * @param llmClient - The shared LLM client instance
 * @param sourceType - Type of source ('job' or 'resume') for context
 * @returns Array of extracted Element objects
 */
export async function extractPhrases(
  text: string,
  llmClient: LLMClient,
  sourceType: 'job' | 'resume' = 'job'
): Promise<Element[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Prepare text for parsing
  const preparedText = prepareForParsing(text);
  
  if (preparedText.length === 0) {
    return [];
  }

  // Build the user prompt
  const userPrompt = buildUserPrompt(preparedText, sourceType);

  // Create LLM request
  const request: LLMRequest = {
    systemPrompt: PHRASE_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0, // Deterministic output
    maxTokens: 4096
  };

  try {
    // Call LLM (uses caching automatically)
    const response = await llmClient.complete(request);

    // Parse JSON response
    const parsed = llmClient.parseJsonResponse(response.content) as PhraseExtractionResponse;

    // Validate and convert to Element objects
    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      throw new Error('Invalid response structure: missing elements array');
    }

    const elements = parsed.elements.map(el => ({
      text: el.text || '',
      normalizedText: el.normalizedText || el.text?.toLowerCase() || '',
      tags: Array.isArray(el.tags) ? el.tags : [],
      context: el.context || '',
      position: el.position || { start: 0, end: 0 }
    }));

    // Deduplicate elements to consolidate duplicates from different sections
    return deduplicateElements(elements);

  } catch (error) {
    // Log error but don't crash - return empty array for graceful degradation
    console.error('Phrase extraction failed:', error);
    throw new Error(
      `Failed to extract phrases: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Build the user prompt for phrase extraction
 * 
 * @param text - The prepared text
 * @param sourceType - Type of source for context
 * @returns Formatted user prompt
 */
function buildUserPrompt(text: string, sourceType: 'job' | 'resume'): string {
  const sourceDescription = sourceType === 'job' 
    ? 'job description' 
    : 'resume';

  return `Extract all important phrases, keywords, skills, and concepts from this ${sourceDescription}.

Remember to:
- Keep multi-word phrases together (e.g., "machine learning", "project management")
- Extract technical skills with full names (e.g., "React.js", "Python 3.x")
- Include soft skills (e.g., "leadership", "communication", "teamwork")
- Identify experience indicators (e.g., "5 years", "senior level", "lead")
- Preserve compound terms (e.g., "data analysis", "software development")

Text to analyze:
${text}

Return the results as JSON following the specified structure.`;
}

/**
 * Extract phrases from multiple text sections
 * Useful for processing different parts of a job description or resume separately
 * 
 * @param sections - Array of text sections with labels
 * @param llmClient - The shared LLM client instance
 * @param sourceType - Type of source for context
 * @returns Combined array of extracted elements
 */
export async function extractPhrasesFromSections(
  sections: Array<{ label: string; text: string }>,
  llmClient: LLMClient,
  sourceType: 'job' | 'resume' = 'job'
): Promise<Element[]> {
  const allElements: Element[] = [];

  for (const section of sections) {
    if (!section.text || section.text.trim().length === 0) {
      continue;
    }

    try {
      const elements = await extractPhrases(section.text, llmClient, sourceType);
      
      // Add section label to context
      const elementsWithSection = elements.map(el => ({
        ...el,
        context: `[${section.label}] ${el.context}`
      }));

      allElements.push(...elementsWithSection);
    } catch (error) {
      console.error(`Failed to extract phrases from section "${section.label}":`, error);
      // Continue with other sections
    }
  }

  // Deduplicate elements across all sections
  return deduplicateElements(allElements);
}

/**
 * Validate that extracted elements contain multi-word phrases
 * Used for testing and quality assurance
 * 
 * @param elements - Array of extracted elements
 * @returns True if multi-word phrases are present
 */
export function hasMultiWordPhrases(elements: Element[]): boolean {
  return elements.some(el => {
    const words = el.text.trim().split(/\s+/);
    return words.length > 1;
  });
}

/**
 * Find specific multi-word phrases in extracted elements
 * 
 * @param elements - Array of extracted elements
 * @param phrases - Array of phrases to look for
 * @returns Array of found phrases
 */
export function findMultiWordPhrases(
  elements: Element[],
  phrases: string[]
): Element[] {
  const normalizedPhrases = phrases.map(p => p.toLowerCase().trim());
  
  return elements.filter(el => {
    const normalized = el.normalizedText.toLowerCase().trim();
    return normalizedPhrases.includes(normalized) && 
           el.text.trim().split(/\s+/).length > 1;
  });
}
