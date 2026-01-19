/**
 * Shared Infrastructure
 * 
 * Reusable components extracted from resume-content-ingestion feature.
 * Used by both resume-content-ingestion and ats-agent features.
 * 
 * Modules:
 * - llm: Unified LLM client (Anthropic + OpenAI)
 * - obsidian: Obsidian MCP client
 * - validation: Common validation utilities
 * - errors: Error handling and logging
 * - types: Shared type definitions
 */

export * from './llm';
export * from './obsidian';
export * from './validation';
export * from './errors';
export * from './types';
