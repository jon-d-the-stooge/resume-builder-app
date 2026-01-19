# Requirements Document: ATS Agent

## Introduction

The ATS Agent is an intelligent system that analyzes job postings and resumes to determine candidate-job fit, mimicking the behavior of real Applicant Tracking System (ATS) resume screening software. The system operates in an iterative loop with a resume writer agent to optimize resume content for specific job postings through intelligent parsing, semantic analysis, and match scoring.

## Prerequisites

### Required Features
- **resume-content-ingestion**: Must be completed and deployed. Provides:
  - Resume data from Obsidian vault in structured format
  - Shared LLM client infrastructure (Anthropic + OpenAI)
  - Shared Obsidian MCP client
  - Shared validation utilities
  - Shared error handling infrastructure
  - Common type definitions

### Shared Infrastructure Dependencies
The following components from resume-content-ingestion will be refactored into `src/shared/` and reused:
- **LLM Client**: Unified client for Anthropic and OpenAI with caching
- **Obsidian MCP Client**: Vault operations and queries
- **Validator Utilities**: Schema validation with Zod
- **Error Handler**: Standardized error handling and logging
- **Common Types**: DateRange, Location, ContentMetadata, etc.

### External Dependencies
- **LLM Provider**: Either Anthropic (Claude) or OpenAI (GPT) API access
  - Anthropic: Claude 3.5 Sonnet (claude-3-5-sonnet-20241022) recommended
  - OpenAI: GPT-4o (gpt-4o) recommended
- **Validation Library**: Zod v3.x for schema validation (already in resume-content-ingestion)
- **Testing**: Jest v29.x + fast-check v3.x for property-based testing

### Environment Configuration
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`: API key for LLM provider (shared with resume-content-ingestion)
- `LLM_PROVIDER`: "anthropic" or "openai" (default: "anthropic")
- `OBSIDIAN_VAULT_PATH`: Path to Obsidian vault (from resume-content-ingestion)

### External Agent Contracts
- **Job Search Agent**: Provides job postings in structured JSON format (see Design Document)
- **Resume Writer Agent**: Accepts recommendations and returns updated resumes (see Design Document)

## Glossary

- **ATS_Agent**: The intelligent system that analyzes job postings and resumes to determine fit
- **Job_Search_Agent**: External system that provides job posting payloads
- **Resume_Writer_Agent**: External system that generates and revises resume drafts
- **Job_Posting**: A structured document describing a job opportunity with requirements and qualifications
- **Resume**: A structured document describing a candidate's experience, skills, and qualifications
- **Element**: A parsed component from a job posting or resume (keyword, skill, attribute, concept)
- **Tag**: A classification label applied to an element (e.g., "skill", "soft skill", "attribute")
- **Importance_Score**: A numerical value (0.0 to 1.0) indicating how critical an element is
- **Match_Score**: A numerical value (0.0 to 1.0) indicating overall candidate-job fit
- **Relevance_Weight**: A calculated value combining element presence and importance
- **Iteration_Round**: One complete cycle of resume analysis and feedback generation
- **Obsidian_Vault**: Data storage system containing resume content from resume-content-ingestion feature

## Requirements

### Requirement 1: Job Description Parsing

**User Story:** As the ATS Agent, I want to parse job descriptions into structured elements, so that I can identify what qualifications are required for a position.

#### Acceptance Criteria

1. WHEN a job posting payload is received from the Job_Search_Agent, THE ATS_Agent SHALL extract all keywords, concepts, attributes, and skills from the job description
2. WHEN parsing job descriptions, THE ATS_Agent SHALL identify technical skills and tag them with appropriate categories (e.g., "programming", "databases", "frameworks")
3. WHEN parsing job descriptions, THE ATS_Agent SHALL identify soft skills and attributes and tag them appropriately (e.g., "leadership", "communication", "teamwork")
4. WHEN parsing job descriptions, THE ATS_Agent SHALL handle multi-word phrases as single elements (e.g., "machine learning", "project management")
5. WHEN duplicate elements are found in a job description, THE ATS_Agent SHALL consolidate them into a single element with the highest importance score

### Requirement 2: Semantic Understanding and Tagging

**User Story:** As the ATS Agent, I want to understand semantic relationships between terms, so that I can recognize related skills and concepts even when different terminology is used.

#### Acceptance Criteria

1. WHEN an element is identified, THE ATS_Agent SHALL assign one or more semantic tags based on its meaning and context
2. WHEN a technical term is encountered (e.g., "Python"), THE ATS_Agent SHALL tag it with related concepts (e.g., "programming", "software development", "scripting")
3. WHEN a skill has multiple interpretations, THE ATS_Agent SHALL use context from surrounding text to determine the correct semantic tags
4. WHEN comparing resume elements to job elements, THE ATS_Agent SHALL recognize semantic equivalence (e.g., "JavaScript" matches "JS", "led team" matches "leadership")
5. THE ATS_Agent SHALL maintain a consistent taxonomy of tags across all parsing operations

### Requirement 3: Importance Scoring

**User Story:** As the ATS Agent, I want to assign importance scores to job requirements, so that I can prioritize critical qualifications over nice-to-have attributes.

#### Acceptance Criteria

1. WHEN parsing a job description, THE ATS_Agent SHALL assign an importance score between 0.0 and 1.0 to each extracted element
2. WHEN a requirement is marked as "required", "must have", or "essential", THE ATS_Agent SHALL assign an importance score of 0.9 or higher
3. WHEN a requirement is marked as "preferred", "nice to have", or "bonus", THE ATS_Agent SHALL assign an importance score of 0.5 or lower
4. WHEN no explicit importance indicators are present, THE ATS_Agent SHALL infer importance from context, position in the description, and frequency of mention
5. WHEN multiple importance indicators conflict, THE ATS_Agent SHALL use the highest importance level indicated

### Requirement 4: Resume Parsing

**User Story:** As the ATS Agent, I want to parse resume content using the same methodology as job descriptions, so that I can perform accurate comparisons.

#### Acceptance Criteria

1. WHEN a resume draft is received from the Resume_Writer_Agent, THE ATS_Agent SHALL extract all keywords, concepts, attributes, and skills using the same parsing methodology as job descriptions
2. WHEN parsing resumes, THE ATS_Agent SHALL identify and tag technical skills, soft skills, and attributes consistently with job description parsing
3. WHEN parsing resumes, THE ATS_Agent SHALL extract experience descriptions and accomplishments as separate elements
4. WHEN parsing resumes, THE ATS_Agent SHALL identify level of experience indicators (e.g., "5 years", "senior", "lead")
5. WHEN duplicate elements are found in a resume, THE ATS_Agent SHALL consolidate them while preserving context from different sections

### Requirement 5: Match Scoring Algorithm

**User Story:** As the ATS Agent, I want to calculate a match score between resumes and job postings, so that I can quantify candidate-job fit.

#### Acceptance Criteria

1. WHEN comparing a resume to a job posting, THE ATS_Agent SHALL calculate a match score between 0.0 and 1.0
2. WHEN calculating match scores, THE ATS_Agent SHALL weight matches by the importance score of the job requirement
3. WHEN a resume element matches a high-importance job element, THE ATS_Agent SHALL contribute more to the overall match score than low-importance matches
4. WHEN calculating match scores, THE ATS_Agent SHALL consider keyword presence, skills match, attributes match, experience alignment, and level of experience
5. WHEN a job requirement has no matching resume element, THE ATS_Agent SHALL treat it as a gap that reduces the match score proportionally to its importance

### Requirement 6: Gap Analysis and Recommendations

**User Story:** As the ATS Agent, I want to identify gaps between resume content and job requirements, so that I can provide actionable feedback to the Resume Writer Agent.

#### Acceptance Criteria

1. WHEN a match score is calculated, THE ATS_Agent SHALL generate a structured summary of suggested improvements
2. WHEN identifying gaps, THE ATS_Agent SHALL prioritize missing elements by their importance scores
3. WHEN generating recommendations, THE ATS_Agent SHALL specify which high-importance job requirements are missing from the resume
4. WHEN generating recommendations, THE ATS_Agent SHALL identify resume elements that could be reworded to better match job requirements
5. WHEN generating recommendations, THE ATS_Agent SHALL provide specific, actionable suggestions rather than vague guidance

### Requirement 7: Iterative Optimization Loop

**User Story:** As the ATS Agent, I want to iterate with the Resume Writer Agent until an optimal match is achieved, so that the final resume maximizes candidate-job fit.

#### Acceptance Criteria

1. WHEN a resume is analyzed, THE ATS_Agent SHALL send structured recommendations to the Resume_Writer_Agent and wait for the next draft
2. WHEN two consecutive iteration rounds produce no improvement in match score, THE ATS_Agent SHALL terminate the optimization loop (early stopping)
3. WHEN a match score exceeds 0.8, THE ATS_Agent SHALL terminate the optimization loop (success criteria met)
4. WHERE a custom threshold is configured, THE ATS_Agent SHALL use that threshold instead of 0.8 for termination
5. WHEN the optimization loop terminates, THE ATS_Agent SHALL provide a final summary including the match score, number of iterations, and reason for termination

### Requirement 8: Communication Protocol

**User Story:** As the ATS Agent, I want to communicate with external agents using structured data formats, so that integration is reliable and maintainable.

#### Acceptance Criteria

1. WHEN receiving job posting payloads, THE ATS_Agent SHALL validate the payload structure before processing
2. WHEN sending recommendations to the Resume_Writer_Agent, THE ATS_Agent SHALL use a structured format with clearly defined fields
3. WHEN receiving resume drafts, THE ATS_Agent SHALL validate the draft structure before processing
4. IF a payload or draft fails validation, THEN THE ATS_Agent SHALL return a descriptive error message indicating what is invalid
5. THE ATS_Agent SHALL maintain version compatibility for all communication protocols

### Requirement 9: Data Integration

**User Story:** As the ATS Agent, I want to access resume content from the Obsidian vault, so that I can leverage previously ingested resume data.

#### Acceptance Criteria

1. WHEN resume content is needed, THE ATS_Agent SHALL query the Obsidian_Vault using the resume-content-ingestion feature's data format
2. WHEN accessing the Obsidian_Vault, THE ATS_Agent SHALL handle cases where resume content is not yet available
3. WHEN resume content is retrieved from the Obsidian_Vault, THE ATS_Agent SHALL validate the content structure before using it
4. IF the Obsidian_Vault is unavailable, THEN THE ATS_Agent SHALL return an error indicating the data source is inaccessible
5. THE ATS_Agent SHALL support both direct resume text input and Obsidian vault references

### Requirement 10: Performance Metrics and Transparency

**User Story:** As a user, I want to understand how the ATS Agent calculated match scores, so that I can trust the recommendations and understand what needs improvement.

#### Acceptance Criteria

1. WHEN a match score is calculated, THE ATS_Agent SHALL provide a breakdown showing contribution from each scoring dimension (keywords, skills, experience, etc.)
2. WHEN generating recommendations, THE ATS_Agent SHALL explain why each recommendation is being made with reference to specific job requirements
3. WHEN the optimization loop terminates, THE ATS_Agent SHALL provide metrics including initial score, final score, improvement delta, and number of iterations
4. WHEN a gap is identified, THE ATS_Agent SHALL show the importance score of the missing requirement
5. THE ATS_Agent SHALL log all scoring calculations for audit and debugging purposes
