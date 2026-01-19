# Implementation Plan: Resume Content Ingestion

## Overview

This implementation plan breaks down the Resume Content Ingestion system into discrete, incremental coding tasks. The system will be built using TypeScript/Node.js with Electron for the desktop interface, OpenAI or Anthropic SDKs for AI parsing, and the Obsidian MCP tool for storage. Each task builds on previous work, with testing integrated throughout to validate functionality early.

## Tasks

- [x] 1. Set up project structure and core dependencies
  - Initialize TypeScript project with Electron configuration
  - Install dependencies: Electron, OpenAI/Anthropic SDK, Obsidian MCP client, fast-check for property testing
  - Set up build configuration and development scripts
  - Create directory structure for components, types, and tests
  - _Requirements: All (foundational)_

- [x] 2. Implement core type definitions and interfaces
  - Define TypeScript interfaces for ContentItem, JobEntry, ParsedResume, and all metadata types
  - Define enums for ContentType, FileFormat
  - Create type definitions for Obsidian MCP client interactions
  - Define validation result and error types
  - _Requirements: 3.1-3.7, 4.1-4.8, 8.1-8.6_

- [x] 3. Implement File Handler component
  - [x] 3.1 Create file validation logic
    - Implement format validation (PDF, DOCX, TXT)
    - Implement size validation (< 10MB)
    - Return structured validation results with error messages
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 3.2 Write property tests for file validation
    - **Property 1: Valid file formats are accepted**
    - **Property 2: Invalid file formats are rejected**
    - **Property 3: Oversized files are rejected**
    - **Validates: Requirements 1.1-1.5**
  
  - [x] 3.3 Implement text extraction from different formats
    - Extract text from PDF files using pdf-parse or similar
    - Extract text from DOCX files using mammoth or similar
    - Extract text from TXT files directly
    - Handle extraction errors gracefully
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 4. Implement AI Parser Agent component
  - [x] 4.1 Create parser agent with OpenAI or Anthropic SDK
    - Set up API client with configuration
    - Implement structured output schema for resume parsing
    - Create system prompts with few-shot examples
    - Implement confidence scoring logic
    - _Requirements: 2.1, 2.3, 2.5_
  
  - [x] 4.2 Implement resume parsing with content extraction
    - Parse full resume and extract job entries
    - Extract skills, accomplishments, education, certifications
    - Detect hierarchical relationships (job → accomplishments/skills)
    - Generate confidence scores for each extraction
    - Handle parsing errors with fallback strategies
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1-3.7_
  
  - [x] 4.3 Write property tests for parser output
    - **Property 4: Parser provides confidence scores**
    - **Property 5: Content extraction completeness**
    - **Validates: Requirements 2.5, 3.1-3.7**

- [x] 5. Checkpoint - Ensure parsing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Content Manager component
  - [x] 6.1 Create content item creation and tagging logic
    - Implement createContentItem function with tag application
    - Apply appropriate tags based on content type (#job-title, #skill, etc.)
    - Support multiple tags per item
    - Generate unique IDs for content items
    - _Requirements: 4.1-4.8, 6.6_
  
  - [x] 6.2 Write property tests for tagging
    - **Property 6: Content type to tag mapping**
    - **Property 7: Multiple tag support**
    - **Validates: Requirements 4.1-4.8**
  
  - [x] 6.3 Implement content item update and delete operations
    - Implement updateContentItem with timestamp preservation
    - Implement deleteContentItem
    - Implement linkContentItems for parent-child relationships
    - _Requirements: 7.2-7.6, 11.2, 11.3_
  
  - [x] 6.4 Implement duplicate detection
    - Check for existing content with identical text and type
    - Return potential duplicates for user review
    - _Requirements: 12.3_
  
  - [x] 6.5 Write property tests for content operations
    - **Property 12: Creation timestamp preservation**
    - **Property 34: Duplicate content prevention**
    - **Validates: Requirements 7.6, 12.3**

- [x] 7. Implement Obsidian MCP Client integration
  - [x] 7.1 Create Obsidian MCP client wrapper
    - Implement writeNote with YAML frontmatter support
    - Implement readNote with frontmatter parsing
    - Implement updateNote and deleteNote operations
    - Implement searchNotes with tag and text filtering
    - Handle MCP tool errors and connection issues
    - _Requirements: 5.1-5.5, 10.1-10.4_
  
  - [x] 7.2 Implement markdown file generation
    - Generate markdown content with proper structure
    - Create YAML frontmatter with tags, metadata, and relationships
    - Add Obsidian links for parent-child relationships
    - Ensure consistent directory structure (jobs/, education/, etc.)
    - _Requirements: 5.1, 5.2, 5.3, 8.6, 10.1, 10.2, 11.6_
  
  - [x] 7.3 Write property tests for storage operations
    - **Property 8: Content item storage round-trip**
    - **Property 9: Obsidian tag syntax compliance**
    - **Property 10: Content update persistence**
    - **Property 11: Content deletion removes file**
    - **Property 16: YAML frontmatter structure**
    - **Property 21: Consistent markdown structure**
    - **Property 22: Machine-readable frontmatter**
    - **Validates: Requirements 5.1-5.5, 8.6, 10.1, 10.2**

- [x] 8. Implement hierarchical relationship management
  - [x] 8.1 Create parent-child linking logic
    - Link accomplishments to parent job entries
    - Link skills to parent job entries
    - Support many-to-many relationships for skills
    - Update both parent and child markdown files with links
    - _Requirements: 11.1-11.7, 12.4, 12.5_
  
  - [x] 8.2 Write property tests for relationships
    - **Property 25: Job entry parent creation**
    - **Property 26: Accomplishment-to-job linking**
    - **Property 27: Skill-to-job linking**
    - **Property 30: Obsidian link preservation**
    - **Property 31: Hierarchical context in queries**
    - **Property 35: Many-to-many skill relationships**
    - **Validates: Requirements 11.1-11.7, 12.4, 12.5**

- [x] 9. Checkpoint - Ensure storage and relationship tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement search and query functionality
  - [x] 10.1 Create search query builder
    - Build queries for tag-based filtering
    - Build queries for text-based search
    - Build queries for date range filtering
    - Support multiple simultaneous filters
    - _Requirements: 9.1-9.4_
  
  - [x] 10.2 Implement search execution and result processing
    - Execute queries via Obsidian MCP client
    - Parse and format search results
    - Include tags and metadata in results
    - Preserve hierarchical context in results
    - Handle empty results gracefully
    - _Requirements: 9.1-9.6, 10.4, 11.7_
  
  - [x] 10.3 Write property tests for search
    - **Property 17: Tag-based search accuracy**
    - **Property 18: Text search accuracy**
    - **Property 19: Date range filtering**
    - **Property 20: Search results completeness**
    - **Property 23: Tag format for programmatic access**
    - **Property 24: Content retrieval by type**
    - **Validates: Requirements 9.1-9.6, 10.3, 10.4**

- [x] 11. Implement validation logic
  - [x] 11.1 Create content item validator
    - Validate required fields (type, content)
    - Validate date formats and ranges
    - Validate metadata structure
    - Return specific validation errors for each field
    - _Requirements: 6.2, 6.5, 6.7, 15.3_
  
  - [x] 11.2 Write property tests for validation
    - **Property 13: Required field validation**
    - **Property 14: Valid manual entry creates content item**
    - **Property 15: Invalid submission prevents creation**
    - **Validates: Requirements 6.2, 6.5, 6.6, 6.7**

- [x] 12. Implement error handling and user feedback
  - [x] 12.1 Create error handling utilities
    - Implement error message formatting
    - Implement error logging with technical details
    - Create user-friendly error messages for each error type
    - Implement retry logic for transient failures
    - _Requirements: 15.1-15.6_
  
  - [x] 12.2 Write property tests for error handling
    - **Property 38: Upload failure error messages**
    - **Property 39: Parsing error logging and continuation**
    - **Property 40: Validation error highlighting**
    - **Property 41: Success confirmation display**
    - **Property 42: Unexpected error handling**
    - **Validates: Requirements 15.1-15.6**

- [x] 13. Implement Electron UI - File Upload
  - [x] 13.1 Create file upload interface
    - Build drag-and-drop file upload component
    - Add file selection button
    - Display file validation results
    - Show upload progress indicator
    - Display error messages for invalid files
    - _Requirements: 1.1-1.5, 15.1_
  
  - [x] 13.2 Write unit tests for upload UI
    - Test file selection handling
    - Test drag-and-drop functionality
    - Test error display for invalid files
    - _Requirements: 1.1-1.5_

- [x] 14. Implement Electron UI - Content Review
  - [x] 14.1 Create content review interface
    - Display parsed content items in hierarchical view
    - Show job entries with nested accomplishments and skills
    - Display confidence scores and warnings
    - Allow editing of content items before saving
    - Allow modification of parent-child relationships
    - Allow deletion of incorrectly parsed items
    - Allow addition of missing items
    - _Requirements: 3.8, 13.1-13.5_
  
  - [x] 14.2 Implement review confirmation and cancellation
    - Save all content items on confirmation
    - Discard all content items on cancellation
    - Display success confirmation after save
    - _Requirements: 13.6, 13.7, 15.5_
  
  - [x] 14.3 Write property tests for review operations
    - **Property 36: Review confirmation saves all items**
    - **Property 37: Review cancellation discards content**
    - **Validates: Requirements 13.6, 13.7**

- [x] 15. Implement Electron UI - Manual Entry
  - [x] 15.1 Create manual content entry form
    - Build form with content type selector
    - Add content text input field
    - Add metadata fields (dates, location, company, proficiency)
    - Add tag input with suggestions
    - Display validation errors inline
    - _Requirements: 6.1-6.7, 8.1-8.5_
  
  - [x] 15.2 Write unit tests for manual entry form
    - Test form validation
    - Test successful submission
    - Test error display for invalid data
    - _Requirements: 6.1-6.7_

- [x] 16. Implement Electron UI - Search and Browse
  - [x] 16.1 Create search interface
    - Build tag filter selector
    - Add text search input
    - Add date range filter
    - Display search results with tags and metadata
    - Handle empty results with appropriate message
    - _Requirements: 9.1-9.6_
  
  - [x] 16.2 Write unit tests for search UI
    - Test filter application
    - Test result display
    - Test empty results handling
    - _Requirements: 9.1-9.6_

- [x] 17. Implement Electron UI - Content Editing
  - [x] 17.1 Create content item editor
    - Display existing content item data
    - Allow editing of content text
    - Allow editing of tags
    - Allow editing of metadata
    - Preserve creation timestamp on save
    - Display success confirmation after save
    - _Requirements: 7.1-7.6, 15.5_
  
  - [x] 17.2 Write unit tests for content editor
    - Test data loading
    - Test editing functionality
    - Test save operation
    - _Requirements: 7.1-7.6_

- [x] 18. Checkpoint - Ensure UI tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Integration testing with real resumes
  - [x] 19.1 Create test suite with real resume files
    - Collect 3-5 real PDF resumes with varied formats
    - Collect 3-5 real DOCX resumes with varied formats
    - Collect 3-5 real TXT resumes with varied formats
    - Create ground truth data for each resume (manually verified)
    - _Requirements: 14.1, 14.2, 14.3_
  
  - [x] 19.2 Write integration tests for real resume parsing
    - Test PDF resume parsing accuracy (>90% for titles, skills, accomplishments)
    - Test DOCX resume parsing accuracy (>90% for titles, skills, accomplishments)
    - Test TXT resume parsing accuracy (>90% for titles, skills, accomplishments)
    - Test hierarchical relationship preservation
    - Test tag-based retrieval accuracy (100%)
    - Test multi-tag filtering accuracy (100%)
    - **Validates: Requirements 14.1-14.10**

- [x] 20. End-to-end integration testing
  - [x] 20.1 Write end-to-end test flows
    - Test upload → parse → review → save → verify in vault
    - Test manual entry → validate → save → verify in vault
    - Test search by tags → verify results → verify completeness
    - Test update content → verify persistence → verify timestamp preservation
    - Test delete content → verify removal from vault
    - **Validates: Requirements 1.1-15.6 (comprehensive)**

- [x] 21. Performance optimization and testing
  - [x] 21.1 Implement performance optimizations
    - Optimize file upload handling for large files
    - Optimize parsing for long resumes
    - Optimize search for large vaults
    - Add caching where appropriate
    - _Requirements: All (performance)_
  
  - [x] 21.2 Write performance tests
    - Test file upload speed (< 1s for 10MB files)
    - Test parsing speed (< 30s for typical resume)
    - Test save speed (< 500ms per item)
    - Test search speed (< 2s for 1000+ items)

- [x] 22. Final checkpoint - Complete system validation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all requirements are implemented and tested
  - Verify all correctness properties have corresponding tests
  - Run full test suite including property tests, unit tests, and integration tests

## Notes

- All tasks are required for comprehensive implementation with full test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout development
- Property tests validate universal correctness properties with 100+ iterations each
- Unit tests validate specific examples, edge cases, and UI interactions
- Integration tests validate end-to-end flows with real resume data
- The implementation follows a bottom-up approach: core logic → storage → UI
- AI parsing uses OpenAI or Anthropic SDKs with structured output for consistency
- Obsidian MCP tool handles all vault interactions for portability
