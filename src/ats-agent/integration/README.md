# ATS Agent Integration Module

This module provides integration with external systems, specifically the Obsidian vault for resume content retrieval and analysis result storage.

## Components

### ATSObsidianClient

The `ATSObsidianClient` class provides ATS-specific functionality for interacting with the Obsidian vault. It wraps the shared Obsidian MCP client from `src/shared/obsidian/client.ts`.

#### Key Features

1. **Resume Content Retrieval**: Fetches resume content from the vault using the resume-content-ingestion feature's data format
2. **Analysis Result Storage**: Saves optimization results to the vault with comprehensive metadata
3. **Error Handling**: Provides clear error messages for missing content and vault unavailability
4. **Data Format Compatibility**: Uses the same path structure as resume-content-ingestion

#### Usage

```typescript
import { atsObsidianClient } from './integration';

// Retrieve resume content
const resume = await atsObsidianClient.getResumeContent('resume-123');

// Save analysis result
await atsObsidianClient.saveAnalysisResult(
  'job-456',
  'resume-123',
  optimizationResult
);
```

#### Data Formats

**Resume Path Format**: `resumes/{resumeId}/content.md`

This follows the resume-content-ingestion feature's structure.

**Analysis Result Path Format**: `analyses/{jobId}-{resumeId}/result.md`

Analysis results are stored with:
- Comprehensive frontmatter including metrics and metadata
- Markdown-formatted summary with scores and iteration history
- Top priority recommendations from each iteration
- Final optimized resume content

#### Implementation Details

**getResumeContent(resumeId: string)**:
- Reads note from vault at `resumes/{resumeId}/content.md`
- Strips YAML frontmatter to return clean content
- Validates content is not empty
- Returns Resume object with metadata including retrieval timestamp

**saveAnalysisResult(jobId, resumeId, result)**:
- Constructs path at `analyses/{jobId}-{resumeId}/result.md`
- Builds comprehensive markdown with:
  - Summary section with scores and metrics
  - Iteration history with recommendations
  - Final resume content in code block
- Creates frontmatter with:
  - Tags: `['ats-analysis', 'job-match', jobId, resumeId]`
  - Metadata: scores, iteration count, termination reason, improvement
- Writes to vault using shared client

**stripFrontmatter(content: string)**:
- Helper method to extract content without YAML frontmatter
- Handles content that starts with `---\n` delimiter
- Returns trimmed content after closing delimiter

#### Error Handling

The client provides clear error messages for common scenarios:

1. **Resume Not Found**: Suggests using resume-content-ingestion feature
2. **Empty Content**: Validates content is not empty after stripping frontmatter
3. **Vault Unavailable**: Re-throws with context about the operation that failed

#### Testing

Comprehensive unit tests cover:
- Successful resume retrieval
- Error cases (not found, empty content)
- Metadata inclusion (timestamps, frontmatter)
- Analysis result storage with all metrics
- Termination reason formatting
- Iteration history inclusion
- Final resume formatting
- Path format compatibility with resume-content-ingestion

All tests use the shared Obsidian client's mock storage for isolation.

## Integration with Shared Infrastructure

This module leverages the shared Obsidian MCP client from `src/shared/obsidian/client.ts`, which provides:
- Note reading and writing operations
- YAML frontmatter handling
- Search and query capabilities
- Mock storage for testing

By using the shared client, the ATS agent maintains consistency with the resume-content-ingestion feature and benefits from shared error handling and retry logic.

## Requirements Satisfied

This implementation satisfies **Requirement 9.1**:
> WHEN resume content is needed, THE ATS_Agent SHALL query the Obsidian_Vault using the resume-content-ingestion feature's data format

The client:
- ✅ Uses the correct path format (`resumes/{resumeId}/content.md`)
- ✅ Handles the data structure from resume-content-ingestion
- ✅ Provides error handling for missing content
- ✅ Saves analysis results in a structured format
- ✅ Includes comprehensive metadata for traceability
