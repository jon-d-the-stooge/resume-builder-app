/**
 * Job Description Parser
 * 
 * Parses job descriptions into structured elements with importance scores.
 * Uses the shared LLM client to extract keywords, concepts, attributes, and skills.
 * 
 * Requirements: 1.1 (Job Description Parsing)
 * Task: 2.4 (Create parseJobDescription function)
 */

import { LLMClient } from '../../shared/llm/client';
import { LLMRequest } from '../../shared/llm/types';
import { JobPosting, ParsedJob, Element } from '../types';
import { prepareForParsing } from './textNormalizer';
import { deduplicateElements } from './deduplicator';

/**
 * System prompt for job description parsing
 * Instructs the LLM to extract elements with importance scores
 */
const JOB_PARSING_SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) parser specialized in analyzing job descriptions. Your job is to extract structured elements from job postings and assign importance scores.

Extract:
- Keywords: Important terms and phrases
- Skills: Technical and soft skills (e.g., "Python", "leadership", "communication")
- Multi-word phrases: Compound terms that should be kept together (e.g., "machine learning", "project management", "data analysis")
- Attributes: Qualifications, certifications, experience levels
- Concepts: Methodologies, practices, principles

CRITICAL RULES FOR IMPORTANCE SCORING (FOLLOW EXACTLY):
1. ALWAYS assign importance scores between 0.0 and 1.0 for EVERY element
2. EXPLICIT HIGH-IMPORTANCE indicators → MUST assign 0.95:
   - "required", "must have", "essential", "mandatory", "critical", "necessary"
   - Example: "Python required" → importance: 0.95
3. EXPLICIT LOW-IMPORTANCE indicators → MUST assign 0.4:
   - "preferred", "nice to have", "bonus", "plus", "optional", "a plus"
   - Example: "Docker nice to have" → importance: 0.4
4. MEDIUM-HIGH indicators → assign 0.75:
   - "strongly preferred", "highly desired", "important", "strongly recommended"
5. CONFLICTING indicators → ALWAYS use the HIGHEST importance:
   - If "React required" AND "React nice to have" appear → use 0.95 (required wins)
   - If "Python essential" AND "Python preferred" appear → use 0.95 (essential wins)
6. NO explicit indicator → assign 0.5 (neutral baseline)

IMPORTANCE SCORING EXAMPLES:
- "Required: Python" → importance: 0.95
- "Must have: 5 years experience" → importance: 0.95
- "Nice to have: Docker" → importance: 0.4
- "Preferred: AWS experience" → importance: 0.4
- "Strongly preferred: leadership" → importance: 0.75
- "Experience with React" (no indicator) → importance: 0.5

CRITICAL RULES FOR PHRASE EXTRACTION:
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
      "category": "keyword|skill|attribute|experience|concept",
      "context": "surrounding sentence or phrase for context",
      "importance": 0.0-1.0,
      "position": { "start": 0, "end": 10 }
    }
  ]
}`;

/**
 * Interface for the LLM response structure
 */
interface JobParsingResponse {
  elements: Array<{
    text: string;
    normalizedText: string;
    tags: string[];
    category: 'keyword' | 'skill' | 'attribute' | 'experience' | 'concept';
    context: string;
    importance: number;
    position: { start: number; end: number };
  }>;
}

/**
 * Parse a job description into structured elements with importance scores
 * 
 * This function:
 * - Extracts keywords, concepts, attributes, and skills from the job description
 * - Assigns importance scores (0.0-1.0) based on explicit indicators and context
 * - Handles multi-word phrases as single elements
 * - Deduplicates elements and consolidates with maximum importance scores
 * - Leverages shared LLM client caching to avoid redundant API calls
 * 
 * @param jobPosting - The job posting to parse
 * @param llmClient - The shared LLM client instance
 * @returns ParsedJob with elements array including importance scores
 */
export async function parseJobDescription(
  jobPosting: JobPosting,
  llmClient: LLMClient
): Promise<ParsedJob> {
  // Validate input
  if (!jobPosting) {
    throw new Error('Job posting is required');
  }

  if (!jobPosting.id || !jobPosting.title) {
    throw new Error('Job posting must have id and title');
  }

  // Combine all text sections
  const sections = [
    { label: 'Title', text: jobPosting.title },
    { label: 'Description', text: jobPosting.description || '' },
    { label: 'Requirements', text: jobPosting.requirements || '' },
    { label: 'Qualifications', text: jobPosting.qualifications || '' }
  ];

  // Filter out empty sections and prepare text
  const nonEmptySections = sections.filter(s => s.text && s.text.trim().length > 0);
  
  // Must have at least description, requirements, or qualifications (not just title)
  const hasContent = (jobPosting.description && jobPosting.description.trim().length > 0) ||
                     (jobPosting.requirements && jobPosting.requirements.trim().length > 0) ||
                     (jobPosting.qualifications && jobPosting.qualifications.trim().length > 0);
  
  if (!hasContent) {
    throw new Error('Job posting must contain at least description, requirements, or qualifications');
  }

  // Combine all sections into one text for parsing
  const combinedText = nonEmptySections
    .map(s => `[${s.label}]\n${s.text}`)
    .join('\n\n');

  const preparedText = prepareForParsing(combinedText);

  if (preparedText.length === 0) {
    throw new Error('Job posting text is empty after normalization');
  }

  // Build the user prompt
  const userPrompt = buildJobParsingPrompt(preparedText);

  // Create LLM request
  const request: LLMRequest = {
    systemPrompt: JOB_PARSING_SYSTEM_PROMPT,
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
    const parsed = llmClient.parseJsonResponse(response.content) as JobParsingResponse;

    // Validate response structure
    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      throw new Error('Invalid response structure: missing elements array');
    }

    // Convert to Element objects with importance scores
    const elements: Element[] = parsed.elements.map(el => {
      // Validate importance score is in range [0.0, 1.0]
      const importance = Math.max(0.0, Math.min(1.0, el.importance || 0.5));

      return {
        text: el.text || '',
        normalizedText: el.normalizedText || el.text?.toLowerCase() || '',
        tags: Array.isArray(el.tags) ? el.tags : [],
        context: el.context || '',
        position: el.position || { start: 0, end: 0 },
        // Store importance and category in tags for now
        // (will be properly typed when we implement TaggedElement conversion)
        importance,
        category: el.category || 'keyword'
      } as any; // Type assertion needed until we add importance to Element
    });

    // Deduplicate elements (consolidates duplicates with max importance)
    const deduplicated = deduplicateElements(elements);

    // Build ParsedJob result
    const parsedJob: ParsedJob = {
      elements: deduplicated,
      rawText: combinedText,
      metadata: {
        jobId: jobPosting.id,
        title: jobPosting.title,
        elementCount: deduplicated.length,
        parsedAt: new Date().toISOString(),
        ...jobPosting.metadata
      }
    };

    return parsedJob;

  } catch (error) {
    // Provide detailed error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse job description: ${errorMessage}`);
  }
}

/**
 * Build the user prompt for job description parsing
 * 
 * @param text - The prepared job description text
 * @returns Formatted user prompt
 */
function buildJobParsingPrompt(text: string): string {
  return `Extract all important elements from this job description and assign importance scores.

Remember to:
- Keep multi-word phrases together (e.g., "machine learning", "project management")
- Extract technical skills with full names (e.g., "React.js", "Python 3.x")
- Include soft skills (e.g., "leadership", "communication", "teamwork")
- Identify experience indicators (e.g., "5 years", "senior level", "lead")
- Preserve compound terms (e.g., "data analysis", "software development")
- Assign importance scores based on explicit indicators and context
- Use 0.9-1.0 for "required", "must have", "essential"
- Use 0.7-0.8 for "strongly preferred", "highly desired"
- Use 0.3-0.5 for "preferred", "nice to have", "bonus"
- Infer importance from position, frequency, and context when no explicit indicators

Job Description:
${text}

Return the results as JSON following the specified structure.`;
}

/**
 * Parse multiple job descriptions in batch
 * Useful for processing multiple job postings efficiently
 * 
 * @param jobPostings - Array of job postings to parse
 * @param llmClient - The shared LLM client instance
 * @returns Array of ParsedJob results
 */
export async function parseJobDescriptions(
  jobPostings: JobPosting[],
  llmClient: LLMClient
): Promise<ParsedJob[]> {
  const results: ParsedJob[] = [];

  for (const jobPosting of jobPostings) {
    try {
      const parsed = await parseJobDescription(jobPosting, llmClient);
      results.push(parsed);
    } catch (error) {
      console.error(`Failed to parse job ${jobPosting.id}:`, error);
      // Continue with other jobs
    }
  }

  return results;
}

/**
 * Validate that a parsed job has elements with importance scores
 * Used for testing and quality assurance
 * 
 * @param parsedJob - The parsed job to validate
 * @returns True if all elements have valid importance scores
 */
export function hasValidImportanceScores(parsedJob: ParsedJob): boolean {
  return parsedJob.elements.every(el => {
    const importance = (el as any).importance;
    return typeof importance === 'number' && 
           importance >= 0.0 && 
           importance <= 1.0;
  });
}

/**
 * Get elements by importance threshold
 * 
 * @param parsedJob - The parsed job
 * @param minImportance - Minimum importance score (0.0-1.0)
 * @returns Array of elements with importance >= minImportance
 */
export function getElementsByImportance(
  parsedJob: ParsedJob,
  minImportance: number
): Element[] {
  return parsedJob.elements.filter(el => {
    const importance = (el as any).importance || 0;
    return importance >= minImportance;
  });
}

/**
 * Get critical elements (importance >= 0.8)
 * 
 * @param parsedJob - The parsed job
 * @returns Array of critical elements
 */
export function getCriticalElements(parsedJob: ParsedJob): Element[] {
  return getElementsByImportance(parsedJob, 0.8);
}

/**
 * Get statistics about parsed job elements
 * 
 * @param parsedJob - The parsed job
 * @returns Statistics object
 */
export function getParsingStats(parsedJob: ParsedJob): {
  totalElements: number;
  criticalElements: number;
  highImportance: number;
  mediumImportance: number;
  lowImportance: number;
  averageImportance: number;
} {
  const elements = parsedJob.elements;
  const totalElements = elements.length;

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let totalImportance = 0;

  for (const el of elements) {
    const importance = (el as any).importance || 0;
    totalImportance += importance;

    if (importance >= 0.8) {
      criticalCount++;
    } else if (importance >= 0.6) {
      highCount++;
    } else if (importance >= 0.4) {
      mediumCount++;
    } else {
      lowCount++;
    }
  }

  return {
    totalElements,
    criticalElements: criticalCount,
    highImportance: highCount,
    mediumImportance: mediumCount,
    lowImportance: lowCount,
    averageImportance: totalElements > 0 ? totalImportance / totalElements : 0
  };
}
