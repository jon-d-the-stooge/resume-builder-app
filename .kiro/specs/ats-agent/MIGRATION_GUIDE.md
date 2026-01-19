# Migration Guide: Using Shared Infrastructure

This guide helps developers migrate from feature-specific implementations to the shared infrastructure components.

## Overview

The shared infrastructure (located in `src/shared/`) provides reusable components that both `resume-content-ingestion` and `ats-agent` features use. This eliminates code duplication and ensures consistency.

## What's Available

### 1. LLM Client (`src/shared/llm/`)

**Before (feature-specific):**
```typescript
import { parserAgent } from '@/main/parserAgent';

const result = await parserAgent.parse(resumeText);
```

**After (shared):**
```typescript
import { LLMClient, createLLMClientFromEnv } from '@/shared/llm';

const client = createLLMClientFromEnv();
const response = await client.complete({
  systemPrompt: 'You are a resume parser...',
  messages: [{ role: 'user', content: resumeText }]
});
const result = client.parseJsonResponse(response.content);
```

**Benefits:**
- Unified interface for Anthropic and OpenAI
- Built-in caching (reduces API costs by ~70%)
- Automatic retry logic
- JSON parsing with markdown code block handling

### 2. Obsidian Client (`src/shared/obsidian/`)

**Before (feature-specific):**
```typescript
import { obsidianClient } from '@/main/obsidianClient';

const content = await obsidianClient.getNote(path);
```

**After (shared):**
```typescript
import { ObsidianClient } from '@/shared/obsidian';

const client = new ObsidianClient();
const note = await client.readNote(path);
console.log(note.content, note.frontmatter);
```

**Benefits:**
- Consistent error handling
- Retry logic for transient errors
- Support for frontmatter
- Search and query utilities

### 3. Validation (`src/shared/validation/`)

**Before (feature-specific):**
```typescript
import { contentValidator } from '@/main/contentValidator';

const isValid = contentValidator.validate(data);
```

**After (shared):**
```typescript
import { validateSchema } from '@/shared/validation';
import { resumeSchema } from '@/shared/validation/schemas';

const result = validateSchema(data, resumeSchema);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

**Benefits:**
- Zod-based type-safe validation
- Descriptive error messages
- Reusable schemas
- Custom schema support

### 4. Error Handling (`src/shared/errors/`)

**Before (feature-specific):**
```typescript
import { errorHandler } from '@/main/errorHandler';

errorHandler.handle(error);
```

**After (shared):**
```typescript
import { handleError, ErrorCode, AppError } from '@/shared/errors';

// Handle errors
handleError(error, ErrorCode.INTEGRATION_ERROR, {
  context: 'Fetching resume',
  resumeId: 'abc123'
});

// Create custom errors
throw new AppError(
  'Resume not found',
  ErrorCode.NOT_FOUND,
  { resumeId: 'abc123' }
);
```

**Benefits:**
- Standardized error codes
- Automatic logging
- Context preservation
- Retryable error detection

### 5. Common Types (`src/shared/types/`)

**Before (feature-specific):**
```typescript
import { DateRange } from '@/types';
```

**After (shared):**
```typescript
import type { DateRange, Location, ContentMetadata } from '@/shared/types';
```

**Benefits:**
- Single source of truth
- Type consistency across features
- Comprehensive type definitions

## Migration Steps

### Step 1: Update Imports

Replace feature-specific imports with shared imports:

```typescript
// Old
import { parserAgent } from '@/main/parserAgent';
import { obsidianClient } from '@/main/obsidianClient';
import { contentValidator } from '@/main/contentValidator';
import { errorHandler } from '@/main/errorHandler';

// New
import { LLMClient, createLLMClientFromEnv } from '@/shared/llm';
import { ObsidianClient } from '@/shared/obsidian';
import { validateSchema } from '@/shared/validation';
import { handleError, ErrorCode } from '@/shared/errors';
```

### Step 2: Update Configuration

Use shared configuration types:

```typescript
import { LLMConfig, DEFAULT_LLM_CONFIG } from '@/shared/llm/types';

const config: LLMConfig = {
  ...DEFAULT_LLM_CONFIG.anthropic,
  apiKey: process.env.ANTHROPIC_API_KEY!
};
```

### Step 3: Update Error Handling

Use shared error handling:

```typescript
import { handleError, ErrorCode, AppError } from '@/shared/errors';

try {
  // ... operation
} catch (error) {
  handleError(error, ErrorCode.INTEGRATION_ERROR, {
    context: 'Operation description',
    additionalData: { /* ... */ }
  });
}
```

### Step 4: Update Tests

Update test imports and assertions:

```typescript
// Old
import { parserAgent } from '@/main/parserAgent';

// New
import { LLMClient } from '@/shared/llm';

describe('Parser', () => {
  let client: LLMClient;
  
  beforeEach(() => {
    client = new LLMClient({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
      temperature: 0,
      maxTokens: 4096,
      timeout: 30000
    });
  });
  
  // ... tests
});
```

### Step 5: Run Tests

Verify everything works:

```bash
# Run all tests
npm test

# Run shared infrastructure tests
npm test src/tests/shared/

# Run feature-specific tests
npm test src/tests/parserAgent.test.ts
```

## Common Patterns

### Pattern 1: LLM Request with Caching

```typescript
import { createLLMClientFromEnv } from '@/shared/llm';

const client = createLLMClientFromEnv();

// First call - hits API
const response1 = await client.complete({
  systemPrompt: 'Parse this resume',
  messages: [{ role: 'user', content: resumeText }]
});

// Second call with same input - uses cache
const response2 = await client.complete({
  systemPrompt: 'Parse this resume',
  messages: [{ role: 'user', content: resumeText }]
});

// Check cache stats
const stats = client.getCacheStats();
console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
```

### Pattern 2: Obsidian with Error Handling

```typescript
import { ObsidianClient } from '@/shared/obsidian';
import { handleError, ErrorCode } from '@/shared/errors';

const client = new ObsidianClient();

try {
  const note = await client.readNote('resumes/john-doe.md');
  // Process note
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    // Create new note
    await client.writeNote('resumes/john-doe.md', {
      content: 'New resume content',
      frontmatter: { created: new Date().toISOString() }
    });
  } else {
    handleError(error, ErrorCode.INTEGRATION_ERROR);
  }
}
```

### Pattern 3: Validation with Custom Errors

```typescript
import { validateSchema } from '@/shared/validation';
import { resumeSchema } from '@/shared/validation/schemas';
import { AppError, ErrorCode } from '@/shared/errors';

const result = validateSchema(resumeData, resumeSchema);
if (!result.valid) {
  throw new AppError(
    'Invalid resume data',
    ErrorCode.INVALID_INPUT,
    { 
      errors: result.errors,
      resumeId: resumeData.id 
    }
  );
}
```

## Best Practices

### 1. Always Use Caching

```typescript
// Good - caching enabled by default
const client = createLLMClientFromEnv();

// Bad - disabling cache unnecessarily
const client = new LLMClient(config, { enabled: false });
```

### 2. Validate Early

```typescript
// Good - validate before processing
const result = validateSchema(input, schema);
if (!result.valid) {
  throw new AppError('Invalid input', ErrorCode.INVALID_INPUT);
}
processInput(input);

// Bad - process then validate
processInput(input);
validateSchema(input, schema);
```

### 3. Handle Errors Gracefully

```typescript
// Good - specific error handling
try {
  const note = await client.readNote(path);
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    // Handle missing note
  } else if (error.code === 'SERVICE_UNAVAILABLE') {
    // Handle service down
  } else {
    handleError(error, ErrorCode.INTEGRATION_ERROR);
  }
}

// Bad - generic error handling
try {
  const note = await client.readNote(path);
} catch (error) {
  console.error(error);
}
```

### 4. Use Type Safety

```typescript
// Good - use shared types
import type { DateRange, Location } from '@/shared/types';

const dateRange: DateRange = {
  start: '2020-01',
  end: '2023-12',
  current: false
};

// Bad - inline types
const dateRange = {
  start: '2020-01',
  end: '2023-12'
};
```

## Troubleshooting

### Issue: Import Errors

**Problem:** `Cannot find module '@/shared/llm'`

**Solution:** Check your TypeScript path configuration in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Issue: Cache Not Working

**Problem:** LLM client always hits API, never uses cache

**Solution:** Ensure cache is enabled and inputs are identical:
```typescript
const client = createLLMClientFromEnv();
const stats = client.getCacheStats();
console.log('Cache enabled:', stats.maxEntries > 0);
```

### Issue: Validation Failing

**Problem:** Validation fails with unclear error messages

**Solution:** Check the schema definition and add custom error messages:
```typescript
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().min(0, 'Age must be positive')
});
```

## Testing

### Unit Tests

```typescript
import { LLMClient } from '@/shared/llm';

describe('Feature using LLM Client', () => {
  let client: LLMClient;
  
  beforeEach(() => {
    client = new LLMClient({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
      temperature: 0,
      maxTokens: 4096,
      timeout: 30000
    });
  });
  
  it('should parse resume', async () => {
    const response = await client.complete({
      systemPrompt: 'Parse resume',
      messages: [{ role: 'user', content: 'Resume text' }]
    });
    
    expect(response.content).toBeDefined();
  });
});
```

### Integration Tests

```typescript
import { ObsidianClient } from '@/shared/obsidian';

describe('Feature using Obsidian', () => {
  let client: ObsidianClient;
  
  beforeEach(() => {
    client = new ObsidianClient();
  });
  
  it('should read and write notes', async () => {
    await client.writeNote('test.md', {
      content: 'Test content',
      frontmatter: { test: true }
    });
    
    const note = await client.readNote('test.md');
    expect(note.content).toBe('Test content');
    expect(note.frontmatter.test).toBe(true);
  });
});
```

## Additional Resources

- [Shared Infrastructure README](../../src/shared/README.md)
- [Testing Guide](../../TESTING.md)
- [ATS Agent Design Document](./design.md)
- [Resume Content Ingestion Design](../resume-content-ingestion/design.md)

## Support

For questions or issues:

1. Check the [Shared Infrastructure README](../../src/shared/README.md)
2. Review test files in `src/tests/shared/` for examples
3. Check the design documents for architectural context
4. Review source code comments for implementation details
