/**
 * Obsidian MCP Client (Legacy)
 * 
 * This file re-exports the shared Obsidian client for backward compatibility.
 * New code should import from 'src/shared/obsidian' instead.
 * 
 * @deprecated Use src/shared/obsidian instead
 */

export {
  ObsidianMCPClient,
  ObsidianMCPClientImpl,
  obsidianClient
} from '../shared/obsidian/client';

export {
  Frontmatter,
  NoteContent,
  ObsidianQuery,
  NoteSearchResult,
  ContentType
} from '../shared/obsidian/types';
