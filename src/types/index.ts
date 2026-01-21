// ============================================================================
// Enums
// ============================================================================

/**
 * @deprecated Import from 'src/shared/obsidian/types' instead
 */
export { ContentType } from '../shared/obsidian/types';

export enum FileFormat {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt'
}

// ============================================================================
// Basic Types
// ============================================================================

/**
 * @deprecated Import from 'src/shared/types/common' instead
 */
export { DateRange, Location, ContentMetadata } from '../shared/types/common';

// ============================================================================
// Content Items
// ============================================================================

export interface ContentItemInput {
  type: import('../shared/obsidian/types').ContentType;
  content: string;
  tags: string[];
  metadata: import('../shared/types/common').ContentMetadata;
  parentId?: string;
}

export interface ContentItem extends ContentItemInput {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  filePath: string;
}

export interface Skill {
  id: string;
  name: string;
  proficiency?: string;
  parentJobId?: string;
  tags: string[];
}

export interface Accomplishment {
  id: string;
  description: string;
  parentJobId: string;
  dateRange?: import('../shared/types/common').DateRange;
  tags: string[];
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  location?: import('../shared/types/common').Location;
  dateRange: import('../shared/types/common').DateRange;
  tags: string[];
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  dateIssued: string;
  expirationDate?: string;
  tags: string[];
}

// ============================================================================
// Job Entry
// ============================================================================

export interface JobEntry {
  id: string;
  title: string;
  company: string;
  location: import('../shared/types/common').Location;
  duration: import('../shared/types/common').DateRange;
  accomplishments: Accomplishment[];
  skills: Skill[];
  confidence: number;
}

// ============================================================================
// Parsing Types
// ============================================================================

export interface ConfidenceScore {
  overall: number;
  bySection: Map<string, number>;
}

export interface ParsingWarning {
  section: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ParsedResume {
  jobEntries: JobEntry[];
  education: Education[];
  certifications: Certification[];
  skills: Skill[];
  confidence: ConfidenceScore;
  warnings: ParsingWarning[];
}

// ============================================================================
// File Handling Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
  fileSize: number;
  format: FileFormat;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchQuery {
  tags?: string[];
  text?: string;
  dateRange?: import('../shared/types/common').DateRange;
  contentType?: import('../shared/obsidian/types').ContentType;
}

// ============================================================================
// Obsidian MCP Types (Re-exported from shared)
// ============================================================================

/**
 * @deprecated Import from 'src/shared/obsidian/types' instead
 */
export {
  Frontmatter,
  NoteContent,
  ObsidianQuery,
  NoteSearchResult
} from '../shared/obsidian/types';

// ============================================================================
// Component Interfaces
// ============================================================================

export interface FileHandler {
  validateFile(file: File): ValidationResult;
  extractText(file: File): Promise<string>;
  getSupportedFormats(): string[];
}

export interface ParserAgent {
  parseResume(text: string): Promise<ParsedResume>;
  extractJobEntries(text: string): Promise<JobEntry[]>;
  extractSkills(text: string, context?: JobEntry): Promise<Skill[]>;
  extractAccomplishments(text: string, context?: JobEntry): Promise<Accomplishment[]>;
}

export interface ContentManager {
  createContentItem(item: ContentItemInput): Promise<ContentItem>;
  updateContentItem(id: string, updates: Partial<ContentItem>): Promise<ContentItem>;
  deleteContentItem(id: string): Promise<void>;
  linkContentItems(parentId: string, childId: string): Promise<void>;
  linkSkillToMultipleJobs(skillId: string, jobIds: string[]): Promise<void>;
  searchContentItems(query: SearchQuery): Promise<ContentItem[]>;
  detectDuplicates(item: ContentItemInput): Promise<ContentItem[]>;
  getContentItemById(id: string): Promise<ContentItem | null>;
}

/**
 * @deprecated Import from 'src/shared/obsidian/client' instead
 */
export { ObsidianMCPClient } from '../shared/obsidian/client';

// ============================================================================
// Vault Types (Hierarchical Structure)
// ============================================================================

export * from './vault';
