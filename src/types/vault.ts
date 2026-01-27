/**
 * Vault Types
 *
 * Hierarchical type definitions for structured resume storage.
 * Implements Section → Object → Item containment hierarchy where
 * context flows implicitly through inheritance.
 *
 * @see requirements.md - Requirements 3, 4, 5
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Date value supporting ISO dates and special values
 */
export type DateValue = string; // ISO 8601 format (YYYY-MM-DD)

/**
 * Location with optional components
 */
export interface VaultLocation {
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Profile link (LinkedIn, GitHub, portfolio, etc.)
 */
export interface ProfileLink {
  type: 'linkedin' | 'github' | 'portfolio' | 'twitter' | 'other';
  url: string;
  label?: string;
}

// ============================================================================
// Section Types - The container classification
// ============================================================================

/**
 * Section types supported in the vault
 * Each section type has specific object metadata requirements
 */
export type SectionType =
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'publications'
  | 'awards'
  | 'volunteer'
  | 'languages'
  | 'summary';

// ============================================================================
// Type-Specific Metadata (Discriminated Union)
// ============================================================================

/**
 * Experience/job metadata - captures title, company, dates
 * Per Requirement 4: "WHEN an experience object is created THEN the system
 * SHALL capture: title, company, location, start date, end date"
 */
export interface ExperienceMetadata {
  type: 'experience';
  title: string;
  company: string;
  location: VaultLocation | null;
  startDate: DateValue;
  endDate: DateValue | null; // null = present/current
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance';
  department?: string;
  description?: string; // Role summary/description
}

/**
 * Education metadata - captures degree, institution, dates
 */
export interface EducationMetadata {
  type: 'education';
  degree: string;
  institution: string;
  location: VaultLocation | null;
  startDate: DateValue | null;
  endDate: DateValue | null;
  gpa?: string;
  honors?: string;
  fieldOfStudy?: string;
}

/**
 * Project metadata - captures project details
 */
export interface ProjectMetadata {
  type: 'project';
  name: string;
  role?: string;
  organization?: string;
  url?: string;
  startDate: DateValue | null;
  endDate: DateValue | null;
  technologies?: string[];
}

/**
 * Certification metadata - captures credential details
 */
export interface CertificationMetadata {
  type: 'certification';
  name: string;
  issuer: string;
  issueDate: DateValue;
  expirationDate: DateValue | null;
  credentialId?: string;
  credentialUrl?: string;
}

/**
 * Publication metadata - captures publication details
 */
export interface PublicationMetadata {
  type: 'publication';
  title: string;
  publisher: string;
  publicationDate: DateValue;
  url?: string;
  coAuthors?: string[];
}

/**
 * Award metadata - captures recognition details
 */
export interface AwardMetadata {
  type: 'award';
  title: string;
  issuer: string;
  date: DateValue;
  description?: string;
}

/**
 * Volunteer metadata - captures volunteer experience
 */
export interface VolunteerMetadata {
  type: 'volunteer';
  role: string;
  organization: string;
  location: VaultLocation | null;
  startDate: DateValue | null;
  endDate: DateValue | null;
}

/**
 * Language metadata - captures language proficiency
 */
export interface LanguageMetadata {
  type: 'language';
  language: string;
  proficiency: 'native' | 'fluent' | 'advanced' | 'intermediate' | 'beginner';
}

/**
 * Skills group metadata - for grouped skills (e.g., "Programming Languages")
 */
export interface SkillsGroupMetadata {
  type: 'skills-group';
  category: string;
  proficiencyLevel?: string;
}

/**
 * Summary metadata - for professional summary/objective
 */
export interface SummaryMetadata {
  type: 'summary';
  title?: string; // e.g., "Professional Summary", "Objective"
}

/**
 * Union of all object metadata types
 * Used for discriminated union pattern
 */
export type SectionObjectMetadata =
  | ExperienceMetadata
  | EducationMetadata
  | ProjectMetadata
  | CertificationMetadata
  | PublicationMetadata
  | AwardMetadata
  | VolunteerMetadata
  | LanguageMetadata
  | SkillsGroupMetadata
  | SummaryMetadata;

// ============================================================================
// Core Hierarchical Structure
// ============================================================================

/**
 * Item - The leaf node (accomplishment, bullet point, skill)
 * Per Requirement 5: "WHEN parsing content within an Object THEN the system
 * SHALL create individual Items for each bullet point"
 */
export interface VaultItem {
  id: string;
  objectId: string; // Parent reference
  content: string;
  displayOrder: number;
  tags?: string[];
  metrics?: ItemMetrics;
}

/**
 * Metrics that can be extracted from accomplishment items
 */
export interface ItemMetrics {
  quantified?: boolean; // Has numbers/percentages
  value?: string; // The metric value (e.g., "40%", "$2M")
  metricType?: 'percentage' | 'currency' | 'count' | 'time' | 'other';
}

/**
 * SectionObject - Container for items within a section (job, degree, project)
 * Per Requirement 5: "WHEN parsing an Experience section THEN the system SHALL
 * create distinct Objects for each entity (each job, each degree)"
 */
export interface SectionObject<T extends SectionObjectMetadata = SectionObjectMetadata> {
  id: string;
  sectionId: string; // Parent reference
  metadata: T;
  items: VaultItem[];
  displayOrder: number;
  tags?: string[];
}

/**
 * Section - Top-level container for objects of a specific type
 * Per Requirement 3: "career content organized in a hierarchical structure
 * (Sections → Objects → Items)"
 */
export interface VaultSection {
  id: string;
  vaultId: string; // Parent reference
  type: SectionType;
  label: string; // Display label (e.g., "Professional Experience")
  objects: SectionObject[];
  displayOrder: number;
}

/**
 * Profile - Contact and identity information
 */
export interface VaultProfile {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  location: VaultLocation | null;
  links: ProfileLink[];
  headline: string | null;
}

/**
 * Vault metadata - tracking and versioning
 */
export interface VaultMetadata {
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  sourceFile?: string; // Original resume filename
  parseConfidence?: number; // 0.0-1.0
  lastOptimizedAt?: string;
  ownerId?: string; // User who owns this vault (for multi-user support)
}

/**
 * Vault - Root container for all career content
 * This is the top-level entity that contains all sections
 */
export interface Vault {
  id: string;
  version: number;
  profile: VaultProfile;
  sections: VaultSection[];
  metadata: VaultMetadata;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for ExperienceMetadata
 */
export function isExperienceMetadata(metadata: SectionObjectMetadata): metadata is ExperienceMetadata {
  return metadata.type === 'experience';
}

/**
 * Type guard for EducationMetadata
 */
export function isEducationMetadata(metadata: SectionObjectMetadata): metadata is EducationMetadata {
  return metadata.type === 'education';
}

/**
 * Type guard for ProjectMetadata
 */
export function isProjectMetadata(metadata: SectionObjectMetadata): metadata is ProjectMetadata {
  return metadata.type === 'project';
}

/**
 * Type guard for CertificationMetadata
 */
export function isCertificationMetadata(metadata: SectionObjectMetadata): metadata is CertificationMetadata {
  return metadata.type === 'certification';
}

/**
 * Type guard for checking if an object is an experience object
 */
export function isExperienceObject(obj: SectionObject): obj is SectionObject<ExperienceMetadata> {
  return obj.metadata.type === 'experience';
}

/**
 * Type guard for checking if an object is an education object
 */
export function isEducationObject(obj: SectionObject): obj is SectionObject<EducationMetadata> {
  return obj.metadata.type === 'education';
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type for creating a new item (without generated fields)
 */
export type NewVaultItem = Omit<VaultItem, 'id'>;

/**
 * Type for creating a new object (without generated fields)
 */
export type NewSectionObject<T extends SectionObjectMetadata = SectionObjectMetadata> =
  Omit<SectionObject<T>, 'id' | 'items'> & { items?: NewVaultItem[] };

/**
 * Type for creating a new section (without generated fields)
 */
export type NewVaultSection = Omit<VaultSection, 'id' | 'objects'> & {
  objects?: NewSectionObject[]
};

/**
 * Type for creating a new vault (without generated fields)
 */
export type NewVault = Omit<Vault, 'id' | 'version' | 'metadata' | 'sections'> & {
  sections?: NewVaultSection[];
  metadata?: Partial<VaultMetadata>;
};

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query options for searching vault content
 */
export interface VaultQuery {
  sectionTypes?: SectionType[];
  tags?: string[];
  dateRange?: {
    start: DateValue;
    end?: DateValue;
  };
  searchText?: string;
  includeItems?: boolean;
}

/**
 * Result of a vault query with context preserved
 */
export interface VaultQueryResult {
  section: VaultSection;
  object: SectionObject;
  items?: VaultItem[];
}

// ============================================================================
// Conversion Types (for migration from ContentItem)
// ============================================================================

/**
 * Mapping from old ContentType to new section/object types
 */
export const CONTENT_TYPE_TO_SECTION: Record<string, SectionType> = {
  'job-entry': 'experience',
  'accomplishment': 'experience', // Items within experience objects
  'skill': 'skills',
  'education': 'education',
  'certification': 'certifications'
};
