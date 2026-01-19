/**
 * Resume Parser
 * 
 * Parses resumes into structured elements using the same methodology as job descriptions.
 * Uses the shared LLM client to extract keywords, concepts, attributes, skills, and experience.
 * 
 * Requirements: 4.1, 4.3, 4.4 (Resume Parsing)
 * Task: 2.5 (Create parseResume function)
 */

import { LLMClient } from '../../shared/llm/client';
import { LLMRequest } from '../../shared/llm/types';
import { Resume, ParsedResume, Element } from '../types';
import { prepareForParsing } from './textNormalizer';
import { deduplicateElements } from './deduplicator';

/**
 * System prompt for resume parsing
 * Instructs the LLM to extract elements with section identification
 */
const RESUME_PARSING_SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) parser specialized in analyzing resumes. Your job is to extract structured elements from resumes using the same methodology as job description parsing.

Extract:
- Keywords: Important terms and phrases
- Skills: Technical and soft skills (e.g., "Python", "leadership", "communication")
- Multi-word phrases: Compound terms that should be kept together (e.g., "machine learning", "project management", "data analysis")
- Attributes: Qualifications, certifications, experience levels
- Experience: Work history descriptions and accomplishments
- Concepts: Methodologies, practices, principles

CRITICAL RULES FOR SECTION IDENTIFICATION:
1. Identify which section each element comes from: summary, experience, skills, education, or other
2. Extract experience descriptions and accomplishments as separate elements
3. Identify level of experience indicators (e.g., "5 years", "senior", "lead", "junior")
4. Preserve context about roles, companies, and time periods

CRITICAL RULES FOR PHRASE EXTRACTION:
1. Identify multi-word phrases as SINGLE elements (e.g., "machine learning" NOT "machine" and "learning")
2. Keep compound terms together (e.g., "project management", "software development", "customer service")
3. Extract technical terms with their full context (e.g., "React.js", "Node.js", "SQL Server")
4. Preserve acronyms and abbreviations (e.g., "API", "REST", "CI/CD")
5. Include the surrounding context (1-2 sentences) for each element
6. Record the approximate position where each element appears in the text

CRITICAL RULES FOR EXPERIENCE EXTRACTION:
1. Extract accomplishments separately from job descriptions
2. Identify quantifiable achievements (e.g., "increased sales by 30%", "managed team of 5")
3. Capture action verbs and their objects (e.g., "led team", "developed system", "implemented solution")
4. Identify experience level indicators:
   - Years of experience: "5 years", "3+ years", "over 10 years"
   - Seniority levels: "senior", "lead", "principal", "junior", "entry-level"
   - Role indicators: "manager", "director", "architect", "engineer"

Return a JSON object with this exact structure:
{
  "elements": [
    {
      "text": "the exact phrase as it appears",
      "normalizedText": "lowercase normalized version",
      "tags": ["initial", "tags"],
      "category": "keyword|skill|attribute|experience|concept",
      "context": "surrounding sentence or phrase for context",
      "section": "summary|experience|skills|education|other",
      "position": { "start": 0, "end": 10 }
    }
  ],
  "sections": [
    {
      "type": "summary|experience|skills|education|other",
      "content": "the text content of this section",
      "startPosition": 0,
      "endPosition": 100
    }
  ]
}`;

/**
 * Interface for the LLM response structure
 */
interface ResumeParsingResponse {
  elements: Array<{
    text: string;
    normalizedText: string;
    tags: string[];
    category: 'keyword' | 'skill' | 'attribute' | 'experience' | 'concept';
    context: string;
    section: 'summary' | 'experience' | 'skills' | 'education' | 'other';
    position: { start: number; end: number };
  }>;
  sections: Array<{
    type: 'summary' | 'experience' | 'skills' | 'education' | 'other';
    content: string;
    startPosition: number;
    endPosition: number;
  }>;
}

/**
 * Parse a resume into structured elements using the same methodology as job descriptions
 * 
 * This function:
 * - Extracts keywords, concepts, attributes, skills, and experience from the resume
 * - Identifies resume sections (summary, experience, skills, education)
 * - Extracts experience descriptions and accomplishments separately
 * - Identifies level of experience indicators (e.g., "5 years", "senior", "lead")
 * - Handles multi-word phrases as single elements
 * - Deduplicates elements while preserving context from different sections
 * - Leverages shared LLM client caching to avoid redundant API calls
 * 
 * @param resume - The resume to parse
 * @param llmClient - The shared LLM client instance
 * @returns ParsedResume with elements array and section information
 */
export async function parseResume(
  resume: Resume,
  llmClient: LLMClient
): Promise<ParsedResume> {
  // Validate input
  if (!resume) {
    throw new Error('Resume is required');
  }

  if (!resume.id) {
    throw new Error('Resume must have an id');
  }

  if (!resume.content || resume.content.trim().length === 0) {
    throw new Error('Resume must have content');
  }

  // Prepare text for parsing
  const preparedText = prepareForParsing(resume.content);

  if (preparedText.length === 0) {
    throw new Error('Resume content is empty after normalization');
  }

  const sections = splitResumeIntoSections(preparedText);
  const sectionMaxTokens = 8000;
  const allElements: Element[] = [];
  const allSections: ResumeParsingResponse['sections'] = [];

  for (const section of sections) {
    const userPrompt = buildResumeParsingPrompt(section.content, section.type);
    const request: LLMRequest = {
      systemPrompt: RESUME_PARSING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0,
      maxTokens: sectionMaxTokens
    };

    try {
      const response = await llmClient.complete(request);

      let parsed: ResumeParsingResponse;
      try {
        parsed = llmClient.parseJsonResponse(response.content) as ResumeParsingResponse;
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
        const retryUserPrompt =
          `${userPrompt}\n\n` +
          `IMPORTANT: Return ONLY valid JSON. Do not include markdown code fences, comments, or ellipses.\n` +
          `Ensure all strings are properly closed and escaped, and avoid trailing commas.`;

        const retryResponse = await llmClient.complete({
          ...request,
          messages: [
            {
              role: 'user',
              content: retryUserPrompt
            }
          ]
        });
        parsed = llmClient.parseJsonResponse(retryResponse.content) as ResumeParsingResponse;
      }

      if (!parsed.elements || !Array.isArray(parsed.elements)) {
        throw new Error('Invalid response structure: missing elements array');
      }

      const elements: Element[] = parsed.elements.map(el => {
        return {
          text: el.text || '',
          normalizedText: el.normalizedText || el.text?.toLowerCase() || '',
          tags: Array.isArray(el.tags) ? el.tags : [],
          context: el.context || '',
          position: el.position || { start: 0, end: 0 },
          section: el.section || section.type,
          category: el.category || 'keyword'
        } as any; // Type assertion needed until we add section to Element
      });

      allElements.push(...elements);
      if (Array.isArray(parsed.sections)) {
        allSections.push(...parsed.sections);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse resume section (${section.type}): ${errorMessage}`);
    }
  }

  const deduplicated = deduplicateElements(allElements);

  const parsedResume: ParsedResume = {
    elements: deduplicated,
    rawText: resume.content,
    metadata: {
      resumeId: resume.id,
      format: resume.format,
      elementCount: deduplicated.length,
      parsedAt: new Date().toISOString(),
      sections: allSections,
      ...resume.metadata
    }
  };

  return parsedResume;
}

/**
 * Build the user prompt for resume parsing
 * 
 * @param text - The prepared resume text
 * @returns Formatted user prompt
 */
function buildResumeParsingPrompt(text: string, sectionLabel?: string): string {
  const sectionLine = sectionLabel ? `Section: ${sectionLabel}\n` : '';
  return `Extract all important elements from this resume using the same methodology as job description parsing.

Remember to:
- Keep multi-word phrases together (e.g., "machine learning", "project management")
- Extract technical skills with full names (e.g., "React.js", "Python 3.x")
- Include soft skills (e.g., "leadership", "communication", "teamwork")
- Identify experience indicators (e.g., "5 years", "senior level", "lead")
- Preserve compound terms (e.g., "data analysis", "software development")
- Identify which section each element comes from (summary, experience, skills, education, other)
- Extract experience descriptions and accomplishments as separate elements
- Capture quantifiable achievements (e.g., "increased sales by 30%", "managed team of 5")
- Identify action verbs and their objects (e.g., "led team", "developed system")
- Identify level of experience indicators:
  * Years: "5 years", "3+ years", "over 10 years"
  * Seniority: "senior", "lead", "principal", "junior", "entry-level"
  * Roles: "manager", "director", "architect", "engineer"
- Be exhaustive and granular: extract ALL distinct skills, tools, techniques, domains, methods, and responsibilities
- Avoid summarizing; prefer many specific elements over a few general ones
- Include individual items from lists (e.g., each tool/technique separately)
- Aim for 80-150 elements when the resume supports it
- Only analyze the provided section; do not infer content from other sections
- If a section label is provided, set "section" to that label unless clearly other

${sectionLine}
Resume:
${text}

Return the results as JSON following the specified structure.`;
}

function splitResumeIntoSections(text: string): Array<{ type: string; content: string }> {
  const lines = text.split('\n');
  const sections: Array<{ type: string; content: string }> = [];
  let currentType = 'other';
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content) {
      sections.push({ type: currentType, content });
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      buffer.push(line);
      continue;
    }

    const nextType = detectSectionType(trimmed);
    if (nextType) {
      flush();
      currentType = nextType;
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [{ type: 'other', content: text }];
  }

  return sections;
}

function detectSectionType(line: string): string | null {
  const normalized = line.toLowerCase().replace(/[:\s]+/g, ' ').trim();
  const header = normalized.replace(/[^a-z ]/g, '');

  const summaryHeaders = [
    'summary',
    'professional summary',
    'profile',
    'overview'
  ];
  if (summaryHeaders.includes(header)) {
    return 'summary';
  }
  const skillsHeaders = [
    'skills',
    'key skills',
    'technical skills',
    'core skills',
    'competencies',
    'expertise'
  ];
  if (skillsHeaders.includes(header)) {
    return 'skills';
  }
  const experienceHeaders = [
    'experience',
    'employment experience',
    'work experience',
    'professional experience',
    'employment history',
    'work history'
  ];
  if (experienceHeaders.includes(header)) {
    return 'experience';
  }
  const educationHeaders = [
    'education',
    'academic background',
    'academic history',
    'training'
  ];
  if (educationHeaders.includes(header)) {
    return 'education';
  }
  const otherHeaders = [
    'publications',
    'conference proceedings',
    'awards and leadership',
    'awards',
    'leadership',
    'certifications',
    'professional affiliations',
    'projects'
  ];
  if (otherHeaders.includes(header)) {
    return 'other';
  }

  const looksLikeHeader = /^[A-Z][A-Z\s&/]{2,}$/.test(line);
  if (looksLikeHeader) {
    return 'other';
  }

  const singleWordHeader = /^[A-Z]{3,}$/.test(line);
  if (singleWordHeader) {
    return 'other';
  }

  return null;
}

/**
 * Parse multiple resumes in batch
 * Useful for processing multiple resumes efficiently
 * 
 * @param resumes - Array of resumes to parse
 * @param llmClient - The shared LLM client instance
 * @returns Array of ParsedResume results
 */
export async function parseResumes(
  resumes: Resume[],
  llmClient: LLMClient
): Promise<ParsedResume[]> {
  const results: ParsedResume[] = [];

  for (const resume of resumes) {
    try {
      const parsed = await parseResume(resume, llmClient);
      results.push(parsed);
    } catch (error) {
      console.error(`Failed to parse resume ${resume.id}:`, error);
      // Continue with other resumes
    }
  }

  return results;
}

/**
 * Get elements by section
 * 
 * @param parsedResume - The parsed resume
 * @param sectionType - The section type to filter by
 * @returns Array of elements from the specified section
 */
export function getElementsBySection(
  parsedResume: ParsedResume,
  sectionType: 'summary' | 'experience' | 'skills' | 'education' | 'other'
): Element[] {
  return parsedResume.elements.filter(el => {
    const section = (el as any).section;
    return section === sectionType;
  });
}

/**
 * Get experience elements (descriptions and accomplishments)
 * 
 * @param parsedResume - The parsed resume
 * @returns Array of experience elements
 */
export function getExperienceElements(parsedResume: ParsedResume): Element[] {
  return parsedResume.elements.filter(el => {
    const category = (el as any).category;
    return category === 'experience';
  });
}

/**
 * Get level of experience indicators
 * 
 * @param parsedResume - The parsed resume
 * @returns Array of elements indicating experience level
 */
export function getExperienceLevelIndicators(parsedResume: ParsedResume): Element[] {
  return parsedResume.elements.filter(el => {
    const text = el.normalizedText.toLowerCase();
    const tags = el.tags.map(t => t.toLowerCase());
    
    // Check for years of experience
    const hasYears = /\d+\s*(years?|yrs?)/.test(text);
    
    // Check for seniority levels
    const seniorityLevels = ['senior', 'lead', 'principal', 'junior', 'entry-level', 'mid-level'];
    const hasSeniority = seniorityLevels.some(level => 
      text.includes(level) || tags.includes(level)
    );
    
    // Check for role indicators
    const roleIndicators = ['manager', 'director', 'architect', 'engineer', 'specialist', 'analyst'];
    const hasRole = roleIndicators.some(role => 
      text.includes(role) || tags.includes(role)
    );
    
    return hasYears || hasSeniority || hasRole;
  });
}

/**
 * Get statistics about parsed resume elements
 * 
 * @param parsedResume - The parsed resume
 * @returns Statistics object
 */
export function getParsingStats(parsedResume: ParsedResume): {
  totalElements: number;
  bySection: {
    summary: number;
    experience: number;
    skills: number;
    education: number;
    other: number;
  };
  byCategory: {
    keyword: number;
    skill: number;
    attribute: number;
    experience: number;
    concept: number;
  };
  experienceLevelIndicators: number;
} {
  const elements = parsedResume.elements;
  const totalElements = elements.length;

  const bySection = {
    summary: 0,
    experience: 0,
    skills: 0,
    education: 0,
    other: 0
  };

  const byCategory = {
    keyword: 0,
    skill: 0,
    attribute: 0,
    experience: 0,
    concept: 0
  };

  for (const el of elements) {
    const section = (el as any).section || 'other';
    const category = (el as any).category || 'keyword';
    
    if (section in bySection) {
      bySection[section as keyof typeof bySection]++;
    }
    
    if (category in byCategory) {
      byCategory[category as keyof typeof byCategory]++;
    }
  }

  const experienceLevelIndicators = getExperienceLevelIndicators(parsedResume).length;

  return {
    totalElements,
    bySection,
    byCategory,
    experienceLevelIndicators
  };
}

/**
 * Validate that a parsed resume has proper section identification
 * Used for testing and quality assurance
 * 
 * @param parsedResume - The parsed resume to validate
 * @returns True if all elements have valid section assignments
 */
export function hasValidSections(parsedResume: ParsedResume): boolean {
  const validSections = ['summary', 'experience', 'skills', 'education', 'other'];
  
  return parsedResume.elements.every(el => {
    const section = (el as any).section;
    return typeof section === 'string' && validSections.includes(section);
  });
}

/**
 * Check if resume has experience level indicators
 * 
 * @param parsedResume - The parsed resume
 * @returns True if resume contains experience level indicators
 */
export function hasExperienceLevelIndicators(parsedResume: ParsedResume): boolean {
  return getExperienceLevelIndicators(parsedResume).length > 0;
}
