# Requirements Document: Job Parsing Integration

## Introduction

This spec defines the technical requirements for reliable job posting extraction and parsing. The current implementation has field name mismatches, missing error propagation, type safety violations, and silent failures when parsing job postings from URLs. This redesign ensures consistent data structures, proper error handling, and reliable extraction across different job board sites.

## Requirements

### Requirement 1: Consistent Data Structures

**User Story:** As a developer, I want consistent field names across the entire data flow, so that data doesn't get lost between components.

#### Acceptance Criteria

1. WHEN a job is extracted THEN the system SHALL return an object with exactly these fields: `title`, `company`, `location`, `description`, `requirements`, `responsibilities`, `preferredQualifications`, `salary`, `url`
2. WHEN a job is passed between components THEN the system SHALL use the same field names (no `snippet` vs `description`, no `sourceUrl` vs `url` confusion)
3. IF a field is optional THEN the TypeScript interface SHALL mark it with `?` and code SHALL handle undefined values
4. WHEN arrays are expected (requirements, responsibilities) THEN the system SHALL default to empty arrays `[]`, never undefined
5. WHEN IPC handlers return errors THEN the system SHALL use a consistent format: `{ success: false, error: string, code?: string }`

### Requirement 2: Robust URL Fetching

**User Story:** As a user, I want job extraction to work on major job sites, so that I don't have to manually copy-paste job descriptions.

#### Acceptance Criteria

1. WHEN fetching a job URL THEN the system SHALL first attempt a simple HTTP fetch
2. IF simple fetch returns WAF/bot challenge content THEN the system SHALL automatically retry with browser-based fetch
3. WHEN using browser-based fetch THEN the system SHALL wait for JavaScript execution (minimum 3 seconds)
4. IF browser fetch still shows challenge page THEN the system SHALL wait additional time (up to 10 seconds total)
5. WHEN fetch ultimately fails THEN the system SHALL return a specific error code: `FETCH_BLOCKED`, `FETCH_TIMEOUT`, or `FETCH_ERROR`
6. IF the URL returns a login page THEN the system SHALL detect this and return error code `LOGIN_REQUIRED`

### Requirement 3: LLM Parsing Validation

**User Story:** As a developer, I want parsed job data to be validated before use, so that incomplete extractions don't cause downstream failures.

#### Acceptance Criteria

1. WHEN LLM returns parsed data THEN the system SHALL validate that required fields exist: `title`, `company`
2. IF LLM returns `{ error: "..." }` THEN the system SHALL propagate this as a parsing failure with the error message
3. WHEN LLM returns empty arrays for requirements/responsibilities THEN the system SHALL accept this as valid (job may not list them)
4. IF LLM returns malformed JSON THEN the system SHALL return error code `PARSE_ERROR` with the raw response for debugging
5. WHEN validation fails THEN the system SHALL include which fields are missing in the error response

### Requirement 4: Graceful Degradation

**User Story:** As a user, I want to still optimize my resume even if extraction is incomplete, so that I'm not blocked by parsing issues.

#### Acceptance Criteria

1. WHEN extraction returns partial data THEN the system SHALL indicate which fields were extracted vs. which are missing
2. IF title is extracted but description is empty THEN the system SHALL allow the user to manually enter the description
3. WHEN requirements/responsibilities are empty THEN the system SHALL proceed with optimization using available data
4. IF only the URL fetch succeeded but LLM parsing failed THEN the system SHALL offer to show the raw HTML for manual copy-paste
5. WHEN degraded mode is active THEN the system SHALL show a warning banner explaining limited data

### Requirement 5: Error Propagation

**User Story:** As a developer, I want errors to propagate correctly through the IPC layer, so that the UI can display meaningful feedback.

#### Acceptance Criteria

1. WHEN an error occurs in jobSearchAgent THEN the system SHALL return `null` with a logged error message
2. WHEN the IPC handler receives `null` from the agent THEN the system SHALL return `{ success: false, error: "descriptive message", code: "ERROR_CODE" }`
3. WHEN the renderer receives an error response THEN the system SHALL read the `error` field (not `message`) for display
4. IF an exception is thrown THEN the system SHALL catch it and return a structured error response, never crash
5. WHEN logging errors THEN the system SHALL include: timestamp, error code, URL attempted, and stack trace

### Requirement 6: Type Safety

**User Story:** As a developer, I want TypeScript to catch data structure issues at compile time, so that runtime errors are minimized.

#### Acceptance Criteria

1. WHEN defining ExtractedJob interface THEN optional fields SHALL be marked with `?`
2. WHEN accessing array fields THEN code SHALL use optional chaining (`?.`) or provide defaults
3. WHEN passing data between IPC boundaries THEN the system SHALL validate against the expected interface
4. IF a type mismatch is detected at runtime THEN the system SHALL log a warning with the expected vs. actual types
5. WHEN building description from arrays THEN the system SHALL check `array?.length > 0` before mapping

### Requirement 7: Search Result to Extracted Job Conversion

**User Story:** As a user, I want search results to have full job details when I click "Optimize Now", so that I get quality optimizations.

#### Acceptance Criteria

1. WHEN a search result is clicked for optimization THEN the system SHALL check if full content exists
2. IF search result only has `snippet` THEN the system SHALL auto-extract from the source URL before proceeding
3. WHEN auto-extracting THEN the system SHALL show loading state on the clicked button
4. IF auto-extraction fails THEN the system SHALL use the snippet as fallback and warn the user
5. WHEN building the optimizer payload THEN the system SHALL use `description` (preferring extracted over snippet)
