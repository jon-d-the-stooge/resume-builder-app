# Resume Vault & Optimization Schema Specification

## Overview

This document defines the data architecture for a resume optimization system with two distinct data stores:

1. **Vault** - Permanent, complete repository of all career content (source of truth)
2. **Optimization Outputs** - Per-job artifacts containing optimization decisions and generated resumes

The vault is never mutated by optimization. Each optimization reads from the vault and produces a standalone output artifact.

---

## Part 1: Vault Schema

### Design Principles

- **Complete**: Contains ALL career content, nothing filtered
- **Immutable during optimization**: Optimizations read, never write
- **Hierarchical**: Structure provides implicit context through inheritance
- **Normalized**: No duplication; references where appropriate

### Hierarchy Model

```
Applicant (root)
│
├── Profile
│   └── name, email, phone, location, links, etc.
│
├── Sections[]
│   │
│   ├── Section: "experience"
│   │   ├── Objects[] (jobs)
│   │   │   ├── Object: Job 1
│   │   │   │   ├── metadata (title, company, location, dates)
│   │   │   │   └── Items[] (accomplishments/responsibilities)
│   │   │   │       ├── Item: "Led a team of 4 data scientists..."
│   │   │   │       ├── Item: "Collaborate with key stakeholders..."
│   │   │   │       └── Item: "Manage all day-to-day..."
│   │   │   │
│   │   │   └── Object: Job 2
│   │   │       ├── metadata
│   │   │       └── Items[]
│   │   │
│   ├── Section: "education"
│   │   └── Objects[] (degrees/institutions)
│   │       └── Object: Degree 1
│   │           ├── metadata (degree, institution, dates)
│   │           └── Items[] (honors, coursework, thesis)
│   │
│   ├── Section: "skills"
│   │   └── Objects[] (categories) OR Items[] (flat list)
│   │
│   └── Section: "summary"
│       └── content (text block, no objects/items)
│
└── Meta
    └── created_at, updated_at, source_files[], etc.
```

### TypeScript Definitions

```typescript
/**
 * Root container for all applicant data
 */
interface Vault {
  id: string;
  version: number;
  profile: Profile;
  sections: Section[];
  meta: VaultMeta;
}

/**
 * Applicant identity and contact information
 */
interface Profile {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  location: Location | null;
  links: Link[];
  headline: string | null;  // e.g., "Senior Data Scientist"
}

interface Location {
  city: string | null;
  state: string | null;
  country: string | null;
}

interface Link {
  type: 'linkedin' | 'github' | 'portfolio' | 'other';
  url: string;
  label?: string;
}

/**
 * A major resume section (Experience, Education, Skills, etc.)
 */
interface Section {
  id: string;
  type: SectionType;
  label: string;           // Display name, e.g., "Professional Experience"
  objects: SectionObject[];
  content?: string;        // For sections like Summary that are just text
  order: number;           // Display order in resume
}

type SectionType = 
  | 'experience' 
  | 'education' 
  | 'skills' 
  | 'summary' 
  | 'certifications'
  | 'projects'
  | 'publications'
  | 'volunteer'
  | 'awards'
  | 'custom';

/**
 * An entity within a section (a job, a degree, a project, etc.)
 */
interface SectionObject {
  id: string;
  sectionId: string;       // Parent reference
  metadata: ObjectMetadata;
  items: Item[];
  order: number;           // Display order within section
}

/**
 * Metadata varies by section type
 */
type ObjectMetadata = 
  | ExperienceMetadata 
  | EducationMetadata 
  | ProjectMetadata
  | CertificationMetadata
  | GenericMetadata;

interface ExperienceMetadata {
  type: 'experience';
  title: string;
  company: string;
  location: Location | null;
  startDate: DateValue;
  endDate: DateValue | 'present';
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship';
}

interface EducationMetadata {
  type: 'education';
  degree: string;          // e.g., "Bachelor of Science"
  field: string;           // e.g., "Computer Science"
  institution: string;
  location: Location | null;
  startDate?: DateValue;
  endDate: DateValue;
  gpa?: string;
}

interface ProjectMetadata {
  type: 'project';
  name: string;
  role?: string;
  organization?: string;
  url?: string;
  startDate?: DateValue;
  endDate?: DateValue | 'present';
}

interface CertificationMetadata {
  type: 'certification';
  name: string;
  issuer: string;
  dateObtained: DateValue;
  expirationDate?: DateValue;
  credentialId?: string;
  url?: string;
}

interface GenericMetadata {
  type: 'generic';
  title: string;
  subtitle?: string;
  date?: DateValue;
  [key: string]: unknown;  // Flexible for custom sections
}

/**
 * Normalized date representation
 */
interface DateValue {
  year: number;
  month?: number;          // 1-12, optional for year-only dates
}

/**
 * Individual accomplishment, responsibility, skill, or detail
 */
interface Item {
  id: string;
  objectId: string;        // Parent reference
  content: string;         // The actual text
  order: number;           // Display order within object
  tags?: string[];         // Optional manual tags for search/filter
}

/**
 * Skills can be flat or categorized
 */
interface SkillsObject {
  id: string;
  sectionId: string;
  category: string | null; // null for flat/uncategorized
  skills: string[];        // List of skill names
  order: number;
}

/**
 * Vault metadata
 */
interface VaultMeta {
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
  sourceFiles: SourceFile[];
}

interface SourceFile {
  filename: string;
  uploadedAt: string;
  parseConfidence: number; // 0-1
}
```

### Parsing Rules

When parsing a resume into the vault:

1. **Identify sections** by headers (Experience, Education, Skills, etc.)
2. **Within Experience/Education**, each distinct entity becomes an Object
3. **Within an Object**, each bullet/line becomes an Item
4. **Preserve order** - capture the original sequence
5. **Normalize dates** to `{year, month}` format
6. **Store nulls** for missing data, don't omit fields
7. **Assign UUIDs** to all entities for stable references

### Example Vault Data

```json
{
  "id": "vault_abc123",
  "version": 1,
  "profile": {
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@email.com",
    "phone": "(555) 123-4567",
    "location": { "city": "New York", "state": "NY", "country": "USA" },
    "links": [
      { "type": "linkedin", "url": "https://linkedin.com/in/janesmith" },
      { "type": "github", "url": "https://github.com/janesmith" }
    ],
    "headline": "Analytics Manager"
  },
  "sections": [
    {
      "id": "sec_exp_001",
      "type": "experience",
      "label": "Professional Experience",
      "order": 1,
      "objects": [
        {
          "id": "obj_job_001",
          "sectionId": "sec_exp_001",
          "order": 1,
          "metadata": {
            "type": "experience",
            "title": "Analytics Manager",
            "company": "MRM",
            "location": { "city": "New York", "state": "NY", "country": null },
            "startDate": { "year": 2021, "month": 6 },
            "endDate": "present"
          },
          "items": [
            {
              "id": "item_001",
              "objectId": "obj_job_001",
              "order": 1,
              "content": "Led a team of 4 data scientists on a large scale end-to-end NLP project focusing on semantic analysis, sentiment scoring, and topic clustering for the purpose of audience segmentation"
            },
            {
              "id": "item_002",
              "objectId": "obj_job_001",
              "order": 2,
              "content": "Collaborate with key stakeholders on planning, design, and strategy related to marketing and business performance analysis"
            },
            {
              "id": "item_003",
              "objectId": "obj_job_001",
              "order": 3,
              "content": "Manage all day-to-day marketing analytics activities for a portfolio of clients totalling ~$3 Million in agency revenue"
            },
            {
              "id": "item_004",
              "objectId": "obj_job_001",
              "order": 4,
              "content": "Provide oversight and mentorship to direct reports"
            }
          ]
        }
      ]
    },
    {
      "id": "sec_skills_001",
      "type": "skills",
      "label": "Skills",
      "order": 3,
      "objects": []
    }
  ],
  "meta": {
    "createdAt": "2025-01-20T03:00:00Z",
    "updatedAt": "2025-01-20T03:00:00Z",
    "sourceFiles": [
      {
        "filename": "jane_smith_resume.pdf",
        "uploadedAt": "2025-01-20T03:00:00Z",
        "parseConfidence": 0.92
      }
    ]
  }
}
```

---

## Part 2: Optimization Output Schema

### Design Principles

- **Self-contained**: Contains everything needed to understand and reproduce the optimization
- **References vault**: Links to source content by ID, doesn't duplicate
- **Stores decisions**: Which content included, excluded, modified
- **Immutable once created**: A snapshot of a specific optimization run

### Structure

```
OptimizationOutput
│
├── Job Info
│   └── title, company, url, description, parsed requirements
│
├── Decisions
│   ├── Included Objects (by ID)
│   ├── Excluded Objects (by ID + reason)
│   ├── Included Items (by ID)
│   ├── Excluded Items (by ID + reason)
│   └── Modified Items (original ID → new content)
│
├── Committee Output
│   ├── Advocate assessment
│   ├── Critic assessment  
│   └── Final scores
│
├── Generated Resume
│   └── Full text output (ready to render)
│
└── Meta
    └── timestamp, model versions, vault version used
```

### TypeScript Definitions

```typescript
/**
 * Complete record of an optimization run
 */
interface OptimizationOutput {
  id: string;
  vaultId: string;
  vaultVersion: number;    // Snapshot of vault version used
  job: JobInfo;
  decisions: OptimizationDecisions;
  committee: CommitteeOutput;
  result: OptimizationResult;
  meta: OptimizationMeta;
}

/**
 * Target job information
 */
interface JobInfo {
  title: string;
  company: string | null;
  url: string | null;
  description: string;     // Full job posting text
  parsedRequirements: ParsedRequirements;
}

interface ParsedRequirements {
  required: string[];      // Must-have qualifications
  preferred: string[];     // Nice-to-have qualifications
  skills: string[];        // Extracted skill keywords
  experience: string | null; // e.g., "5+ years"
  education: string | null;  // e.g., "Bachelor's degree required"
}

/**
 * What was included/excluded/modified
 */
interface OptimizationDecisions {
  includedObjects: IncludedObject[];
  excludedObjects: ExcludedObject[];
  includedItems: IncludedItem[];
  excludedItems: ExcludedItem[];
  modifiedItems: ModifiedItem[];
  sectionOrder: string[];  // Section IDs in final order
}

interface IncludedObject {
  objectId: string;
  reason: string;          // Why included
}

interface ExcludedObject {
  objectId: string;
  reason: string;          // Why excluded (e.g., "Too old, low relevance")
}

interface IncludedItem {
  itemId: string;
  objectId: string;        // Parent object
  reason: string;
}

interface ExcludedItem {
  itemId: string;
  objectId: string;
  reason: string;          // e.g., "Duplicate skill coverage", "Low ROI"
}

interface ModifiedItem {
  originalItemId: string;
  originalContent: string; // Preserved for diff/audit
  modifiedContent: string; // Optimized version
  modificationType: 'augmented' | 'tightened' | 'reframed';
  keywordsAdded: string[];
  rationale: string;
}

/**
 * Committee agent outputs (for audit/debugging)
 */
interface CommitteeOutput {
  advocate: AdvocateAssessment;
  critic: CriticAssessment;
  rounds: number;
  terminationReason: 'consensus' | 'target_reached' | 'max_rounds' | 'no_improvement';
}

interface AdvocateAssessment {
  fitScore: number;
  connections: ConnectionClaim[];
  strengths: string[];
  reframingOpportunities: ReframingOpportunity[];
}

interface CriticAssessment {
  fitScore: number;
  agreements: string[];
  challenges: Challenge[];
  validatedStrengths: string[];
  genuineGaps: GenuineGap[];
}

// (Existing types from committee agents...)
interface ConnectionClaim {
  jobRequirement: string;
  resumeEvidence: string;
  connectionStrength: 'strong' | 'moderate' | 'inferred' | 'transferable';
  confidence: number;
}

interface ReframingOpportunity {
  currentContent: string;
  suggestedReframe: string;
  jobRequirementAddressed: string;
  rationale: string;
}

interface Challenge {
  type: 'overclaim' | 'unsupported' | 'missing' | 'weak_evidence' | 'terminology_gap' | 'blandification';
  claim: string;
  issue: string;
  severity: 'critical' | 'major' | 'minor';
}

interface GenuineGap {
  requirement: string;
  reason: string;
  isRequired: boolean;
}

/**
 * Final output
 */
interface OptimizationResult {
  finalFitScore: number;
  resumeText: string;      // Complete formatted resume
  estimatedLength: '1 page' | '2 pages';
  keywordsIncluded: string[];
  specificityPreserved: string[];
  contentCut: ContentCutRecord[];
}

interface ContentCutRecord {
  itemId: string;
  originalContent: string;
  reason: string;
}

/**
 * Metadata
 */
interface OptimizationMeta {
  createdAt: string;
  advocateModel: string;   // e.g., "gpt-4o"
  criticModel: string;     // e.g., "claude-sonnet-4"
  writerModel: string;     // e.g., "claude-sonnet-4.5"
  durationMs: number;
  tokenUsage: {
    advocate: number;
    critic: number;
    writer: number;
    total: number;
  };
}
```

### Example Optimization Output

```json
{
  "id": "opt_xyz789",
  "vaultId": "vault_abc123",
  "vaultVersion": 1,
  "job": {
    "title": "Senior Data Scientist",
    "company": "Anthropic",
    "url": "https://job-boards.greenhouse.io/anthropic/jobs/123456",
    "description": "We're looking for a Senior Data Scientist to join...",
    "parsedRequirements": {
      "required": ["5+ years experience", "NLP expertise", "Python"],
      "preferred": ["Experience with LLMs", "Leadership experience"],
      "skills": ["Python", "NLP", "machine learning", "data analysis"],
      "experience": "5+ years",
      "education": "MS or PhD preferred"
    }
  },
  "decisions": {
    "includedObjects": [
      { "objectId": "obj_job_001", "reason": "Current role, highly relevant NLP experience" }
    ],
    "excludedObjects": [],
    "includedItems": [
      { "itemId": "item_001", "objectId": "obj_job_001", "reason": "Direct NLP match, leadership demonstrated" },
      { "itemId": "item_003", "objectId": "obj_job_001", "reason": "Scale/impact evidence with revenue metric" }
    ],
    "excludedItems": [
      { "itemId": "item_004", "objectId": "obj_job_001", "reason": "Generic, covered by item_001 leadership claim" }
    ],
    "modifiedItems": [
      {
        "originalItemId": "item_001",
        "originalContent": "Led a team of 4 data scientists on a large scale end-to-end NLP project focusing on semantic analysis, sentiment scoring, and topic clustering for the purpose of audience segmentation",
        "modifiedContent": "Led a team of 4 data scientists on a large-scale end-to-end NLP project applying machine learning techniques for semantic analysis, sentiment scoring, and topic clustering to drive audience segmentation",
        "modificationType": "augmented",
        "keywordsAdded": ["machine learning"],
        "rationale": "Added 'machine learning' to match job requirement while preserving all specificity"
      }
    ],
    "sectionOrder": ["sec_summary_001", "sec_exp_001", "sec_edu_001", "sec_skills_001"]
  },
  "committee": {
    "advocate": { "fitScore": 0.85, "..." : "..." },
    "critic": { "fitScore": 0.82, "..." : "..." },
    "rounds": 2,
    "terminationReason": "consensus"
  },
  "result": {
    "finalFitScore": 0.83,
    "resumeText": "[Your Name]\n[email] | [phone] | New York, NY\n\nSUMMARY\n...\n\nEXPERIENCE\n...",
    "estimatedLength": "1 page",
    "keywordsIncluded": ["NLP", "machine learning", "data science", "Python", "leadership"],
    "specificityPreserved": ["semantic analysis", "sentiment scoring", "topic clustering", "$3 Million"],
    "contentCut": [
      {
        "itemId": "item_004",
        "originalContent": "Provide oversight and mentorship to direct reports",
        "reason": "Generic; leadership already demonstrated in item_001"
      }
    ]
  },
  "meta": {
    "createdAt": "2025-01-20T04:30:00Z",
    "advocateModel": "gpt-4o",
    "criticModel": "claude-sonnet-4-20250514",
    "writerModel": "claude-sonnet-4-5-20250514",
    "durationMs": 45000,
    "tokenUsage": {
      "advocate": 2500,
      "critic": 3200,
      "writer": 4100,
      "total": 9800
    }
  }
}
```

---

## Part 3: Inheritance & Context

### How Inheritance Works

The hierarchy provides implicit context without explicit tagging:

| Level | Knows | Example |
|-------|-------|---------|
| Item | Parent object, parent section, applicant | "Led a team..." → belongs to Analytics Manager job at MRM |
| Object | Parent section, applicant | Analytics Manager job → is in Experience section |
| Section | Applicant | Experience section → belongs to Jane Smith |

### Why This Matters

When the committee processes content:

**Without hierarchy:**
```
"Led a team of 4 data scientists on NLP project"
→ What company? What role? When? No context.
```

**With hierarchy:**
```
Item: "Led a team of 4 data scientists on NLP project"
  └── Object: Analytics Manager at MRM (Jun 2021 - Present)
        └── Section: Experience
              └── Applicant: Jane Smith
→ Full context without any tagging
```

The Advocate sees: "This person is CURRENTLY leading a data science team in their role as Analytics Manager."

The Critic sees: "This is a current responsibility, so claims about ongoing leadership are valid."

The Writer sees: "This goes in the most recent job entry, should get prominence."

---

## Part 4: Operations

### Vault Operations

| Operation | Description |
|-----------|-------------|
| `createVault(profile)` | Initialize new vault with profile info |
| `parseResume(file) → sections` | Extract structured content from uploaded resume |
| `addSection(vaultId, section)` | Add a new section to vault |
| `addObject(sectionId, object)` | Add job/degree/etc to section |
| `addItem(objectId, item)` | Add accomplishment/bullet to object |
| `updateItem(itemId, content)` | Edit existing item content |
| `deleteItem(itemId)` | Remove item from vault |
| `getVault(vaultId)` | Retrieve complete vault |

### Optimization Operations

| Operation | Description |
|-----------|-------------|
| `createOptimization(vaultId, jobInfo)` | Start new optimization |
| `runCommittee(optimizationId)` | Execute advocate/critic/writer loop |
| `getOptimization(optimizationId)` | Retrieve optimization output |
| `listOptimizations(vaultId)` | List all optimizations for a vault |
| `exportResume(optimizationId, format)` | Export as PDF/DOCX/TXT |

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                           VAULT                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Complete career content (never modified by optimization)     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │ read               │ read               │ read
         ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Optimization #1  │ │ Optimization #2  │ │ Optimization #3  │
│ Job: Data Sci    │ │ Job: ML Engineer │ │ Job: Analytics   │
│                  │ │                  │ │                  │
│ Decisions:       │ │ Decisions:       │ │ Decisions:       │
│ - Include A,B,C  │ │ - Include A,C,D  │ │ - Include B,C,E  │
│ - Exclude D,E    │ │ - Exclude B,E    │ │ - Exclude A,D    │
│ - Modify A→A'    │ │ - Modify C→C'    │ │ - Modify E→E'    │
│                  │ │                  │ │                  │
│ Resume: "..."    │ │ Resume: "..."    │ │ Resume: "..."    │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

Each optimization is independent. The vault remains the single source of truth.

---

## Part 5: UI Implications

### Vault Management View

- Tree view: Sections → Objects → Items
- Drag-and-drop reordering
- Inline editing
- Completeness indicators (missing phone, no skills, etc.)
- "Last optimized" timestamp per item (tracked via optimization outputs)

### Optimization View

- Side-by-side: Job requirements ↔ Matched vault content
- Visual diff: Original item → Modified version
- Include/exclude toggles with reasons displayed
- Match score visualization
- One-click export

### History/Analytics View

- All optimizations for this vault
- Filter by company, date, score
- "This bullet appeared in 8/10 optimizations" insights
- Compare two optimizations side-by-side

---

## Part 6: Future Extensions

| Feature | Schema Impact |
|---------|---------------|
| Version history | Add `vault.history: VaultSnapshot[]` |
| Collaboration | Add `vault.sharedWith: UserId[]` |
| Templates | Add `templates` collection with pre-structured sections |
| Analytics | Aggregate data from `optimizations` collection |
| LinkedIn import | New `parseLinkedIn()` function populating same vault schema |
| Multi-format export | No schema change; rendering layer concern |

---

## Summary

**Vault**: Permanent, complete, hierarchical storage of all career content. Structure provides context through inheritance. Never modified by optimization.

**Optimization Output**: Per-job artifact storing decisions, committee analysis, and generated resume. References vault by ID. Immutable snapshot of one optimization run.

**Key Insight**: The hierarchy eliminates the need for token-level tagging. An item's meaning comes from WHERE it sits in the tree, not from labels attached to it.
