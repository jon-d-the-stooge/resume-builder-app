# JSON Parsing Fix

## Problem

The ATS agent was failing with this error:
```
Failed to parse resume: Failed to parse LLM response as JSON: Unterminated string in JSON at position 17153 (line 274 column 178)
```

## Root Cause

The LLM was generating malformed JSON when resume text contained:
- Quotes (`"` or `'`)
- Newlines
- Special characters
- Long text that exceeded token limits

Without JSON mode enabled, the LLM would try to manually escape these characters and often fail, producing invalid JSON.

## Solution

Added OpenAI JSON mode support to force valid JSON output:

1. **Conditional JSON mode**: Only enabled for models that support it
   - `gpt-4o` ✅
   - `gpt-4-turbo` ✅  
   - `gpt-3.5-turbo-1106+` ✅
   - `gpt-4` ❌ (older model, no JSON mode)

2. **Better error messages**: When JSON parsing fails, provide actionable suggestions

3. **Fallback handling**: Gracefully handle models without JSON mode support

## Code Changes

### src/shared/llm/client.ts

```typescript
// Add JSON mode for models that support it
const supportsJsonMode = this.config.model.includes('gpt-4-turbo') || 
                         this.config.model.includes('gpt-4o') ||
                         this.config.model.includes('gpt-3.5-turbo-1106') ||
                         this.config.model.includes('gpt-3.5-turbo-0125');

if (supportsJsonMode) {
  requestOptions.response_format = { type: "json_object" };
}
```

### Improved error messages

```typescript
throw new Error(
  `Failed to parse LLM response as JSON: ${errorMsg}\n\n` +
  `Response preview (first 500 chars):\n${preview}\n\n` +
  `This usually means the LLM generated malformed JSON. Try:\n` +
  `1. Reducing the input size (shorter resume/job description)\n` +
  `2. Using a different model (gpt-4o, gpt-4-turbo support JSON mode)\n` +
  `3. Retrying the request`
);
```

## Testing

Run the test to verify the fix:

```bash
npx tsx test-json-mode-fix.ts
```

Expected output:
```
✅ SUCCESS! Resume parsed without JSON errors
   Found 10 elements
   Sections: 3
```

## Recommendations

1. **Use gpt-4o or gpt-4-turbo** for best results with JSON parsing
2. **Avoid gpt-4 (base)** - it doesn't support JSON mode and is more prone to malformed JSON
3. **Keep resumes under 10,000 characters** to avoid token limit issues
4. **Remove excessive special characters** if you still encounter issues

## Updated Examples

All examples now use `gpt-4o` by default instead of `gpt-4`:

```typescript
const llmClient = new LLMClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o', // Changed from 'gpt-4'
});
```

## What This Fixes

- ✅ Unterminated string errors
- ✅ Invalid escape sequence errors  
- ✅ Malformed JSON from special characters
- ✅ JSON parsing failures on long resumes
- ✅ Better error messages when parsing fails

## What This Doesn't Fix

- ❌ Token limit errors (resume too long)
- ❌ API rate limiting
- ❌ Network timeouts
- ❌ Invalid API keys

For these issues, see the troubleshooting guide in `ATS_AGENT_TESTING_GUIDE.md`.
