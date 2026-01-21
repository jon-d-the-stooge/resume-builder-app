/**
 * Resume Parser
 *
 * Parses resume text into hierarchical Vault structure.
 * Extracts structured data (sections, objects, items) with type-specific metadata.
 *
 * @see requirements.md - Requirements 3, 4, 5
 */

import {
  Vault,
  VaultSection,
  SectionObject,
  VaultItem,
  VaultProfile,
  VaultMetadata,
  SectionType,
  ExperienceMetadata,
  EducationMetadata,
  CertificationMetadata,
  ProjectMetadata,
  SkillsGroupMetadata,
  SectionObjectMetadata,
  VaultLocation,
  DateValue
} from '../types/vault';
import { LLMClient, LLMProvider, createLLMClientFromEnv } from '../shared/llm';
import { settingsStore } from './settingsStore';
import { ErrorHandler } from './errorHandler';

// ============================================================================
// Types
// ============================================================================

/**
 * Warning generated during parsing
 */
export interface ParseWarning {
  section: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Result of parsing a resume
 */
export interface ParseResult {
  vault: Vault;
  confidence: number;
  warnings: ParseWarning[];
  sourceFile?: string;
}

/**
 * Raw parsed data from LLM before conversion to Vault structure
 */
interface RawParsedData {
  profile?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: VaultLocation;
    links?: Array<{ type: string; url: string; label?: string }>;
    headline?: string;
  };
  jobEntries?: Array<{
    id: string;
    title: string;
    company: string;
    location?: VaultLocation;
    duration?: { start: string; end?: string };
    description?: string;
    employmentType?: string;
    accomplishments?: Array<{
      id: string;
      description: string;
      tags?: string[];
    }>;
    skills?: Array<{
      id: string;
      name: string;
      proficiency?: string;
      tags?: string[];
    }>;
    confidence?: number;
  }>;
  education?: Array<{
    id: string;
    degree: string;
    institution: string;
    location?: VaultLocation;
    dateRange?: { start: string; end?: string };
    gpa?: string;
    honors?: string;
    fieldOfStudy?: string;
    tags?: string[];
  }>;
  certifications?: Array<{
    id: string;
    name: string;
    issuer: string;
    dateIssued: string;
    expirationDate?: string;
    credentialId?: string;
    credentialUrl?: string;
    tags?: string[];
  }>;
  skills?: Array<{
    id: string;
    name: string;
    proficiency?: string;
    category?: string;
    tags?: string[];
  }>;
  projects?: Array<{
    id: string;
    name: string;
    role?: string;
    organization?: string;
    url?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    technologies?: string[];
    accomplishments?: Array<{
      id: string;
      description: string;
      tags?: string[];
    }>;
    tags?: string[];
  }>;
  summary?: string;
}

// ============================================================================
// Resume Parser Class
// ============================================================================

/**
 * ResumeParser - Converts resume text to hierarchical Vault structure
 *
 * Uses LLM to extract structured data and then converts to the
 * Section → Object → Item hierarchy defined in vault.ts
 */
export class ResumeParser {
  private client: LLMClient;

  constructor(apiKey?: string, model?: string, provider?: LLMProvider) {
    // Priority chain for API key configuration (same as ParserAgentImpl)
    if (apiKey) {
      this.client = new LLMClient({
        apiKey,
        provider: provider || 'anthropic',
        model: model || (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514')
      });
    } else if (settingsStore.isReady() && settingsStore.hasValidKey()) {
      const storedKey = settingsStore.getApiKey();
      const storedProvider = settingsStore.getProvider();
      const storedModel = settingsStore.getDefaultModel();

      this.client = new LLMClient({
        apiKey: storedKey,
        provider: storedProvider,
        model: storedModel || (storedProvider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514')
      });
    } else {
      try {
        this.client = createLLMClientFromEnv();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize LLM client';
        this.client = {
          complete: async () => {
            throw new Error(`LLM client not initialized: ${errorMessage}. Please configure your API key in Settings.`);
          },
          parseJsonResponse: () => {
            throw new Error(`LLM client not initialized: ${errorMessage}`);
          },
          clearCache: () => {},
          getCacheStats: () => ({ size: 0, maxEntries: 0, enabled: false }),
          getConfig: () => {
            throw new Error(`LLM client not initialized: ${errorMessage}`);
          }
        } as any;
      }
    }
  }

  /**
   * Parse resume text into a hierarchical Vault structure
   */
  async parseResume(text: string, sourceFile?: string): Promise<ParseResult> {
    return ErrorHandler.retry(
      async () => {
        try {
          // Extract structured data via LLM
          const rawData = await this.extractStructuredData(text);

          // Convert to Vault structure
          const vault = this.convertToVault(rawData, sourceFile);

          // Calculate confidence
          const confidence = this.calculateConfidence(rawData);

          // Generate warnings
          const warnings = this.generateWarnings(rawData, confidence);

          return {
            vault,
            confidence,
            warnings,
            sourceFile
          };
        } catch (error) {
          throw ErrorHandler.createParsingError(
            'Failed to parse resume into vault structure',
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
   * Extract structured data from resume text using LLM
   */
  private async extractStructuredData(text: string): Promise<RawParsedData> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Parse the following resume and extract all structured information. Return ONLY the JSON object, no additional text.

RESUME TEXT:
${text}

Return the complete JSON structure with all extracted information.`;

    const response = await this.client.complete({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    return this.client.parseJsonResponse(response.content);
  }

  /**
   * Convert raw parsed data to hierarchical Vault structure
   */
  private convertToVault(data: RawParsedData, sourceFile?: string): Vault {
    const now = new Date().toISOString();
    const vaultId = this.generateId('vault');

    // Build sections
    const sections: VaultSection[] = [];
    let sectionOrder = 0;

    // Add summary section if present
    if (data.summary) {
      sections.push(this.createSummarySection(vaultId, data.summary, sectionOrder++));
    }

    // Add experience section
    if (data.jobEntries && data.jobEntries.length > 0) {
      sections.push(this.createExperienceSection(vaultId, data.jobEntries, sectionOrder++));
    }

    // Add education section
    if (data.education && data.education.length > 0) {
      sections.push(this.createEducationSection(vaultId, data.education, sectionOrder++));
    }

    // Add skills section
    if (data.skills && data.skills.length > 0) {
      sections.push(this.createSkillsSection(vaultId, data.skills, sectionOrder++));
    }

    // Add certifications section
    if (data.certifications && data.certifications.length > 0) {
      sections.push(this.createCertificationsSection(vaultId, data.certifications, sectionOrder++));
    }

    // Add projects section
    if (data.projects && data.projects.length > 0) {
      sections.push(this.createProjectsSection(vaultId, data.projects, sectionOrder++));
    }

    // Build profile
    const profile = this.buildProfile(data.profile);

    return {
      id: vaultId,
      version: 1,
      profile,
      sections,
      metadata: {
        createdAt: now,
        updatedAt: now,
        sourceFile,
        parseConfidence: this.calculateConfidence(data)
      }
    };
  }

  /**
   * Build profile from parsed data
   */
  private buildProfile(profileData?: RawParsedData['profile']): VaultProfile {
    return {
      firstName: profileData?.firstName || '',
      lastName: profileData?.lastName || '',
      email: profileData?.email || null,
      phone: profileData?.phone || null,
      location: profileData?.location || null,
      links: (profileData?.links || []).map(link => ({
        type: this.normalizeProfileLinkType(link.type),
        url: link.url,
        label: link.label
      })),
      headline: profileData?.headline || null
    };
  }

  /**
   * Normalize profile link type to supported values
   */
  private normalizeProfileLinkType(type: string): 'linkedin' | 'github' | 'portfolio' | 'twitter' | 'other' {
    const normalized = type.toLowerCase();
    if (normalized.includes('linkedin')) return 'linkedin';
    if (normalized.includes('github')) return 'github';
    if (normalized.includes('portfolio') || normalized.includes('website')) return 'portfolio';
    if (normalized.includes('twitter') || normalized.includes('x.com')) return 'twitter';
    return 'other';
  }

  /**
   * Create experience section from job entries
   */
  private createExperienceSection(
    vaultId: string,
    jobEntries: NonNullable<RawParsedData['jobEntries']>,
    displayOrder: number
  ): VaultSection {
    const sectionId = this.generateId('section');

    const objects: SectionObject<ExperienceMetadata>[] = jobEntries.map((job, index) => {
      const objectId = job.id || this.generateId('object');

      // Convert accomplishments to items
      const items: VaultItem[] = (job.accomplishments || []).map((acc, accIndex) => ({
        id: acc.id || this.generateId('item'),
        objectId,
        content: acc.description,
        displayOrder: accIndex,
        tags: acc.tags
      }));

      // Create experience metadata with all structured fields
      const metadata: ExperienceMetadata = {
        type: 'experience',
        title: job.title,
        company: job.company,
        location: job.location || null,
        startDate: job.duration?.start || '',
        endDate: job.duration?.end || null,
        employmentType: this.normalizeEmploymentType(job.employmentType),
        description: job.description
      };

      return {
        id: objectId,
        sectionId,
        metadata,
        items,
        displayOrder: index,
        tags: this.extractJobTags(job)
      };
    });

    return {
      id: sectionId,
      vaultId,
      type: 'experience',
      label: 'Professional Experience',
      objects,
      displayOrder
    };
  }

  /**
   * Normalize employment type to supported values
   */
  private normalizeEmploymentType(type?: string): ExperienceMetadata['employmentType'] | undefined {
    if (!type) return undefined;
    const normalized = type.toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.includes('fulltime') || normalized === 'full') return 'full-time';
    if (normalized.includes('parttime') || normalized === 'part') return 'part-time';
    if (normalized.includes('contract')) return 'contract';
    if (normalized.includes('intern')) return 'internship';
    if (normalized.includes('freelance')) return 'freelance';
    return undefined;
  }

  /**
   * Extract tags from job entry
   */
  private extractJobTags(job: NonNullable<RawParsedData['jobEntries']>[0]): string[] {
    const tags: string[] = ['experience'];
    if (job.skills) {
      job.skills.forEach(skill => {
        if (skill.name) tags.push(skill.name.toLowerCase());
      });
    }
    return tags;
  }

  /**
   * Create education section
   */
  private createEducationSection(
    vaultId: string,
    education: NonNullable<RawParsedData['education']>,
    displayOrder: number
  ): VaultSection {
    const sectionId = this.generateId('section');

    const objects: SectionObject<EducationMetadata>[] = education.map((edu, index) => {
      const objectId = edu.id || this.generateId('object');

      const metadata: EducationMetadata = {
        type: 'education',
        degree: edu.degree,
        institution: edu.institution,
        location: edu.location || null,
        startDate: edu.dateRange?.start || null,
        endDate: edu.dateRange?.end || null,
        gpa: edu.gpa,
        honors: edu.honors,
        fieldOfStudy: edu.fieldOfStudy
      };

      return {
        id: objectId,
        sectionId,
        metadata,
        items: [], // Education typically doesn't have bullet items
        displayOrder: index,
        tags: edu.tags
      };
    });

    return {
      id: sectionId,
      vaultId,
      type: 'education',
      label: 'Education',
      objects,
      displayOrder
    };
  }

  /**
   * Create skills section - groups skills by category
   */
  private createSkillsSection(
    vaultId: string,
    skills: NonNullable<RawParsedData['skills']>,
    displayOrder: number
  ): VaultSection {
    const sectionId = this.generateId('section');

    // Group skills by category
    const skillsByCategory = new Map<string, typeof skills>();
    skills.forEach(skill => {
      const category = skill.category || 'General';
      if (!skillsByCategory.has(category)) {
        skillsByCategory.set(category, []);
      }
      skillsByCategory.get(category)!.push(skill);
    });

    const objects: SectionObject<SkillsGroupMetadata>[] = [];
    let objectOrder = 0;

    skillsByCategory.forEach((categorySkills, category) => {
      const objectId = this.generateId('object');

      const metadata: SkillsGroupMetadata = {
        type: 'skills-group',
        category
      };

      // Convert skills to items
      const items: VaultItem[] = categorySkills.map((skill, index) => ({
        id: skill.id || this.generateId('item'),
        objectId,
        content: skill.proficiency ? `${skill.name} (${skill.proficiency})` : skill.name,
        displayOrder: index,
        tags: skill.tags
      }));

      objects.push({
        id: objectId,
        sectionId,
        metadata,
        items,
        displayOrder: objectOrder++,
        tags: [category.toLowerCase()]
      });
    });

    return {
      id: sectionId,
      vaultId,
      type: 'skills',
      label: 'Skills',
      objects,
      displayOrder
    };
  }

  /**
   * Create certifications section
   */
  private createCertificationsSection(
    vaultId: string,
    certifications: NonNullable<RawParsedData['certifications']>,
    displayOrder: number
  ): VaultSection {
    const sectionId = this.generateId('section');

    const objects: SectionObject<CertificationMetadata>[] = certifications.map((cert, index) => {
      const objectId = cert.id || this.generateId('object');

      const metadata: CertificationMetadata = {
        type: 'certification',
        name: cert.name,
        issuer: cert.issuer,
        issueDate: cert.dateIssued,
        expirationDate: cert.expirationDate || null,
        credentialId: cert.credentialId,
        credentialUrl: cert.credentialUrl
      };

      return {
        id: objectId,
        sectionId,
        metadata,
        items: [],
        displayOrder: index,
        tags: cert.tags
      };
    });

    return {
      id: sectionId,
      vaultId,
      type: 'certifications',
      label: 'Certifications',
      objects,
      displayOrder
    };
  }

  /**
   * Create projects section
   */
  private createProjectsSection(
    vaultId: string,
    projects: NonNullable<RawParsedData['projects']>,
    displayOrder: number
  ): VaultSection {
    const sectionId = this.generateId('section');

    const objects: SectionObject<ProjectMetadata>[] = projects.map((project, index) => {
      const objectId = project.id || this.generateId('object');

      // Convert accomplishments to items
      const items: VaultItem[] = (project.accomplishments || []).map((acc, accIndex) => ({
        id: acc.id || this.generateId('item'),
        objectId,
        content: acc.description,
        displayOrder: accIndex,
        tags: acc.tags
      }));

      // Add description as first item if present
      if (project.description && items.length === 0) {
        items.unshift({
          id: this.generateId('item'),
          objectId,
          content: project.description,
          displayOrder: 0,
          tags: ['description']
        });
      }

      const metadata: ProjectMetadata = {
        type: 'project',
        name: project.name,
        role: project.role,
        organization: project.organization,
        url: project.url,
        startDate: project.startDate || null,
        endDate: project.endDate || null,
        technologies: project.technologies
      };

      return {
        id: objectId,
        sectionId,
        metadata,
        items,
        displayOrder: index,
        tags: project.tags
      };
    });

    return {
      id: sectionId,
      vaultId,
      type: 'projects',
      label: 'Projects',
      objects,
      displayOrder
    };
  }

  /**
   * Create summary section
   */
  private createSummarySection(
    vaultId: string,
    summary: string,
    displayOrder: number
  ): VaultSection {
    const sectionId = this.generateId('section');
    const objectId = this.generateId('object');

    const objects: SectionObject[] = [{
      id: objectId,
      sectionId,
      metadata: {
        type: 'summary',
        title: 'Professional Summary'
      },
      items: [{
        id: this.generateId('item'),
        objectId,
        content: summary,
        displayOrder: 0
      }],
      displayOrder: 0
    }];

    return {
      id: sectionId,
      vaultId,
      type: 'summary',
      label: 'Professional Summary',
      objects,
      displayOrder
    };
  }

  /**
   * Calculate confidence score for parsed data
   */
  private calculateConfidence(data: RawParsedData): number {
    let totalScore = 0;
    let sectionCount = 0;

    // Score job entries
    if (data.jobEntries && data.jobEntries.length > 0) {
      const jobScores = data.jobEntries.map(job => {
        let score = 0.5; // Base score
        if (job.title) score += 0.1;
        if (job.company) score += 0.1;
        if (job.duration?.start) score += 0.1;
        if (job.accomplishments && job.accomplishments.length > 0) score += 0.2;
        return Math.min(score, 1.0);
      });
      totalScore += jobScores.reduce((a, b) => a + b, 0) / jobScores.length;
      sectionCount++;
    }

    // Score education
    if (data.education && data.education.length > 0) {
      totalScore += 0.9;
      sectionCount++;
    }

    // Score skills
    if (data.skills && data.skills.length > 0) {
      totalScore += 0.85;
      sectionCount++;
    }

    // Score certifications
    if (data.certifications && data.certifications.length > 0) {
      totalScore += 0.9;
      sectionCount++;
    }

    return sectionCount > 0 ? totalScore / sectionCount : 0.5;
  }

  /**
   * Generate warnings for parsing issues
   */
  private generateWarnings(data: RawParsedData, confidence: number): ParseWarning[] {
    const warnings: ParseWarning[] = [];

    if (!data.jobEntries || data.jobEntries.length === 0) {
      warnings.push({
        section: 'experience',
        message: 'No job entries found. This may indicate parsing issues.',
        severity: 'high'
      });
    }

    if (confidence < 0.7) {
      warnings.push({
        section: 'overall',
        message: `Low overall confidence (${(confidence * 100).toFixed(0)}%). Please review carefully.`,
        severity: 'medium'
      });
    }

    // Check for jobs without accomplishments
    data.jobEntries?.forEach(job => {
      if (!job.accomplishments || job.accomplishments.length === 0) {
        warnings.push({
          section: 'experience',
          message: `Job "${job.title} at ${job.company}" has no accomplishments extracted.`,
          severity: 'low'
        });
      }
    });

    return warnings;
  }

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Build system prompt for LLM parsing
   */
  private buildSystemPrompt(): string {
    return `You are an expert resume parser. Your task is to extract structured information from resume text into a hierarchical format.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON, no additional text or explanations
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- If a date is not specified, use null
- For current positions, use null for end date
- Extract all information accurately without making assumptions
- Generate unique IDs using format: type-timestamp-random (e.g., "job-1234567890-abc")

PROFILE EXTRACTION:
- Extract contact information from the header area
- Look for name, email, phone, location, LinkedIn, GitHub, portfolio links
- The headline is usually a brief professional summary or title

SECTION DETECTION STRATEGY:
- First, scan the resume for ALL section headers (case-insensitive)
- Common headers: Experience, Work History, Employment, Education, Skills, Certifications, Projects, Publications
- Look for variations: "Professional Experience", "Work Experience", "Technical Skills", "Core Competencies"

INFERENCE RULES FOR UNLABELED DATA:
When data is not explicitly labeled, infer from context:

    LOCATION:
    - City/state/country names adjacent to company names are locations
    - "Goldman Sachs, New York" → location: {city: "New York", state: "NY"}
    - "Remote" or "Hybrid" are valid location values
    - If only a country or state abbreviation appears, still capture it

    DATES:
    - Date patterns near job titles are employment dates, even without labels
    - Formats to recognize: "2019-2022", "Jan 2019 - Present", "2019 to current", "Since 2020"
    - "Present", "Current", "Now", or missing end date = ongoing (end: null)

    EMPLOYMENT TYPE:
    - Infer from context clues: "contractor", "consulting", "freelance project", "internship program"
    - Default to "full-time" if no indicators present

    TITLE VS COMPANY:
    - Title typically precedes "at" or appears above company on its own line
    - Company names are usually organizations (Inc, LLC, Corp) or well-known entities
    - "Senior Engineer at Google" → title: "Senior Engineer", company: "Google"

    When you infer a value, still include it in the output. The goal is complete extraction, not just explicit labels.

JOB ENTRY EXTRACTION (CRITICAL):
For each job, extract ALL of these fields:
- title: The job title (e.g., "Senior Software Engineer")
- company: The company name (e.g., "Google")
- location: City, state, country if provided
- duration: Start and end dates in ISO format
- description: Any summary paragraph about the role (appears before bullets)
- employmentType: full-time, part-time, contract, internship, freelance
- accomplishments: ALL bullet points as individual items with their own IDs and tags
- skills: Technical skills mentioned specifically in this job context

JSON SCHEMA:
{
  "profile": {
    "firstName": "string",
    "lastName": "string",
    "email": "string?",
    "phone": "string?",
    "location": { "city": "string?", "state": "string?", "country": "string?" },
    "links": [{ "type": "linkedin|github|portfolio|other", "url": "string", "label": "string?" }],
    "headline": "string?"
  },
  "summary": "string?",
  "jobEntries": [
    {
      "id": "string",
      "title": "string (REQUIRED)",
      "company": "string (REQUIRED)",
      "location": { "city": "string?", "state": "string?", "country": "string?" },
      "duration": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD or null" },
      "description": "string? (summary paragraph before bullets)",
      "employmentType": "full-time|part-time|contract|internship|freelance",
      "accomplishments": [
        {
          "id": "string",
          "description": "string",
          "tags": ["accomplishment", "...relevant tags"]
        }
      ],
      "skills": [
        {
          "id": "string",
          "name": "string",
          "proficiency": "string?",
          "tags": ["skill", "...category tags"]
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
      "location": { "city": "string?", "state": "string?", "country": "string?" },
      "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD?" },
      "gpa": "string?",
      "honors": "string?",
      "fieldOfStudy": "string?",
      "tags": ["education", "...field tags"]
    }
  ],
  "certifications": [
    {
      "id": "string",
      "name": "string",
      "issuer": "string",
      "dateIssued": "YYYY-MM-DD",
      "expirationDate": "YYYY-MM-DD?",
      "credentialId": "string?",
      "credentialUrl": "string?",
      "tags": ["certification", "...provider tags"]
    }
  ],
  "skills": [
    {
      "id": "string",
      "name": "string",
      "proficiency": "string?",
      "category": "string? (e.g., Programming Languages, Frameworks, Tools)",
      "tags": ["skill", "...category tags"]
    }
  ],
  "projects": [
    {
      "id": "string",
      "name": "string",
      "role": "string?",
      "organization": "string?",
      "url": "string?",
      "startDate": "YYYY-MM-DD?",
      "endDate": "YYYY-MM-DD?",
      "description": "string?",
      "technologies": ["string"],
      "accomplishments": [
        {
          "id": "string",
          "description": "string",
          "tags": ["accomplishment", "...tags"]
        }
      ],
      "tags": ["project", "...tags"]
    }
  ]
}

IMPORTANT: For job entries, title and company are REQUIRED fields. Always extract them even if formatting varies.`;
  }

  /**
   * Clear the LLM cache
   */
  clearCache(): void {
    this.client.clearCache();
  }
}
