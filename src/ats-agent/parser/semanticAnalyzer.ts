/**
 * Semantic Analyzer
 * 
 * Assigns semantic tags to elements and finds semantic matches between
 * resume and job elements using LLM-based analysis.
 */

import { LLMClient } from '../../shared/llm/client';
import {
  Element,
  SemanticMatch,
  MatchType,
  TAG_TAXONOMY
} from '../types';

/**
 * Semantic analyzer for tagging and matching elements
 */
export class SemanticAnalyzer {
  private llmClient: LLMClient;
  private synonymDictionary: Map<string, string[]>;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
    this.synonymDictionary = this.buildSynonymDictionary();
  }

  /**
   * Analyze element and assign semantic tags
   */
  async analyzeTags(element: Element, context: string): Promise<string[]> {
    const systemPrompt = this.buildTagAnalysisSystemPrompt();
    const userPrompt = this.buildTagAnalysisUserPrompt(element, context);

    try {
      const response = await this.llmClient.complete({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0
      });

      const result = this.llmClient.parseJsonResponse(response.content);
      
      // Validate that at least one tag is assigned
      if (!result.tags || !Array.isArray(result.tags) || result.tags.length === 0) {
        // Fallback to generic tag
        return ['general'];
      }

      return result.tags;
    } catch (error) {
      console.error('Tag analysis failed:', error);
      // Fallback to generic tag
      return ['general'];
    }
  }

  /**
   * Find semantic matches between resume and job elements
   */
  async findSemanticMatches(
    resumeElement: Element,
    jobElements: Element[]
  ): Promise<SemanticMatch[]> {
    const matches: SemanticMatch[] = [];

    for (const jobElement of jobElements) {
      const match = await this.matchElements(resumeElement, jobElement);
      if (match) {
        matches.push(match);
      }
    }

    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find semantic matches in a single batch LLM call.
   * This avoids per-pair LLM calls while keeping semantic accuracy.
   */
  async findSemanticMatchesBatch(
    resumeElements: Element[],
    jobElements: Element[]
  ): Promise<SemanticMatch[]> {
    const matches: SemanticMatch[] = [];

    if (resumeElements.length === 0 || jobElements.length === 0) {
      return matches;
    }

    const resumeByNormalized = new Map<string, Element[]>();
    for (const element of resumeElements) {
      const key = element.normalizedText;
      if (!key) {
        continue;
      }
      const existing = resumeByNormalized.get(key) || [];
      existing.push(element);
      resumeByNormalized.set(key, existing);
    }

    const remainingJobs: Array<{ index: number; element: Element }> = [];
    for (let i = 0; i < jobElements.length; i++) {
      const jobElement = jobElements[i];
      const normalized = jobElement.normalizedText;

      if (normalized && resumeByNormalized.has(normalized)) {
        const resumeElement = resumeByNormalized.get(normalized)![0];
        matches.push({
          resumeElement,
          jobElement,
          matchType: 'exact',
          confidence: 1.0
        });
        continue;
      }

      const synonymMatch = this.findSynonymMatch(jobElement, resumeElements);
      if (synonymMatch) {
        matches.push({
          resumeElement: synonymMatch,
          jobElement,
          matchType: 'synonym',
          confidence: 0.95
        });
        continue;
      }

      remainingJobs.push({ index: i, element: jobElement });
    }

    if (remainingJobs.length === 0) {
      return matches;
    }

    const systemPrompt = this.buildSemanticBatchSystemPrompt();
    const userPrompt = this.buildSemanticBatchUserPrompt(resumeElements, remainingJobs);

    try {
      const response = await this.llmClient.complete({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0
      });

      const result = this.llmClient.parseJsonResponse(response.content);
      const llmMatches = Array.isArray(result.matches) ? result.matches : [];

      for (const match of llmMatches) {
        const jobIndex = Number(match.jobIndex);
        const resumeIndex = Number(match.resumeIndex);
        const confidence = Number(match.confidence);

        if (!Number.isFinite(jobIndex) || !Number.isFinite(resumeIndex)) {
          continue;
        }
        if (jobIndex < 0 || jobIndex >= jobElements.length) {
          continue;
        }
        if (resumeIndex < 0 || resumeIndex >= resumeElements.length) {
          continue;
        }
        if (!Number.isFinite(confidence) || confidence < 0.5) {
          continue;
        }

        const matchType: MatchType =
          match.matchType === 'synonym' || match.matchType === 'related' || match.matchType === 'semantic'
            ? match.matchType
            : 'semantic';

        matches.push({
          resumeElement: resumeElements[resumeIndex],
          jobElement: jobElements[jobIndex],
          matchType,
          confidence
        });
      }
    } catch (error) {
      console.error('Semantic matching failed:', error);
    }

    return matches;
  }

  /**
   * Match two elements and determine match type and confidence
   */
  private async matchElements(
    resumeElement: Element,
    jobElement: Element
  ): Promise<SemanticMatch | null> {
    // Check for exact match first
    if (resumeElement.normalizedText === jobElement.normalizedText) {
      return {
        resumeElement,
        jobElement,
        matchType: 'exact',
        confidence: 1.0
      };
    }

    // Check synonym dictionary
    const synonymMatch = this.checkSynonymMatch(
      resumeElement.normalizedText,
      jobElement.normalizedText
    );
    if (synonymMatch) {
      return {
        resumeElement,
        jobElement,
        matchType: 'synonym',
        confidence: 0.95
      };
    }

    return null;
  }

  /**
   * Find synonym match for a job element in the resume.
   */
  private findSynonymMatch(jobElement: Element, resumeElements: Element[]): Element | null {
    const jobText = jobElement.normalizedText;
    if (!jobText) {
      return null;
    }

    for (const resumeElement of resumeElements) {
      const resumeText = resumeElement.normalizedText;
      if (!resumeText) {
        continue;
      }

      if (this.checkSynonymMatch(jobText, resumeText)) {
        return resumeElement;
      }
    }

    return null;
  }

  /**
   * Build system prompt for tag analysis
   */
  private buildTagAnalysisSystemPrompt(): string {
    const taxonomyStr = JSON.stringify(TAG_TAXONOMY, null, 2);
    
    return `You are an expert at semantic analysis for ATS (Applicant Tracking System) resume screening.

Your task is to assign semantic tags to elements extracted from job descriptions and resumes.

Tag Taxonomy:
${taxonomyStr}

Rules:
1. Assign at least one tag to every element
2. Use tags from the taxonomy above
3. Consider the element's meaning and context
4. For technical terms, assign related concept tags (e.g., "Python" → ["programming", "software development"])
5. For ambiguous terms, use context to determine the correct tags
6. Return tags as a JSON array

Response format:
{
  "tags": ["tag1", "tag2", ...],
  "reasoning": "Brief explanation of tag choices"
}`;
  }

  /**
   * Build user prompt for tag analysis
   */
  private buildTagAnalysisUserPrompt(element: Element, context: string): string {
    return `Analyze this element and assign semantic tags:

Element: "${element.text}"
Normalized: "${element.normalizedText}"
Context: "${context}"

Assign appropriate semantic tags based on the element's meaning and context.`;
  }

  /**
   * Build system prompt for batched semantic matching
   */
  private buildSemanticBatchSystemPrompt(): string {
    return `You are an ATS semantic matcher. Return JSON only.

Your task is to match job elements to the best resume elements based on semantic equivalence.

Match Types:
- "synonym": Different words with same meaning (e.g., "JavaScript" ↔ "JS")
- "related": Same category or close concept (e.g., "Python" ↔ "programming")
- "semantic": Contextually similar concepts

Confidence Scoring:
- 0.95: Strong synonym match
- 0.7-0.9: Related terms
- 0.5-0.7: Semantic similarity
- <0.5: No meaningful match (omit)

Response format (JSON):
{
  "matches": [
    {
      "jobIndex": 0,
      "resumeIndex": 1,
      "matchType": "synonym" | "related" | "semantic",
      "confidence": 0.0-1.0,
      "reason": "Brief explanation"
    }
  ]
}`;
  }

  /**
   * Build user prompt for batched semantic matching
   */
  private buildSemanticBatchUserPrompt(
    resumeElements: Element[],
    remainingJobs: Array<{ index: number; element: Element }>
  ): string {
    const resumePayload = resumeElements.map((element, index) => ({
      index,
      text: element.text,
      normalizedText: element.normalizedText,
      tags: element.tags,
      category: (element as any).category || 'keyword',
      context: element.context
    }));

    const jobPayload = remainingJobs.map(({ index, element }) => ({
      index,
      text: element.text,
      normalizedText: element.normalizedText,
      tags: element.tags,
      category: (element as any).category || 'keyword',
      context: element.context
    }));

    return `Match each job element to the best resume element if a meaningful match exists.
Only include matches with confidence >= 0.5. Use the provided indices.

Resume elements (JSON):
${JSON.stringify(resumePayload)}

Job elements to match (JSON):
${JSON.stringify(jobPayload)}
`;
  }

  /**
   * Build synonym dictionary for common terms
   */
  private buildSynonymDictionary(): Map<string, string[]> {
    const dict = new Map<string, string[]>();

    // Programming languages and abbreviations
    dict.set('javascript', ['js', 'ecmascript']);
    dict.set('js', ['javascript', 'ecmascript']);
    dict.set('typescript', ['ts']);
    dict.set('ts', ['typescript']);
    dict.set('python', ['py']);
    dict.set('py', ['python']);
    
    // Frameworks and tools
    dict.set('react', ['reactjs', 'react.js']);
    dict.set('reactjs', ['react', 'react.js']);
    dict.set('vue', ['vuejs', 'vue.js']);
    dict.set('vuejs', ['vue', 'vue.js']);
    dict.set('angular', ['angularjs']);
    dict.set('angularjs', ['angular']);
    
    // Databases
    dict.set('postgresql', ['postgres', 'psql']);
    dict.set('postgres', ['postgresql', 'psql']);
    dict.set('mongodb', ['mongo']);
    dict.set('mongo', ['mongodb']);
    
    // Soft skills
    dict.set('leadership', ['led team', 'managed team', 'team lead']);
    dict.set('led team', ['leadership', 'managed team', 'team lead']);
    dict.set('managed team', ['leadership', 'led team', 'team lead']);
    dict.set('communication', ['communicate', 'communicating']);
    dict.set('problem solving', ['problem-solving', 'troubleshooting']);
    dict.set('problem-solving', ['problem solving', 'troubleshooting']);
    
    // Experience levels
    dict.set('senior', ['sr', 'lead', 'principal']);
    dict.set('sr', ['senior', 'lead']);
    dict.set('junior', ['jr', 'entry level', 'entry-level']);
    dict.set('jr', ['junior', 'entry level']);
    
    return dict;
  }

  /**
   * Check if two terms are synonyms using the dictionary
   */
  private checkSynonymMatch(term1: string, term2: string): boolean {
    const synonyms1 = this.synonymDictionary.get(term1);
    const synonyms2 = this.synonymDictionary.get(term2);

    if (synonyms1 && synonyms1.includes(term2)) {
      return true;
    }

    if (synonyms2 && synonyms2.includes(term1)) {
      return true;
    }

    return false;
  }
}

/**
 * Create semantic analyzer from environment
 */
export function createSemanticAnalyzer(llmClient: LLMClient): SemanticAnalyzer {
  return new SemanticAnalyzer(llmClient);
}

/**
 * Standalone function to find semantic matches between resume and job elements.
 * Creates a SemanticAnalyzer instance and delegates to findSemanticMatchesBatch.
 *
 * @param resumeElements - Elements from the parsed resume
 * @param jobElements - Elements from the parsed job posting
 * @param llmClient - LLM client for semantic analysis
 * @returns Array of semantic matches sorted by confidence
 */
export async function findSemanticMatches(
  resumeElements: Element[],
  jobElements: Element[],
  llmClient: LLMClient
): Promise<SemanticMatch[]> {
  const analyzer = new SemanticAnalyzer(llmClient);
  return analyzer.findSemanticMatchesBatch(resumeElements, jobElements);
}
