# API Key Configuration - CRITICAL

## ALWAYS READ THIS FIRST

This project has a **VALID** OpenAI API key configured in the `.env` file at the project root.

## Environment Configuration

- **File Location**: `.env` (project root)
- **API Key Variable**: `OPENAI_API_KEY`
- **Provider**: `LLM_PROVIDER=openai`
- **Status**: ✅ VALID AND WORKING

## MANDATORY Rules for All Development

1. **ALWAYS load environment variables from `.env`** before running any code that uses the LLM
2. **NEVER hardcode API keys** - always use `process.env.OPENAI_API_KEY`
3. **NEVER skip API key validation** - the key exists and is valid
4. **ALWAYS use dotenv** to load the `.env` file in tests and examples

## Code Pattern to Use

```typescript
import dotenv from 'dotenv';
dotenv.config();

// The API key is now available
const apiKey = process.env.OPENAI_API_KEY;
```

## Testing Requirements

When writing or running tests:
- Load `.env` at the top of test files with `dotenv.config()`
- Do NOT mock the API key unless explicitly testing error handling
- Do NOT skip tests because "API key might not be configured" - it IS configured
- Use the real API key for integration tests

## Example Files

When creating example files:
- Include `dotenv.config()` at the top
- Reference the API key from environment variables
- Do NOT add warnings about "configure your API key" - it's already configured

## Common Mistakes to AVOID

❌ Assuming the API key doesn't exist
❌ Skipping tests due to "missing API key"
❌ Adding placeholder comments like "// Add your API key here"
❌ Mocking the LLM client when the real one should be used
❌ Forgetting to call `dotenv.config()` in new files

## If You Encounter API Key Issues

1. Verify `.env` file exists (it does)
2. Verify `dotenv` package is installed (it is)
3. Verify `dotenv.config()` is called before using the key
4. Check that the code is reading `process.env.OPENAI_API_KEY`

The API key is valid and working. Use it.
