import {
  ParserAgent,
  ParsedResume,
  JobEntry,
  Skill,
  Accomplishment,
  ConfidenceScore,
  ParsingWarning,
  DateRange,
  Location
} from '../types';
import { ErrorHandler } from './errorHandler';
import { LLMClient, LLMProvider, createLLMClientFromEnv } from '../shared/llm';
import { settingsStore } from './settingsStore';

/**
 * AI Parser Agent implementation using shared LLM client
 * Extracts structured content from resume text
 * Supports both Anthropic and OpenAI providers
 */
export class ParserAgentImpl implements ParserAgent {
  private client: LLMClient;

  constructor(apiKey?: string, model?: string, provider?: LLMProvider) {
    // Priority chain for API key configuration:
    // 1. Explicit apiKey parameter (highest priority)
    // 2. Settings store (user-configured via UI) - if initialized
    // 3. Environment variables (fallback)

    if (apiKey) {
      // Use explicitly provided API key
      this.client = new LLMClient({
        apiKey,
        provider: provider || 'anthropic',
        model: model || (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514')
      });
    } else if (settingsStore.isReady() && settingsStore.hasValidKey()) {
      // Use settings store configuration (only if store is initialized)
      const storedKey = settingsStore.getApiKey();
      const storedProvider = settingsStore.getProvider();
      const storedModel = settingsStore.getDefaultModel();

      this.client = new LLMClient({
        apiKey: storedKey,
        provider: storedProvider,
        model: storedModel || (storedProvider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514')
      });
    } else {
      // Try to create from environment variables, but allow it to fail gracefully
      try {
        this.client = createLLMClientFromEnv();
      } catch (error) {
        // Store error to throw later when methods are actually called
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize LLM client';
        // Create a dummy client that will throw on use
        this.client = {
          complete: async () => {
            throw new Error(`LLM client not initialized: ${errorMessage}. Please configure your API key in Settings.`);
          },
          parseJsonResponse: () => {
            throw new Error(`LLM client not initialized: ${errorMessage}. Please configure your API key in Settings.`);
          },
          clearCache: () => {},
          getCacheStats: () => ({ size: 0, maxEntries: 0, enabled: false }),
          getConfig: () => {
            throw new Error(`LLM client not initialized: ${errorMessage}. Please configure your API key in Settings.`);
          }
        } as any;
      }
    }
  }

  /**
   * Clears the parse cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.client.clearCache();
  }

  /**
   * Parse a complete resume and extract all content
   * Uses caching to avoid re-parsing identical content
   */
  async parseResume(text: string): Promise<ParsedResume> {
    return ErrorHandler.retry(
      async () => {
        try {
          const systemPrompt = this.buildSystemPrompt();
          const userPrompt = this.buildResumeParsingPrompt(text);

          const response = await this.client.complete({
            systemPrompt,
            messages: [
              {
                role: 'user',
                content: userPrompt
              }
            ]
          });

          // Parse JSON response
          const parsed = this.client.parseJsonResponse(response.content);
          
          // Calculate confidence scores
          const confidence = this.calculateConfidence(parsed);
          
          // Generate warnings for low confidence sections
          const warnings = this.generateWarnings(parsed, confidence);

          const result: ParsedResume = {
            jobEntries: parsed.jobEntries || [],
            education: parsed.education || [],
            certifications: parsed.certifications || [],
            skills: parsed.skills || [],
            confidence,
            warnings
          };

          return result;
        } catch (error) {
          if (error instanceof Error && error.name === 'AppError') {
            throw error;
          }
          throw ErrorHandler.createParsingError(
            'Failed to parse resume',
            error instanceof Error ? error.message : 'Unknown error',
            { textLength: text.length }
          );
        }
      },
      {
        maxAttempts: 3,
        delayMs: 1000,
        shouldRetry: (error) => ErrorHandler.isRetryable(error)
      }
    );
  }

  /**
   * Extract job entries from resume text
   */
  async extractJobEntries(text: string): Promise<JobEntry[]> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildJobExtractionPrompt(text);

      const response = await this.client.complete({
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const parsed = this.client.parseJsonResponse(response.content);
      return parsed.jobEntries || [];
    } catch (error) {
      throw new Error(`Job extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract skills from text, optionally within a job context
   */
  async extractSkills(text: string, context?: JobEntry): Promise<Skill[]> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildSkillExtractionPrompt(text, context);

      const response = await this.client.complete({
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const parsed = this.client.parseJsonResponse(response.content);
      return parsed.skills || [];
    } catch (error) {
      throw new Error(`Skill extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract accomplishments from text, optionally within a job context
   */
  async extractAccomplishments(text: string, context?: JobEntry): Promise<Accomplishment[]> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildAccomplishmentExtractionPrompt(text, context);

      const response = await this.client.complete({
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const parsed = this.client.parseJsonResponse(response.content);
      return parsed.accomplishments || [];
    } catch (error) {
      throw new Error(`Accomplishment extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build system prompt with instructions and examples
   */
  private buildSystemPrompt(): string {
    return `You are an expert resume parser. Your task is to extract structured information from resume text.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON, no additional text or explanations
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- If a date is not specified, use null
- For current positions, use null for end date
- Extract all information accurately without making assumptions
- Provide confidence scores (0.0 to 1.0) for each extraction
- Generate unique IDs using format: type-timestamp-random (e.g., "job-1234567890-abc")

SECTION DETECTION STRATEGY:
- First, scan the resume for ALL section headers (case-insensitive)
- Common headers: Experience, Work History, Employment, Education, Skills, Certifications, Projects, Publications, Awards, Volunteer, Languages, etc.
- Look for variations: "Professional Experience", "Work Experience", "Technical Skills", "Core Competencies", etc.
- Extract content under each detected section
- Infer content type from section header and content structure
- If a section doesn't fit standard categories, include it in the most relevant category or as a skill/accomplishment

JOB DESCRIPTION EXTRACTION:
- CRITICAL: Many resumes have an unlabeled paragraph or sentence describing the role immediately after the job title
- This description appears BEFORE the bullet points of accomplishments
- Extract this as the FIRST accomplishment with tags ["accomplishment", "job-description", ...other relevant tags]
- Example format:
  "Senior Engineer at Company (2020-2023)
   Led the development team responsible for cloud infrastructure and DevOps practices.
   - Reduced deployment time by 50%
   - Implemented CI/CD pipeline"
- The paragraph "Led the development team..." should be extracted as an accomplishment with tags ["accomplishment", "job-description", "leadership", "cloud"]

COMPREHENSIVE EXTRACTION:
- Extract ALL job entries, even if formatting varies
- Extract job descriptions (unlabeled paragraphs after job title, before bullet points)
- Extract ALL skills mentioned anywhere in the resume (technical, soft skills, languages, tools)
- Extract ALL accomplishments (bullet points, achievements, metrics)
- Extract ALL education entries (degrees, bootcamps, online courses)
- Extract ALL certifications (professional, technical, industry-specific)
- Look for less common sections: Publications, Patents, Speaking Engagements, Volunteer Work, Awards, Projects
- Tag accomplishments and skills with relevant keywords from their content

JSON SCHEMA:
{
  "jobEntries": [
    {
      "id": "string",
      "title": "string",
      "company": "string",
      "location": { "city": "string?", "state": "string?", "country": "string?" } | null,
      "duration": { "start": "string (ISO date)", "end": "string? (ISO date or null)" },
      "accomplishments": [
        {
          "id": "string",
          "description": "string",
          "parentJobId": "string",
          "dateRange": { "start": "string?", "end": "string?" } | null,
          "tags": ["string"] // ALWAYS start with "accomplishment", then add relevant keywords: "leadership", "performance", "technical", etc.
        }
      ],
      "skills": [
        {
          "id": "string",
          "name": "string",
          "proficiency": "string?",
          "parentJobId": "string",
          "tags": ["string"] // ALWAYS start with "skill", then add categories: "programming-language", "framework", "tool", "soft-skill"
        }
      ],
      "confidence": 0.0-1.0
    }
  ],
  "education": [
    {
      "id": "string",
      "degree": "string",
      "institution": "string",
      "location": { "city": "string?", "state": "string?", "country": "string?" } | null,
      "dateRange": { "start": "string", "end": "string?" },
      "tags": ["string"] // ALWAYS start with "education", then add field tags: "computer-science", "mba", "bootcamp"
    }
  ],
  "certifications": [
    {
      "id": "string",
      "name": "string",
      "issuer": "string",
      "dateIssued": "string",
      "expirationDate": "string?",
      "tags": ["string"] // ALWAYS start with "certification", then add provider tags: "aws", "google-cloud", "professional", "technical"
    }
  ],
  "skills": [
    {
      "id": "string",
      "name": "string",
      "proficiency": "string?",
      "tags": ["string"] // ALWAYS start with "skill", then categorize: "programming", "language", "tool", "framework", "soft-skill"
    }
  ]
}

TAGGING GUIDELINES:
- For accomplishments: ALWAYS include "accomplishment" as the first tag, then add descriptive tags like "leadership", "performance", "cost-reduction", "team-building", "technical", "process-improvement"
- For skills: ALWAYS include "skill" as the first tag, then categorize with additional tags like "programming-language", "framework", "tool", "database", "cloud", "soft-skill", "language", etc.
- For education: ALWAYS include "education" as the first tag, then add field of study tags like "computer-science", "business", "engineering"
- For certifications: ALWAYS include "certification" as the first tag, then add provider tags like "aws", "microsoft", "google", "cisco"
- Extract tags from the content itself - if an accomplishment mentions "led team of 5", add "leadership" tag

EXAMPLES:

Example 1 - Job Entry with Rich Tags and Job Description:
Input: "Senior Software Engineer at Google, Mountain View, CA (Jan 2020 - Present)
Led the development team responsible for cloud infrastructure serving millions of users.
- Led team of 5 engineers in developing cloud infrastructure
- Reduced API latency by 40% through caching optimization
- Implemented CI/CD pipeline using Jenkins and Docker"

Output:
{
  "jobEntries": [{
    "id": "job-1234567890-abc",
    "title": "Senior Software Engineer",
    "company": "Google",
    "location": { "city": "Mountain View", "state": "CA", "country": "USA" },
    "duration": { "start": "2020-01-01", "end": null },
    "accomplishments": [
      {
        "id": "accomplishment-1234567890-desc",
        "description": "Led the development team responsible for cloud infrastructure serving millions of users",
        "parentJobId": "job-1234567890-abc",
        "tags": ["accomplishment", "job-description", "leadership", "cloud", "infrastructure"]
      },
      {
        "id": "accomplishment-1234567890-xyz",
        "description": "Led team of 5 engineers in developing cloud infrastructure",
        "parentJobId": "job-1234567890-abc",
        "tags": ["accomplishment", "leadership", "team-management", "cloud", "infrastructure"]
      },
      {
        "id": "accomplishment-1234567891-xyz",
        "description": "Reduced API latency by 40% through caching optimization",
        "parentJobId": "job-1234567890-abc",
        "tags": ["accomplishment", "performance", "optimization", "technical"]
      },
      {
        "id": "accomplishment-1234567892-xyz",
        "description": "Implemented CI/CD pipeline using Jenkins and Docker",
        "parentJobId": "job-1234567890-abc",
        "tags": ["accomplishment", "devops", "automation", "technical"]
      }
    ],
    "skills": [
      {
        "id": "skill-1234567890-aaa",
        "name": "Jenkins",
        "parentJobId": "job-1234567890-abc",
        "tags": ["skill", "tool", "ci-cd", "devops"]
      },
      {
        "id": "skill-1234567890-bbb",
        "name": "Docker",
        "parentJobId": "job-1234567890-abc",
        "tags": ["skill", "tool", "containerization", "devops"]
      }
    ],
    "confidence": 0.95
  }]
}

Example 2 - Skills Section with Categories:
Input: "Technical Skills: Python, JavaScript, React, AWS, Docker
Languages: English (Native), Spanish (Fluent)
Soft Skills: Leadership, Communication, Problem Solving"

Output:
{
  "skills": [
    { "id": "skill-1", "name": "Python", "tags": ["skill", "programming-language", "backend"] },
    { "id": "skill-2", "name": "JavaScript", "tags": ["skill", "programming-language", "frontend"] },
    { "id": "skill-3", "name": "React", "tags": ["skill", "framework", "frontend"] },
    { "id": "skill-4", "name": "AWS", "tags": ["skill", "cloud", "platform"] },
    { "id": "skill-5", "name": "Docker", "tags": ["skill", "tool", "containerization"] },
    { "id": "skill-6", "name": "English", "proficiency": "Native", "tags": ["skill", "language"] },
    { "id": "skill-7", "name": "Spanish", "proficiency": "Fluent", "tags": ["skill", "language"] },
    { "id": "skill-8", "name": "Leadership", "tags": ["skill", "soft-skill"] },
    { "id": "skill-9", "name": "Communication", "tags": ["skill", "soft-skill"] },
    { "id": "skill-10", "name": "Problem Solving", "tags": ["skill", "soft-skill"] }
  ]
}

Example 3 - Less Common Sections:
Input: "Publications:
- 'Machine Learning in Production' - IEEE Conference 2022
Awards:
- Employee of the Year 2021
Volunteer:
- Code Mentor at Local Bootcamp (2020-Present)"

Output:
{
  "certifications": [
    {
      "id": "cert-1",
      "name": "Machine Learning in Production",
      "issuer": "IEEE Conference",
      "dateIssued": "2022-01-01",
      "tags": ["certification", "publication", "machine-learning", "research"]
    }
  ],
  "accomplishments": [
    {
      "id": "acc-1",
      "description": "Employee of the Year 2021",
      "tags": ["accomplishment", "award", "recognition"]
    },
    {
      "id": "acc-2",
      "description": "Code Mentor at Local Bootcamp",
      "dateRange": { "start": "2020-01-01", "end": null },
      "tags": ["accomplishment", "volunteer", "mentorship", "teaching"]
    }
  ]
}`;
  }

  /**
   * Build prompt for full resume parsing
   */
  private buildResumeParsingPrompt(text: string): string {
    return `Parse the following resume and extract all structured information. Return ONLY the JSON object, no additional text.

RESUME TEXT:
${text}

Return the complete JSON structure with all extracted information.`;
  }

  /**
   * Build prompt for job entry extraction
   */
  private buildJobExtractionPrompt(text: string): string {
    return `Extract all job entries from the following text. Return ONLY the JSON object with a "jobEntries" array.

TEXT:
${text}

Return JSON with jobEntries array.`;
  }

  /**
   * Build prompt for skill extraction
   */
  private buildSkillExtractionPrompt(text: string, context?: JobEntry): string {
    const contextInfo = context 
      ? `\n\nCONTEXT: These skills are from the job "${context.title}" at ${context.company}. Set parentJobId to "${context.id}".`
      : '';

    return `Extract all skills from the following text. Return ONLY the JSON object with a "skills" array.${contextInfo}

TEXT:
${text}

Return JSON with skills array.`;
  }

  /**
   * Build prompt for accomplishment extraction
   */
  private buildAccomplishmentExtractionPrompt(text: string, context?: JobEntry): string {
    const contextInfo = context 
      ? `\n\nCONTEXT: These accomplishments are from the job "${context.title}" at ${context.company}. Set parentJobId to "${context.id}".`
      : '';

    return `Extract all accomplishments and achievements from the following text. Return ONLY the JSON object with an "accomplishments" array.${contextInfo}

TEXT:
${text}

Return JSON with accomplishments array.`;
  }

  /**
   * Calculate confidence scores for parsed content
   */
  private calculateConfidence(parsed: any): ConfidenceScore {
    const sectionScores = new Map<string, number>();
    
    // Calculate confidence for each section
    if (parsed.jobEntries && parsed.jobEntries.length > 0) {
      const avgJobConfidence = parsed.jobEntries.reduce((sum: number, job: any) => 
        sum + (job.confidence || 0.8), 0) / parsed.jobEntries.length;
      sectionScores.set('jobEntries', avgJobConfidence);
    }
    
    if (parsed.education && parsed.education.length > 0) {
      sectionScores.set('education', 0.9);
    }
    
    if (parsed.certifications && parsed.certifications.length > 0) {
      sectionScores.set('certifications', 0.9);
    }
    
    if (parsed.skills && parsed.skills.length > 0) {
      sectionScores.set('skills', 0.85);
    }

    // Calculate overall confidence
    const scores = Array.from(sectionScores.values());
    const overall = scores.length > 0 
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length 
      : 0.5;

    return {
      overall,
      bySection: sectionScores
    };
  }

  /**
   * Generate warnings for low confidence sections
   */
  private generateWarnings(parsed: any, confidence: ConfidenceScore): ParsingWarning[] {
    const warnings: ParsingWarning[] = [];
    const LOW_CONFIDENCE_THRESHOLD = 0.7;

    confidence.bySection.forEach((score, section) => {
      if (score < LOW_CONFIDENCE_THRESHOLD) {
        warnings.push({
          section,
          message: `Low confidence in ${section} extraction (${(score * 100).toFixed(0)}%). Please review carefully.`,
          severity: score < 0.5 ? 'high' : 'medium'
        });
      }
    });

    // Check for missing sections
    if (!parsed.jobEntries || parsed.jobEntries.length === 0) {
      warnings.push({
        section: 'jobEntries',
        message: 'No job entries found. This may indicate parsing issues.',
        severity: 'high'
      });
    }

    return warnings;
  }
}

// Export class for instantiation
// Note: Singleton instance should be created with proper API key configuration
// Example: export const parserAgent = new ParserAgentImpl(process.env.ANTHROPIC_API_KEY);
export { ParserAgentImpl as ParserAgent };
