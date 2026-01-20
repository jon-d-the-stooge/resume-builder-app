# Requirements Document

## Introduction

The User Knowledge Base is a dedicated storage and retrieval system for optimized resumes and their associated job analysis data. Unlike the existing Vault (which stores resume building blocks like skills, jobs, and accomplishments), the Knowledge Base serves as a historical archive of optimization outputs. Users can browse, search, and export their past optimizations to track their job search progress and reuse successful resume versions.

Key differentiators from existing features:
- **Vault**: Stores resume components (skills, accomplishments, job entries)
- **Applications**: Tracks application status (applied, interviewing, offered)
- **Knowledge Base**: Archives optimization outputs with full analysis data

## Requirements

### Requirement 1: Automatic Optimization Archiving

**User Story:** As a job seeker, I want my successful optimizations to be automatically saved to the knowledge base, so that I don't have to manually save each one.

#### Acceptance Criteria

1. WHEN an optimization completes successfully THEN the system SHALL automatically create a knowledge base entry containing the job description, source URL (if available), optimized resume, analysis data, and timestamp.
2. WHEN saving a knowledge base entry THEN the system SHALL generate a unique identifier using timestamp and random characters to ensure uniqueness even for multiple optimizations of the same job.
3. IF an optimization fails or is cancelled THEN the system SHALL NOT create a knowledge base entry.
4. WHEN an optimization is saved from the queue processor THEN the system SHALL also create a knowledge base entry with the same data.

### Requirement 2: Knowledge Base Data Structure

**User Story:** As a job seeker, I want comprehensive data stored for each optimization, so that I can review all aspects of my past work.

#### Acceptance Criteria

1. WHEN a knowledge base entry is created THEN it SHALL contain: job title, company name, full job description, source URL (optional), optimized resume content (markdown), timestamp of creation.
2. WHEN a knowledge base entry is created THEN it SHALL contain analysis data including: final ATS score, initial ATS score, number of iterations, list of identified strengths, list of identified gaps, and list of recommendations with priority levels.
3. WHEN storing the entry THEN the system SHALL use Obsidian-compatible markdown format with YAML frontmatter for metadata.
4. WHEN multiple optimizations exist for the same job THEN each SHALL be stored as a separate entry with unique timestamp.

### Requirement 3: Knowledge Base Browsing Interface

**User Story:** As a job seeker, I want a dedicated page to browse my knowledge base entries, so that I can easily find past optimizations.

#### Acceptance Criteria

1. WHEN the user navigates to the Knowledge Base page THEN the system SHALL display a grid of entry cards showing job title, company, ATS score, and creation date.
2. WHEN viewing the Knowledge Base page THEN the system SHALL display statistics including: total entries, average score, entries this week, and number of unique companies.
3. WHEN the user clicks an entry card THEN the system SHALL display a detail modal showing the full job description, optimized resume, and complete analysis data.
4. WHEN no entries exist THEN the system SHALL display an empty state with guidance on how entries are created.

### Requirement 4: Search and Filter Capabilities

**User Story:** As a job seeker, I want to search and filter my knowledge base, so that I can quickly find specific optimizations.

#### Acceptance Criteria

1. WHEN the user enters text in the search field THEN the system SHALL filter entries by matching job title, company name, or job description content.
2. WHEN the user selects a company from the dropdown THEN the system SHALL display only entries for that company.
3. WHEN the user changes the sort option THEN the system SHALL reorder entries by date (newest/oldest) or score (highest/lowest).
4. WHEN search text and company filter are both applied THEN the system SHALL combine them with AND logic.

### Requirement 5: Resume Viewing and Editing

**User Story:** As a job seeker, I want to view my optimized resumes in both rendered and raw formats, so that I can read them easily and make edits when needed.

#### Acceptance Criteria

1. WHEN viewing a resume in the detail modal THEN the system SHALL display the rendered/processed markdown by default (formatted headings, bullets, bold text).
2. WHEN the user toggles to raw view THEN the system SHALL display the raw markdown source with syntax visible.
3. WHEN in raw view THEN the user SHALL be able to edit the markdown content directly.
4. WHEN the user saves edits to the raw markdown THEN the system SHALL update the stored entry and reflect changes in the rendered view.
5. WHEN switching between raw and rendered views THEN the system SHALL preserve any unsaved edits with a warning if navigating away.

### Requirement 6: Entry Management

**User Story:** As a job seeker, I want to manage my knowledge base entries, so that I can add notes, organize with tags, and remove outdated entries.

#### Acceptance Criteria

1. WHEN viewing an entry detail THEN the user SHALL be able to add or edit personal notes.
2. WHEN viewing an entry detail THEN the user SHALL be able to add or remove tags for organization.
3. WHEN the user clicks delete on an entry THEN the system SHALL prompt for confirmation before removing.
4. WHEN an entry is deleted THEN the system SHALL remove the corresponding markdown file from the Obsidian vault.

### Requirement 7: Export Functionality

**User Story:** As a job seeker, I want to export my optimized resumes in multiple formats, so that I can use them in job applications.

#### Acceptance Criteria

1. WHEN the user requests an export THEN the system SHALL offer format options: PDF, Word (.docx), Markdown (.md), and plain text (.txt).
2. WHEN exporting to PDF THEN the system SHALL render the resume with proper formatting (headings, bullets, bold text).
3. WHEN exporting to Word THEN the system SHALL create a properly formatted .docx document.
4. WHEN exporting to Markdown or text THEN the system SHALL save the raw content with appropriate file extension.
5. WHEN an export is requested THEN the system SHALL present a save dialog for the user to choose the destination.

### Requirement 8: Storage Architecture

**User Story:** As a user, I want my knowledge base data stored in my Obsidian vault, so that it persists across sessions and is accessible outside the app.

#### Acceptance Criteria

1. WHEN the knowledge base is initialized THEN the system SHALL create a `KnowledgeBase/` folder in the configured Obsidian vault if it doesn't exist.
2. WHEN saving an entry THEN the system SHALL create a markdown file with naming pattern: `{Company}-{JobTitle}-{id}.md`.
3. WHEN reading entries THEN the system SHALL parse YAML frontmatter for metadata and markdown body for content.
4. IF the Obsidian vault path is not configured THEN the system SHALL prompt the user to configure it before saving.

### Requirement 9: Navigation Integration

**User Story:** As a user, I want to access the Knowledge Base from the main navigation, so that it's easy to find.

#### Acceptance Criteria

1. WHEN viewing any page in the application THEN the navigation SHALL include a "Knowledge Base" link.
2. WHEN on the Knowledge Base page THEN the navigation link SHALL be visually highlighted as active.
3. WHEN on the Dashboard THEN the system SHALL display a Knowledge Base summary widget showing recent entries count and link to the full page.
