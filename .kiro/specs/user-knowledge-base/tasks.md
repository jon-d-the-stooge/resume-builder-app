# Implementation Plan

- [ ] 1. Create Knowledge Base Store Module
  - Create `src/main/knowledgeBaseStore.ts` with TypeScript interfaces for `KnowledgeBaseEntry`, `KnowledgeBaseSummary`, and `KnowledgeBaseStats`
  - Implement `generateId()` function using timestamp + random characters pattern
  - Implement `generateFilename()` with company/title sanitization
  - _Requirements: 2.1, 2.2, 8.2_

- [ ] 2. Implement Store CRUD Operations
  - [ ] 2.1 Implement `save()` function
    - Create KnowledgeBase folder if not exists
    - Build YAML frontmatter from entry data
    - Write markdown file with frontmatter + resume content + job description
    - _Requirements: 1.1, 1.2, 8.1, 8.2_

  - [ ] 2.2 Implement `list()` function
    - Read all .md files from KnowledgeBase folder
    - Parse frontmatter to extract summary fields
    - Apply filters (company, text search)
    - Apply sorting (date, score)
    - Return array of `KnowledgeBaseSummary`
    - _Requirements: 3.1, 4.1, 4.2, 4.3_

  - [ ] 2.3 Implement `get()` function
    - Find file by ID in filename
    - Parse frontmatter and body content
    - Return full `KnowledgeBaseEntry` or null
    - _Requirements: 3.3_

  - [ ] 2.4 Implement `update()` function
    - Load existing entry
    - Merge updates (notes, tags, optimizedResume)
    - Rewrite file with updated content
    - _Requirements: 5.4, 6.1, 6.2_

  - [ ] 2.5 Implement `delete()` function
    - Find and remove file by ID
    - Return success boolean
    - _Requirements: 6.3, 6.4_

  - [ ] 2.6 Implement `getStats()` and `getCompanies()` functions
    - Calculate total, average score, this week count, unique companies
    - Return distinct company list for filter dropdown
    - _Requirements: 3.2, 4.2_

- [ ] 3. Add IPC Handlers
  - Add handlers in `src/main/index.ts` for: `knowledge-base-list`, `knowledge-base-get`, `knowledge-base-save`, `knowledge-base-update`, `knowledge-base-delete`, `knowledge-base-stats`, `knowledge-base-companies`
  - Add `knowledge-base-export` handler that reuses existing PDF/Word export logic
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 4. Integrate Auto-Save with Optimizer
  - Add `saveToKnowledgeBase()` function in `src/renderer/optimizer.js`
  - Extract analysis data from optimization results (strengths, gaps, recommendations)
  - Call function after successful optimization completes
  - _Requirements: 1.1, 1.3, 1.4_

- [ ] 5. Create Knowledge Base HTML Page
  - Create `src/renderer/knowledge-base.html` with consistent navigation header
  - Add stats row section with placeholders
  - Add search bar with text input, company dropdown, sort dropdown
  - Add grid container for entry cards
  - Add detail modal structure with tabs (Job Description, Resume, Analysis)
  - Add empty state for when no entries exist
  - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3_

- [ ] 6. Implement Knowledge Base JavaScript
  - [ ] 6.1 Implement page initialization
    - Load stats and display in stats row
    - Load companies for filter dropdown
    - Load initial entry list
    - _Requirements: 3.1, 3.2_

  - [ ] 6.2 Implement search and filter functionality
    - Debounce text search input
    - Handle company dropdown change
    - Handle sort dropdown change
    - Reload filtered results
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 6.3 Implement entry card rendering
    - Create card elements with title, company, score bar, date
    - Add click handler to open detail modal
    - _Requirements: 3.1, 3.3_

  - [ ] 6.4 Implement detail modal
    - Tab switching between Job Description, Resume, Analysis
    - Display job description content
    - Display analysis data (score, strengths, gaps, recommendations)
    - _Requirements: 3.3_

  - [ ] 6.5 Implement resume view with raw/rendered toggle
    - Render markdown to HTML for rendered view (use existing markdown renderer or simple parser)
    - Show raw markdown in monospace textarea for raw view
    - Toggle button to switch views
    - _Requirements: 5.1, 5.2_

  - [ ] 6.6 Implement resume editing
    - Enable editing in raw markdown view
    - Save button to persist changes via IPC
    - Unsaved changes warning on navigation
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ] 6.7 Implement notes and tags editing
    - Editable notes textarea
    - Tag display with remove buttons
    - Add tag input
    - Auto-save on blur or explicit save
    - _Requirements: 6.1, 6.2_

  - [ ] 6.8 Implement delete functionality
    - Delete button with confirmation dialog
    - Remove entry and refresh list
    - _Requirements: 6.3, 6.4_

  - [ ] 6.9 Implement export functionality
    - Export dropdown with format options
    - Call IPC handler with entry ID and format
    - Trigger download via save dialog
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 7. Add Navigation Links
  - Add "Knowledge Base" link to navigation in all HTML pages: `index.html`, `optimizer.html`, `queue.html`, `chat.html`, `job-search.html`, `vault.html`, `settings.html`, `manual-entry.html`, `edit.html`, `review.html`, `applications.html`
  - Add active state styling for knowledge-base page
  - _Requirements: 9.1, 9.2_

- [ ] 8. Add Dashboard Widget
  - Add Knowledge Base summary card to `src/renderer/index.html`
  - Display recent entries count and link to full page
  - _Requirements: 9.3_

- [ ] 9. Copy JS to dist folder
  - Update `package.json` copy script to include `knowledge-base.js`
  - Run build to verify all files are in place
  - _Requirements: 8.3_
