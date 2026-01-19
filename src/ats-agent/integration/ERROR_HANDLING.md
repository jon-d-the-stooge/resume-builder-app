# Obsidian Integration Error Handling

This document describes the comprehensive error handling implemented for Obsidian operations in the ATS Agent.

## Overview

The Obsidian client implements robust error handling for all vault operations, using the shared error handler from `src/shared/errors/handler.ts`. All errors are wrapped in `AppError` instances with appropriate categories, user-friendly messages, and technical details.

## Error Categories

### 1. Missing Resume Content (404)

**Scenario**: Resume not found in the Obsidian vault

**Error Details**:
- **Category**: `ErrorCategory.STORAGE`
- **Severity**: `ErrorSeverity.HIGH`
- **User Message**: "Resume not found: {resumeId}"
- **Technical Details**: Includes path and suggestion to use resume-content-ingestion feature
- **Recoverable**: `true`
- **Context**: Includes `resumeId` and `path`

**Example**:
```typescript
try {
  const resume = await client.getResumeContent('non-existent-id');
} catch (error) {
  // AppError with category STORAGE
  // userMessage: "Resume not found: non-existent-id"
  // technicalDetails: "Resume content not found at path: resumes/non-existent-id/content.md..."
}
```

### 2. Service Unavailability (503)

**Scenario**: Obsidian vault is unavailable (connection timeout, network issues)

**Error Details**:
- **Category**: `ErrorCategory.NETWORK`
- **Severity**: `ErrorSeverity.HIGH`
- **User Message**: "Obsidian vault is currently unavailable"
- **Technical Details**: Includes connection error details
- **Recoverable**: `true`
- **Suggested Action**: "Please check your internet connection and try again."
- **Context**: Includes `resumeId`/`jobId` and `path`

**Triggers**:
- Error messages containing "unavailable"
- Error messages containing "timeout"
- Error messages containing "connection"

**Example**:
```typescript
try {
  const resume = await client.getResumeContent('resume-id');
} catch (error) {
  // AppError with category NETWORK
  // userMessage: "Obsidian vault is currently unavailable"
  // recoverable: true
}
```

### 3. Invalid Content Structure

**Scenario**: Retrieved content has invalid structure (missing fields, empty content, missing frontmatter)

**Error Details**:
- **Category**: `ErrorCategory.VALIDATION`
- **Severity**: `ErrorSeverity.LOW`
- **User Message**: Specific validation error (e.g., "Resume content is empty", "Invalid resume metadata")
- **Technical Details**: Describes what is missing or invalid
- **Recoverable**: `true`
- **Suggested Action**: "Please correct the highlighted fields and try again."
- **Context**: Includes `resumeId` and `path`

**Validation Checks**:
1. Content is not null/undefined
2. Content is not empty after stripping frontmatter
3. Frontmatter exists
4. For save operations: final score is between 0 and 1
5. For save operations: final resume content exists

**Example**:
```typescript
try {
  const resume = await client.getResumeContent('empty-resume');
} catch (error) {
  // AppError with category VALIDATION
  // userMessage: "Resume content is empty"
  // recoverable: true
}
```

### 4. Write Permission Errors

**Scenario**: Cannot write to vault (read-only, permission denied)

**Error Details**:
- **Category**: `ErrorCategory.STORAGE`
- **Severity**: `ErrorSeverity.HIGH`
- **User Message**: "Failed to save analysis result"
- **Technical Details**: Includes permission error details
- **Recoverable**: `false`
- **Suggested Action**: "Please check your Obsidian vault connection and try again."
- **Context**: Includes `jobId`, `resumeId`, and `path`

**Triggers**:
- Error messages containing "permission"
- Error messages containing "read-only"
- Error messages containing "write"

**Example**:
```typescript
try {
  await client.saveAnalysisResult(jobId, resumeId, result);
} catch (error) {
  // AppError with category STORAGE
  // userMessage: "Failed to save analysis result"
  // technicalDetails: "Write operation failed: Permission denied..."
}
```

## Error Response Structure

All errors thrown by the Obsidian client are instances of `AppError` with the following structure:

```typescript
interface AppError {
  category: ErrorCategory;        // STORAGE, NETWORK, VALIDATION, etc.
  severity: ErrorSeverity;        // LOW, MEDIUM, HIGH, CRITICAL
  userMessage: string;            // User-friendly message
  technicalDetails: string;       // Technical error details
  timestamp: Date;                // When the error occurred
  context?: Record<string, any>;  // Additional context (IDs, paths, etc.)
  recoverable: boolean;           // Whether the operation can be retried
  suggestedAction?: string;       // What the user should do
}
```

## Input Validation

Both methods validate inputs before attempting operations:

### getResumeContent
- Resume ID must not be empty or whitespace-only
- Throws `AppError` with `STORAGE` category if validation fails

### saveAnalysisResult
- Job ID must not be empty or whitespace-only
- Resume ID must not be empty or whitespace-only
- Result must not be null
- Final score must be between 0 and 1
- Final resume content must exist
- Throws `AppError` with `VALIDATION` or `STORAGE` category if validation fails

## Usage with Shared Error Handler

The implementation uses the shared error handler utilities:

```typescript
import { ErrorHandler } from '../../shared/errors/handler';
import { AppError, ErrorCategory } from '../../shared/errors/types';

// Wrap async operations
return ErrorHandler.handleAsync(
  async () => {
    // Operation logic
  },
  (error) => {
    // Error factory - convert to AppError
    if (error instanceof AppError) {
      return error;
    }
    return ErrorHandler.createStorageError(
      'User-friendly message',
      'Technical details',
      { context }
    );
  }
);
```

## Error Logging

All errors are automatically logged by the shared error handler with:
- Full error details
- Stack traces for unexpected errors
- Context information
- Timestamps

Access logs via:
```typescript
import { ErrorHandler } from '../../shared/errors/handler';

const logs = ErrorHandler.getLogs();
```

## Testing

Comprehensive tests cover all error scenarios:

1. **Missing resume content (404)** - 2 tests
2. **Service unavailability (503)** - 2 tests
3. **Invalid content structure** - 4 tests
4. **Write permission errors** - 1 test
5. **Input validation** - 4 tests
6. **Error response structure** - 2 tests

Total: 15 error handling tests + 12 success path tests = 27 tests

All tests verify:
- Correct error category
- User-friendly messages
- Technical details
- Context information
- Recoverability flags
- Suggested actions

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 9.2**: Handle missing resume content (404)
- **Requirement 9.3**: Validate retrieved content structure
- **Requirement 9.4**: Handle service unavailability (503)

All error handling uses the shared error handler from `src/shared/errors/handler.ts` as specified in the design document.
