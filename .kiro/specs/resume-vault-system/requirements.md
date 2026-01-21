# Requirements Document

## Introduction

This specification defines a resume optimization system consisting of two distinct data stores:

1. **Vault** - A permanent, complete repository of all career content serving as the single source of truth
2. **Optimization Outputs** - Per-job artifacts containing optimization decisions and generated resumes

The core architectural principle is separation of concerns: the Vault is never mutated by optimization processes. Each optimization reads from the Vault and produces a standalone, immutable output artifact. This enables multiple tailored resumes from a single career history while preserving all original content.

The system uses a hierarchical data model where context flows through inheritance - an accomplishment's meaning comes from its position in the tree (which job, which section, which applicant) rather than explicit tagging.

---

## Requirements

### Requirement 1: Vault Data Store

**User Story:** As a job seeker, I want a permanent repository of all my career content, so that I have a single source of truth that captures my complete professional history.

#### Acceptance Criteria

1. WHEN a user creates a new vault THEN the system SHALL initialize it with a unique ID, version number, profile container, sections array, and metadata.

2. WHEN a user adds content to the vault THEN the system SHALL preserve ALL career content without filtering or modification.

3. WHEN an optimization process runs THEN the system SHALL read from the vault without modifying any vault content.

4. IF a vault already exists for a user THEN the system SHALL prevent creation of duplicate vaults for the same user.

5. WHEN content is added or modified in the vault THEN the system SHALL update the `updatedAt` timestamp in vault metadata.

6. WHEN any entity is created in the vault THEN the system SHALL assign a unique UUID for stable referencing.

---

### Requirement 2: Profile Management

**User Story:** As a job seeker, I want to store my identity and contact information in a structured format, so that this information can be consistently used across all resume optimizations.

#### Acceptance Criteria

1. WHEN a profile is created THEN the system SHALL support storing: first name, last name, email, phone, location (city/state/country), links array, and headline.

2. WHEN a profile field is not provided THEN the system SHALL store null rather than omitting the field.

3. WHEN storing links THEN the system SHALL capture link type (linkedin, github, portfolio, other), URL, and optional label.

4. WHEN storing location THEN the system SHALL normalize it into discrete city, state, and country components.

---

### Requirement 3: Hierarchical Section Structure

**User Story:** As a job seeker, I want my career content organized in a hierarchical structure (Sections → Objects → Items), so that context is implicitly available through inheritance without explicit tagging.

#### Acceptance Criteria

1. WHEN a section is created THEN the system SHALL require: unique ID, section type, display label, objects array, optional content field, and display order.

2. WHEN the system stores section types THEN it SHALL support: experience, education, skills, summary, certifications, projects, publications, volunteer, awards, and custom.

3. WHEN an object (job, degree, project, etc.) is created within a section THEN the system SHALL store: unique ID, parent section reference, type-specific metadata, items array, and display order.

4. WHEN an item (accomplishment, bullet point) is created within an object THEN the system SHALL store: unique ID, parent object reference, content text, display order, and optional tags.

5. WHEN content is retrieved THEN the system SHALL provide full hierarchical context (item → object → section → applicant) without requiring explicit queries for parent relationships.

---

### Requirement 4: Type-Specific Object Metadata

**User Story:** As a job seeker, I want different types of career entries (jobs, degrees, certifications) to have appropriate metadata fields, so that relevant information is captured for each entry type.

#### Acceptance Criteria

1. WHEN an experience object is created THEN the system SHALL capture: title, company, location, start date, end date (or "present"), and optional employment type.

2. WHEN an education object is created THEN the system SHALL capture: degree, field of study, institution, location, dates, and optional GPA.

3. WHEN a project object is created THEN the system SHALL capture: name, optional role, optional organization, optional URL, and optional dates.

4. WHEN a certification object is created THEN the system SHALL capture: name, issuer, date obtained, optional expiration date, optional credential ID, and optional URL.

5. WHEN dates are stored THEN the system SHALL normalize them to a structure containing year (required) and month (optional, 1-12).

---

### Requirement 5: Resume Parsing

**User Story:** As a job seeker, I want to upload existing resumes and have them automatically parsed into the vault structure, so that I don't have to manually re-enter my career history.

#### Acceptance Criteria

1. WHEN a resume file is uploaded THEN the system SHALL identify and extract sections by recognizing common headers (Experience, Education, Skills, etc.).

2. WHEN parsing an Experience or Education section THEN the system SHALL create distinct Objects for each entity (each job, each degree).

3. WHEN parsing content within an Object THEN the system SHALL create individual Items for each bullet point or distinct line.

4. WHEN parsing is complete THEN the system SHALL preserve the original order of all elements.

5. WHEN a resume is parsed THEN the system SHALL record the source file name, upload timestamp, and parse confidence score (0-1) in vault metadata.

6. IF parsing encounters missing or unclear data THEN the system SHALL store null values rather than guessing or omitting fields.

---

### Requirement 6: Optimization Output Creation

**User Story:** As a job seeker, I want each resume optimization to produce a self-contained artifact that captures all decisions made, so that I can understand and reproduce the optimization.

#### Acceptance Criteria

1. WHEN an optimization is created THEN the system SHALL generate a unique ID and record the vault ID and vault version used.

2. WHEN an optimization is complete THEN the system SHALL be immutable - no modifications allowed after creation.

3. WHEN an optimization is created THEN the system SHALL store: job information, optimization decisions, committee output, optimization result, and metadata.

4. WHEN storing job information THEN the system SHALL capture: title, company, URL, full description text, and parsed requirements (required qualifications, preferred qualifications, skills, experience level, education requirements).

---

### Requirement 7: Optimization Decision Tracking

**User Story:** As a job seeker, I want to see exactly what content was included, excluded, or modified during optimization, so that I understand why my resume looks the way it does.

#### Acceptance Criteria

1. WHEN content is included in an optimization THEN the system SHALL record the object/item ID and the reason for inclusion.

2. WHEN content is excluded from an optimization THEN the system SHALL record the object/item ID and the reason for exclusion.

3. WHEN content is modified during optimization THEN the system SHALL record: original item ID, original content, modified content, modification type (augmented/tightened/reframed), keywords added, and rationale.

4. WHEN an optimization is complete THEN the system SHALL record the final section ordering used.

5. WHEN referencing vault content THEN the system SHALL use IDs only - never duplicate the actual content.

---

### Requirement 8: Committee Agent Output

**User Story:** As a job seeker, I want to see the analysis from the advocate and critic agents, so that I can understand the reasoning behind the optimization decisions.

#### Acceptance Criteria

1. WHEN the committee completes THEN the system SHALL record the number of rounds and termination reason (consensus, target_reached, max_rounds, or no_improvement).

2. WHEN storing advocate assessment THEN the system SHALL capture: fit score, connection claims (job requirement → resume evidence with strength and confidence), strengths identified, and reframing opportunities.

3. WHEN storing critic assessment THEN the system SHALL capture: fit score, agreements with advocate, challenges raised (with type, claim, issue, severity), validated strengths, and genuine gaps identified.

4. WHEN a connection claim is recorded THEN the system SHALL classify its strength as: strong, moderate, inferred, or transferable.

5. WHEN a challenge is recorded THEN the system SHALL classify its type as: overclaim, unsupported, missing, weak_evidence, terminology_gap, or blandification.

---

### Requirement 9: Optimization Result

**User Story:** As a job seeker, I want the final optimized resume and metrics about the optimization, so that I have a ready-to-use resume and understand its quality.

#### Acceptance Criteria

1. WHEN an optimization completes THEN the system SHALL produce: final fit score, complete formatted resume text, estimated length (1 or 2 pages), keywords included, and specificity preserved.

2. WHEN content is cut during optimization THEN the system SHALL record: item ID, original content, and reason for cutting.

3. WHEN an optimization completes THEN the system SHALL record metadata: timestamp, model versions used (advocate, critic, writer), duration in milliseconds, and token usage breakdown.

---

### Requirement 10: Vault Operations API

**User Story:** As a developer, I want a clear API for vault operations, so that I can programmatically manage career content.

#### Acceptance Criteria

1. WHEN `createVault(profile)` is called THEN the system SHALL initialize a new vault with the provided profile information.

2. WHEN `parseResume(file)` is called THEN the system SHALL extract structured sections from the uploaded resume file.

3. WHEN `addSection(vaultId, section)` is called THEN the system SHALL add a new section to the specified vault.

4. WHEN `addObject(sectionId, object)` is called THEN the system SHALL add a new object (job, degree, etc.) to the specified section.

5. WHEN `addItem(objectId, item)` is called THEN the system SHALL add a new item (accomplishment) to the specified object.

6. WHEN `updateItem(itemId, content)` is called THEN the system SHALL modify the content of an existing item.

7. WHEN `deleteItem(itemId)` is called THEN the system SHALL remove the item from the vault.

8. WHEN `getVault(vaultId)` is called THEN the system SHALL return the complete vault with all nested content.

---

### Requirement 11: Optimization Operations API

**User Story:** As a developer, I want a clear API for optimization operations, so that I can programmatically create and retrieve resume optimizations.

#### Acceptance Criteria

1. WHEN `createOptimization(vaultId, jobInfo)` is called THEN the system SHALL initialize a new optimization for the specified vault and job.

2. WHEN `runCommittee(optimizationId)` is called THEN the system SHALL execute the advocate/critic/writer loop and populate the optimization output.

3. WHEN `getOptimization(optimizationId)` is called THEN the system SHALL return the complete optimization output.

4. WHEN `listOptimizations(vaultId)` is called THEN the system SHALL return all optimizations associated with the specified vault.

5. WHEN `exportResume(optimizationId, format)` is called THEN the system SHALL generate the resume in the requested format (PDF, DOCX, or TXT).

---

### Requirement 12: Data Integrity and Relationships

**User Story:** As a job seeker, I want my data to maintain referential integrity, so that relationships between content are never broken.

#### Acceptance Criteria

1. WHEN an object references a section THEN the system SHALL validate that the section exists.

2. WHEN an item references an object THEN the system SHALL validate that the object exists.

3. WHEN an optimization references vault content by ID THEN the system SHALL validate that the referenced content exists.

4. IF a referenced entity is deleted THEN the system SHALL either prevent deletion or handle cascading appropriately.

5. WHEN content order is stored THEN the system SHALL maintain consistent ordering that can be reliably reproduced.
