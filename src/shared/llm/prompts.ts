/**
 * LLM Prompts
 * 
 * Common prompt utilities and templates for LLM interactions.
 */

/**
 * Generate a unique ID for content items
 */
export function generateId(type: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}-${timestamp}-${random}`;
}

/**
 * Build a structured prompt with clear instructions
 */
export function buildStructuredPrompt(
  task: string,
  instructions: string[],
  examples?: Array<{ input: string; output: string }>,
  outputFormat?: string
): string {
  let prompt = `${task}\n\n`;

  if (instructions.length > 0) {
    prompt += 'INSTRUCTIONS:\n';
    instructions.forEach((instruction, i) => {
      prompt += `${i + 1}. ${instruction}\n`;
    });
    prompt += '\n';
  }

  if (examples && examples.length > 0) {
    prompt += 'EXAMPLES:\n\n';
    examples.forEach((example, i) => {
      prompt += `Example ${i + 1}:\n`;
      prompt += `Input: ${example.input}\n`;
      prompt += `Output: ${example.output}\n\n`;
    });
  }

  if (outputFormat) {
    prompt += `OUTPUT FORMAT:\n${outputFormat}\n\n`;
  }

  return prompt;
}

/**
 * Escape special characters in text for safe inclusion in prompts
 */
export function escapePromptText(text: string): string {
  // Remove or escape characters that might interfere with prompt parsing
  return text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\r/g, '\n')    // Normalize line endings
    .trim();
}

/**
 * Truncate text to a maximum length while preserving word boundaries
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Format a list of items for inclusion in a prompt
 */
export function formatList(items: string[], numbered: boolean = false): string {
  if (numbered) {
    return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  }
  return items.map(item => `- ${item}`).join('\n');
}

/**
 * Create a JSON schema description for structured output
 */
export function describeJsonSchema(schema: Record<string, any>): string {
  return JSON.stringify(schema, null, 2);
}
