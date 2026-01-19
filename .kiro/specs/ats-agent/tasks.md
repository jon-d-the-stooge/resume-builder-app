# Implementation Plan: ATS Agent

## Overview

This implementation plan breaks down the ATS Agent feature into discrete, incremental coding tasks. The approach follows a bottom-up strategy: first refactor shared infrastructure from resume-content-ingestion, then build core parsing and analysis components, followed by scoring and matching logic, the recommendation system, and finally the iteration controller that orchestrates everything. Each task builds on previous work, with testing integrated throughout to validate functionality early.

## Refactoring Strategy

Before implementing ATS Agent-specific features, we extract reusable components from resume-content-ingestion into shared utilities. This ensures both features use identical infrastructure and eliminates code duplication.

## Tasks

- [~] 0. Refactor Shared Infrastructure
  - [x] 0.1 Create shared directory structure
    - Create `src/shared/` directory with subdirectories: llm, obsidian, validation, errors, types
    - Set up index files for clean imports
    - _Requirements: All (foundational)_
  
  - [x] 0.2 Extract and refactor LLM Client
    - Move LLM client code from `src/main/parserAgent.ts` to `src/shared/llm/client.ts`
    - Create unified interface supporting both Anthropic and OpenAI
    - Extract configuration types to `src/shared/llm/types.ts`
    - Move caching logic to `src/shared/llm/cache.ts`
    - Update resume-content-ingestion to use shared LLM client
    - _Requirements: All (foundational)_
  
  - [x] 0.3 Extract and refactor Obsidian MCP Client
    - Move Obsidian client from `src/main/obsidianClient.ts` to `src/shared/obsidian/client.ts`
    - Extract types to `src/shared/obsidian/types.ts`
    - Create query utilities in `src/shared/obsidian/query.ts`
    - Update resume-content-ingestion to use shared Obsidian client
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [x] 0.4 Extract and refactor Validator Utilities
    - Move validation code from `src/main/contentValidator.ts` to `src/shared/validation/validator.ts`
    - Extract Zod schemas to `src/shared/validation/schemas.ts`
    - Create validation types in `src/shared/validation/types.ts`
    - Update resume-content-ingestion to use shared validators
    - _Requirements: 8.1, 8.3, 8.4_
  
  - [x] 0.5 Extract and refactor Error Handler
    - Move error handling from `src/main/errorHandler.ts` to `src/shared/errors/handler.ts`
    - Extract error types to `src/shared/errors/types.ts`
    - Create error logger in `src/shared/errors/logger.ts`
    - Update resume-content-ingestion to use shared error handler
    - _Requirements: All (error handling)_
  
  - [x] 0.6 Extract Common Types
    - Move shared types from `src/types/index.ts` to `src/shared/types/common.ts`
    - Include: DateRange, Location, ContentMetadata, LLMConfig, etc.
    - Create type exports in `src/shared/types/index.ts`
    - Update both features to import from shared types
    - _Requirements: All (foundational)_
  
  - [x] 0.7 Write tests for shared infrastructure
    - Test LLM client with both Anthropic and OpenAI
    - Test Obsidian client operations
    - Test validation utilities
    - Test error handling
    - Test caching behavior
    - _Requirements: All (foundational)_
  
  - [x] 0.8 Update documentation
    - Document shared infrastructure in README
    - Add usage examples for each shared module
    - Update import paths in both feature specs
    - _Requirements: All (foundational)_

- [x] 1. Set up project structure and core interfaces
  - Create directory structure: `src/ats-agent/`
  - Define TypeScript interfaces for all data models (Element, ParsedJob, ParsedResume, TaggedElement, etc.)
  - Set up testing framework (Jest with fast-check for property-based testing)
  - Create type definitions file: `src/ats-agent/types/index.ts`
  - Import shared types from `src/shared/types/`
  - Import shared LLM config from `src/shared/llm/types.ts`
  - Set up environment variable handling for API keys (reuse from shared)
  - _Requirements: All (foundational)_

- [x] 2. Implement LLM-based Parser Engine (using shared LLM Client)
  - [x] 2.1 Create text normalization utilities
    - Implement lowercase conversion, whitespace trimming, punctuation handling
    - Handle special characters and encoding issues
    - _Requirements: 1.1, 4.1_
  
  - [x] 2.2 Implement LLM-based phrase extraction
    - Use shared LLM client from `src/shared/llm/client.ts`
    - Create structured prompts for element extraction
    - Use LLM to identify multi-word phrases naturally
    - Handle compound terms like "machine learning", "project management"
    - Parse LLM JSON responses into Element objects
    - Leverage shared caching layer for performance
    - _Requirements: 1.4_
  
  - [x] 2.3 Implement element deduplication
    - Consolidate duplicate elements from different sections
    - Preserve context from all occurrences
    - Select maximum importance score when consolidating
    - _Requirements: 1.5, 4.5_
  
  - [x] 2.4 Create parseJobDescription function
    - Use shared LLM client with structured prompts to extract keywords, concepts, attributes, and skills
    - Return ParsedJob with elements array including importance scores
    - Handle various job description formats
    - Leverage shared caching to avoid redundant LLM calls
    - _Requirements: 1.1_
  
  - [x] 2.5 Create parseResume function
    - Use shared LLM client with same methodology as job descriptions
    - Identify resume sections (summary, experience, skills, education)
    - Extract experience descriptions and accomplishments separately
    - Identify level of experience indicators
    - Leverage shared caching for parsed resumes
    - _Requirements: 4.1, 4.3, 4.4_
  
  - [x] 2.6 Write property test for parsing completeness
    - **Property 1: Element Extraction Completeness**
    - **Validates: Requirements 1.1, 4.1**
  
  - [x] 2.7 Write property test for multi-word phrase handling
    - **Property 2: Multi-word Phrase Handling**
    - **Validates: Requirements 1.4**
  
  - [x] 2.8 Write property test for deduplication
    - **Property 3: Deduplication with Max Importance**
    - **Validates: Requirements 1.5, 4.5**
  
  - [x] 2.9 Write property test for parsing consistency
    - **Property 4: Parsing Consistency**
    - **Validates: Requirements 4.1, 4.2**
  
  - [x] 2.10 Write unit tests for edge cases
    - Test empty inputs, very long inputs, special characters
    - Test various job description and resume formats
    - _Requirements: 1.1, 4.1_

- [x] 3. Checkpoint - Ensure parser tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Semantic Analyzer (using shared LLM Client)
  - [x] 4.1 Create tag taxonomy structure
    - Define TAG_TAXONOMY constant with all categories
    - Create helper functions to query taxonomy
    - _Requirements: 2.5_
  
  - [x] 4.2 Implement LLM-based tag assignment
    - Use shared LLM client to analyze element text and context to assign semantic tags
    - Handle technical skills, soft skills, and attributes
    - Ensure at least one tag is assigned to every element
    - Use structured prompts with tag taxonomy
    - _Requirements: 1.2, 1.3, 2.1_
  
  - [x] 4.3 Implement semantic relationship tagging
    - Use shared LLM client to assign related concept tags for technical terms
    - Example: "Python" → ["programming", "software development", "scripting"]
    - Maintain fallback dictionary of known terms and their relationships
    - Leverage shared cache for LLM results
    - _Requirements: 2.2_
  
  - [x] 4.4 Implement context-aware disambiguation
    - Use shared LLM client with context to disambiguate ambiguous terms
    - Example: "Java" as programming language vs location
    - Leverage surrounding text for accurate classification
    - _Requirements: 2.3_
  
  - [x] 4.5 Implement semantic matching logic
    - Create findSemanticMatches function using shared LLM client
    - Recognize exact matches, synonyms, related terms, and semantic similarity
    - Assign confidence scores based on match type
    - Maintain fallback synonym dictionary (e.g., "JS" ↔ "JavaScript")
    - Leverage shared cache for matching results
    - _Requirements: 2.4_
  
  - [x] 4.6 Write property test for tag assignment
    - **Property 5: Tag Assignment Completeness**
    - **Validates: Requirements 2.1**
  
  - [x] 4.7 Write property test for skill categorization
    - **Property 6: Skill Categorization**
    - **Validates: Requirements 1.2, 1.3**
  
  - [x] 4.8 Write property test for semantic relationships
    - **Property 7: Semantic Relationship Tagging**
    - **Validates: Requirements 2.2**
  
  - [x] 4.9 Write property test for context-aware tagging
    - **Property 8: Context-Aware Disambiguation**
    - **Validates: Requirements 2.3**
  
  - [x] 4.10 Write property test for semantic equivalence
    - **Property 9: Semantic Equivalence Recognition**
    - **Validates: Requirements 2.4**
  
  - [x] 4.11 Write property test for taxonomy consistency
    - **Property 10: Tag Taxonomy Consistency**
    - **Validates: Requirements 2.5**
  
  - [x] 4.12 Write unit tests for semantic analyzer
    - Test known technical terms and their expected tags
    - Test ambiguous terms in different contexts
    - Test synonym recognition
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5. Checkpoint - Ensure semantic analyzer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Scorer Engine
  - [x] 6.1 Implement importance scoring logic
    - Check for explicit importance indicators (required, must have, preferred, etc.)
    - Infer importance from position, frequency, and context when no explicit indicators
    - Handle conflicting indicators by selecting maximum
    - Ensure all scores are in range [0.0, 1.0]
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [x] 6.2 Implement match score calculation
    - Calculate dimension scores (keywords, skills, attributes, experience, level)
    - Apply dimension weights (configurable)
    - Weight matches by importance of job requirements
    - Calculate overall score as weighted sum
    - Ensure overall score is in range [0.0, 1.0]
    - _Requirements: 5.1, 5.2, 5.4_
  
  - [x] 6.3 Implement gap identification
    - Identify job elements with no match or low-quality match
    - Calculate impact of each gap on overall score
    - Sort gaps by importance × (1 - match quality)
    - _Requirements: 5.5_
  
  - [x] 6.4 Implement strength identification
    - Identify high-quality matches on high-importance elements
    - Calculate contribution of each strength to overall score
    - Sort strengths by importance × match quality
    - _Requirements: 5.2_
  
  - [x] 6.5 Create score breakdown structure
    - Generate ScoreBreakdown with all dimension scores and weights
    - Include gaps and strengths in MatchResult
    - _Requirements: 5.4, 10.1_
  
  - [x] 6.6 Write property test for importance score range
    - **Property 11: Importance Score Range**
    - **Validates: Requirements 3.1**
  
  - [x] 6.7 Write property test for high-importance indicators
    - **Property 12: Explicit High-Importance Indicators**
    - **Validates: Requirements 3.2**
  
  - [x] 6.8 Write property test for low-importance indicators
    - **Property 13: Explicit Low-Importance Indicators**
    - **Validates: Requirements 3.3**
  
  - [x] 6.9 Write property test for conflicting importance resolution
    - **Property 14: Conflicting Importance Resolution**
    - **Validates: Requirements 3.5**
  
  - [x] 6.10 Write property test for match score range
    - **Property 15: Match Score Range**
    - **Validates: Requirements 5.1**
  
  - [x] 6.11 Write property test for importance weighting
    - **Property 16: Importance Weighting Effect**
    - **Validates: Requirements 5.2, 5.3**
  
  - [x] 6.12 Write property test for multi-dimensional scoring
    - **Property 17: Multi-Dimensional Scoring**
    - **Validates: Requirements 5.4**
  
  - [x] 6.13 Write property test for gap penalty
    - **Property 18: Gap Penalty Proportionality**
    - **Validates: Requirements 5.5**
  
  - [x] 6.14 Write unit tests for scorer engine
    - Test specific importance scoring scenarios
    - Test match score calculation with known inputs
    - Test gap and strength identification
    - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.4, 5.5_

- [x] 7. Checkpoint - Ensure scorer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Recommendation Generator
  - [x] 8.1 Implement gap prioritization logic
    - Sort gaps by importance score (descending)
    - Separate high-importance (>0.8), medium (0.5-0.8), and low (<0.5) gaps
    - _Requirements: 6.2_
  
  - [x] 8.2 Implement recommendation generation for missing elements
    - For high-importance gaps, create 'add_skill' or 'add_experience' recommendations
    - Include specific suggestions and examples
    - _Requirements: 6.3_
  
  - [x] 8.3 Implement rewording suggestions
    - For partial matches (confidence 0.3-0.7), create 'reword' recommendations
    - Suggest how to strengthen the match
    - Include before/after examples
    - _Requirements: 6.4_
  
  - [x] 8.4 Implement emphasis and quantification suggestions
    - For matched elements with weak phrasing, suggest improvements
    - Recommend adding metrics or specifics
    - _Requirements: 6.4_
  
  - [x] 8.5 Generate recommendation summary
    - Create concise summary with current score, target, and top recommendations
    - Include metadata (iteration round, scores)
    - _Requirements: 6.1_
  
  - [x] 8.6 Write property test for recommendation generation
    - **Property 19: Recommendation Generation**
    - **Validates: Requirements 6.1**
  
  - [x] 8.7 Write property test for gap prioritization
    - **Property 20: Gap Prioritization**
    - **Validates: Requirements 6.2**
  
  - [x] 8.8 Write property test for high-importance gap inclusion
    - **Property 21: High-Importance Gap Inclusion**
    - **Validates: Requirements 6.3**
  
  - [x] 8.9 Write property test for rewording suggestions
    - **Property 22: Rewording Suggestions for Partial Matches**
    - **Validates: Requirements 6.4**
  
  - [x] 8.10 Write unit tests for recommendation generator
    - Test recommendation generation for various gap scenarios
    - Test summary generation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 9. Checkpoint - Ensure recommendation generator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Iteration Controller
  - [x] 11.1 Create optimization state management
    - Track iteration history (scores, recommendations, resume versions)
    - Maintain current state (job, resume, config)
    - _Requirements: 7.1_
  
  - [x] 10.2 Implement termination criteria evaluation
    - Check if score >= target threshold
    - Check for early stopping (N rounds with no improvement)
    - Check for max iterations reached
    - Return termination decision with reason
    - _Requirements: 7.2, 7.3, 7.4_
  
  - [x] 10.3 Implement iteration processing logic
    - Process new resume draft
    - Calculate match score
    - Evaluate termination criteria
    - Generate recommendations if continuing
    - _Requirements: 7.1, 7.5_
  
  - [x] 10.4 Create optimization result structure
    - Include final resume, score, iteration history, termination reason
    - Calculate metrics (initial score, final score, improvement, iteration count)
    - _Requirements: 7.5, 10.3_
  
  - [x] 10.5 Write property test for structured communication
    - **Property 23: Structured Communication Format**
    - **Validates: Requirements 7.1, 8.2**
  
  - [x] 10.6 Write property test for early stopping
    - **Property 24: Early Stopping on Stagnation**
    - **Validates: Requirements 7.2**
  
  - [x] 10.7 Write property test for success threshold
    - **Property 25: Success Threshold Termination**
    - **Validates: Requirements 7.3**
  
  - [x] 10.8 Write property test for custom threshold
    - **Property 26: Custom Threshold Respect**
    - **Validates: Requirements 7.4**
  
  - [x] 10.9 Write property test for termination summary
    - **Property 27: Termination Summary Completeness**
    - **Validates: Requirements 7.5, 10.3**
  
  - [x] 10.10 Write unit tests for iteration controller
    - Test termination criteria with various scenarios
    - Test iteration history tracking
    - Test optimization result generation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 11. Checkpoint - Ensure iteration controller tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement Input Validation (using shared Validator Utilities)
  - [x] 12.1 Create validation schemas
    - Define schemas for JobPosting, Resume, and Recommendations using Zod
    - Reuse shared validation utilities from `src/shared/validation/validator.ts`
    - Import shared schemas from `src/shared/validation/schemas.ts`
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 12.2 Implement job posting validation
    - Validate required fields (id, title, description)
    - Use shared validator utilities
    - Return descriptive error for invalid inputs
    - _Requirements: 8.1, 8.4_
  
  - [x] 12.3 Implement resume validation
    - Validate required fields (id, content, format)
    - Handle both text and Obsidian reference formats
    - Use shared validator utilities
    - Return descriptive error for invalid inputs
    - _Requirements: 8.3, 8.4, 9.5_
  
  - [x] 12.4 Implement recommendations validation
    - Validate output structure before sending to Resume Writer Agent
    - Ensure all required fields are present
    - Use shared validator utilities
    - _Requirements: 8.2_
  
  - [x] 12.5 Write property test for input validation
    - **Property 28: Input Validation**
    - **Validates: Requirements 8.1, 8.3, 8.4**
  
  - [x] 12.6 Write unit tests for validation
    - Test validation with invalid inputs
    - Test error message generation
    - _Requirements: 8.1, 8.3, 8.4_

- [x] 13. Implement Obsidian Integration (using shared Obsidian MCP Client)
  - [x] 13.1 Create Obsidian client interface
    - Use shared Obsidian MCP client from `src/shared/obsidian/client.ts`
    - Implement getResumeContent function using shared client
    - Implement saveAnalysisResult function using shared client
    - Use resume-content-ingestion feature's data format
    - _Requirements: 9.1_
  
  - [x] 13.2 Implement error handling for Obsidian operations
    - Handle missing resume content (404)
    - Handle service unavailability (503)
    - Handle invalid content structure
    - Use shared error handler from `src/shared/errors/handler.ts`
    - Return appropriate error responses
    - _Requirements: 9.2, 9.3, 9.4_
  
  - [x] 13.3 Implement retry logic for Obsidian queries
    - Retry up to 3 times with exponential backoff (use shared retry logic)
    - Only retry on transient errors (not validation errors)
    - _Requirements: 9.2, 9.4_
  
  - [x] 13.4 Write property test for Obsidian query format
    - **Property 29: Obsidian Query Format**
    - **Validates: Requirements 9.1**
  
  - [x] 13.5 Write property test for missing data handling
    - **Property 30: Missing Data Handling**
    - **Validates: Requirements 9.2**
  
  - [x] 13.6 Write property test for retrieved data validation
    - **Property 31: Retrieved Data Validation**
    - **Validates: Requirements 9.3**
  
  - [x] 13.7 Write property test for service unavailability
    - **Property 32: Service Unavailability Handling**
    - **Validates: Requirements 9.4**
  
  - [x] 13.8 Write property test for dual input support
    - **Property 33: Dual Input Support**
    - **Validates: Requirements 9.5**
  
  - [x] 13.9 Write unit tests for Obsidian integration
    - Test successful retrieval
    - Test error scenarios (missing, unavailable, invalid)
    - Test retry logic
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 14. Checkpoint - Ensure Obsidian integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement Transparency Features
  - [x] 15.1 Enhance score breakdown generation
    - Include contribution from each dimension with weights
    - Show how each matched element contributed to the score
    - _Requirements: 10.1_
  
  - [x] 15.2 Add explanations to recommendations
    - For each recommendation, include reference to specific job requirement
    - Explain why the recommendation is being made
    - _Requirements: 10.2_
  
  - [x] 15.3 Add importance scores to gaps
    - Include importance field in Gap interface
    - Show importance in gap output
    - _Requirements: 10.4_
  
  - [x] 15.4 Implement comprehensive logging
    - Log all scoring calculations
    - Log all decisions (termination, recommendations)
    - Use shared error logger from `src/shared/errors/logger.ts`
    - Include timestamps and context
    - _Requirements: 10.5_
  
  - [x] 15.5 Write property test for score breakdown completeness
    - **Property 34: Score Breakdown Completeness**
    - **Validates: Requirements 10.1**
  
  - [x] 15.6 Write property test for recommendation explanations
    - **Property 35: Recommendation Explanations**
    - **Validates: Requirements 10.2**
  
  - [x] 15.7 Write property test for gap importance transparency
    - **Property 36: Gap Importance Transparency**
    - **Validates: Requirements 10.4**
  
  - [x] 15.8 Write unit tests for transparency features
    - Test score breakdown generation
    - Test recommendation explanations
    - Test gap importance display
    - _Requirements: 10.1, 10.2, 10.4_

- [x] 16. Implement Error Handling (using shared Error Handler)
  - [x] 16.1 Create error response structures
    - Define error types (INVALID_INPUT, PARSING_FAILED, etc.)
    - Use shared error types from `src/shared/errors/types.ts`
    - Create error response interfaces with descriptive messages
    - _Requirements: 8.4_
  
  - [x] 16.2 Implement graceful degradation
    - Fall back to basic keyword matching if semantic analysis fails
    - Use default importance (0.5) if scoring fails
    - Calculate score from remaining dimensions if one fails
    - Use shared error handler for consistent error handling
    - _Requirements: All (error handling)_
  
  - [x] 16.3 Add error logging
    - Log all errors with full context using shared logger
    - Include stack traces for unexpected errors
    - Track error rates by category
    - _Requirements: 10.5_
  
  - [x] 16.4 Write unit tests for error handling
    - Test all error scenarios
    - Test graceful degradation
    - Test error message generation
    - _Requirements: 8.4_

- [x] 17. Integration and Wiring
  - [x] 17.1 Create main ATS Agent orchestrator
    - Wire together all components (parser, analyzer, scorer, recommender, controller)
    - Implement main entry point: startOptimization function
    - Handle component initialization and configuration
    - Use shared LLM client, Obsidian client, validators, and error handler
    - _Requirements: All_
  
  - [x] 17.2 Create external agent communication interfaces
    - Define interfaces for Job Search Agent and Resume Writer Agent
    - Implement message sending/receiving logic (REST API or function calls)
    - Add timeout handling for external communication
    - Implement request/response validation using shared validators
    - _Requirements: 7.1, 8.2_
  
  - [x] 17.3 Add configuration management
    - Support configurable thresholds, weights, and parameters
    - Load configuration from environment variables and config files
    - Reuse shared LLM configuration
    - Provide sensible defaults
    - Validate configuration on startup
    - _Requirements: 7.4_
  
  - [x] 17.4 Write integration tests
    - Test end-to-end optimization loop
    - Test component interactions
    - Test external agent communication
    - Test shared infrastructure integration
    - _Requirements: All_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Run full test suite (unit tests and property tests)
  - Verify all 36 properties are tested
  - Check test coverage (target: >80% line coverage)
  - Verify shared infrastructure integration works correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Task 0 (Refactoring) must be completed before starting ATS Agent implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout development
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples, edge cases, and error conditions
- Both testing approaches are complementary and necessary for comprehensive coverage
- All property tests must be tagged with: `Feature: ats-agent, Property {number}: {property_text}`
- Shared infrastructure from resume-content-ingestion eliminates code duplication and ensures consistency
