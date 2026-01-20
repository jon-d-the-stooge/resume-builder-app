/**
 * Knowledge Base Store Module
 *
 * Stores optimized resumes and their analysis data in the vault's KnowledgeBase/ folder.
 * Automatically archives every successful optimization for later retrieval, editing, and export.
 *
 * Each entry is stored as a markdown file with YAML frontmatter containing:
 * - Job metadata (title, company, URL)
 * - Analysis results (scores, strengths, gaps, recommendations)
 * - Optimized resume content
 * - User notes and tags
 */

import * as fs from 'fs';
import * as path from 'path';
import { obsidianClient } from './obsidianClient';

// ============================================================================
// Type Definitions
// ============================================================================

export interface KnowledgeBaseRecommendation {
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
  rationale?: string;
}

export interface KnowledgeBaseAnalysis {
  finalScore: number;          // 0.0 - 1.0
  initialScore: number;
  iterations: number;
  strengths: string[];
  gaps: string[];
  recommendations: KnowledgeBaseRecommendation[];
}

export interface KnowledgeBaseEntry {
  id: string;                  // Format: kb-{timestamp}-{random6}
  jobTitle: string;
  company: string;
  jobDescription: string;
  sourceUrl?: string;
  optimizedResume: string;     // Markdown content
  analysis: KnowledgeBaseAnalysis;
  createdAt: string;           // ISO 8601
  notes?: string;
  tags?: string[];
}

export interface KnowledgeBaseSummary {
  id: string;
  jobTitle: string;
  company: string;
  score: number;
  createdAt: string;
  tags?: string[];
}

export interface KnowledgeBaseStats {
  total: number;
  averageScore: number;
  thisWeek: number;
  uniqueCompanies: number;
}

export interface KnowledgeBaseFilters {
  company?: string;
  text?: string;
  sortBy?: 'date' | 'score' | 'company';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Constants
// ============================================================================

const KNOWLEDGE_BASE_FOLDER = 'KnowledgeBase';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for a knowledge base entry
 */
function generateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `kb-${timestamp}-${random}`;
}

/**
 * Sanitize a string for use in filenames
 */
function sanitize(str: string): string {
  return (str || '').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
}

/**
 * Generate a filename from entry data
 */
function generateFilename(entry: { id: string; company: string; jobTitle: string }): string {
  const safeCompany = sanitize(entry.company).substring(0, 30) || 'Unknown';
  const safeTitle = sanitize(entry.jobTitle).substring(0, 40) || 'Job';
  return `${safeCompany}-${safeTitle}-${entry.id}.md`;
}

/**
 * Get the path to the KnowledgeBase folder in the vault
 */
function getKnowledgeBasePath(): string | null {
  const vaultPath = obsidianClient.getVaultRootPath();
  if (!vaultPath) {
    return null;
  }
  return path.join(vaultPath, KNOWLEDGE_BASE_FOLDER);
}

/**
 * Ensure the KnowledgeBase folder exists
 */
function ensureKnowledgeBaseFolder(): string | null {
  const kbPath = getKnowledgeBasePath();
  if (!kbPath) {
    return null;
  }

  if (!fs.existsSync(kbPath)) {
    fs.mkdirSync(kbPath, { recursive: true });
    console.log(`[KnowledgeBase] Created folder: ${kbPath}`);
  }

  return kbPath;
}

/**
 * Escape a string for safe YAML output
 */
function escapeYaml(str: string): string {
  if (!str) return '""';
  // If string contains special chars or newlines, use quotes
  if (/[:\n"'#\[\]{}|>&*!?]/.test(str) || str.trim() !== str) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return str;
}

/**
 * Format a YAML array
 */
function formatYamlArray(arr: string[], indent: number = 2): string {
  if (!arr || arr.length === 0) return '[]';
  const spaces = ' '.repeat(indent);
  return '\n' + arr.map(item => `${spaces}- ${escapeYaml(item)}`).join('\n');
}

/**
 * Format recommendations for YAML
 */
function formatRecommendations(recs: KnowledgeBaseRecommendation[]): string {
  if (!recs || recs.length === 0) return '[]';
  const lines: string[] = [];
  for (const rec of recs) {
    lines.push(`  - priority: ${rec.priority}`);
    lines.push(`    suggestion: ${escapeYaml(rec.suggestion)}`);
    if (rec.rationale) {
      lines.push(`    rationale: ${escapeYaml(rec.rationale)}`);
    }
  }
  return '\n' + lines.join('\n');
}

/**
 * Generate markdown content for a knowledge base entry
 */
function generateMarkdown(entry: KnowledgeBaseEntry): string {
  const frontmatter = `---
type: knowledge-base-entry
id: ${entry.id}
job_title: ${escapeYaml(entry.jobTitle)}
company: ${escapeYaml(entry.company)}
source_url: ${entry.sourceUrl || ''}
score: ${entry.analysis.finalScore}
initial_score: ${entry.analysis.initialScore}
iterations: ${entry.analysis.iterations}
strengths:${formatYamlArray(entry.analysis.strengths)}
gaps:${formatYamlArray(entry.analysis.gaps)}
recommendations:${formatRecommendations(entry.analysis.recommendations)}
created_at: ${entry.createdAt}
tags:${formatYamlArray(entry.tags || [])}
notes: ${escapeYaml(entry.notes || '')}
---

`;

  const body = `# Optimized Resume

${entry.optimizedResume}

---

# Job Description

${entry.jobDescription}
`;

  return frontmatter + body;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const frontmatter: Record<string, any> = {};

  // Simple YAML parser for our known structure
  let currentKey = '';
  let currentArray: any[] = [];
  let inArray = false;
  let inRecommendations = false;
  let currentRec: any = {};

  for (const line of frontmatterStr.split('\n')) {
    // Check for array continuation
    if (line.match(/^\s+-\s/) && inArray) {
      if (inRecommendations) {
        // Check if this is a new recommendation (starts with priority)
        const priorityMatch = line.match(/^\s+-\s+priority:\s*(.+)$/);
        if (priorityMatch) {
          if (Object.keys(currentRec).length > 0) {
            currentArray.push(currentRec);
          }
          currentRec = { priority: priorityMatch[1].trim() };
        }
      } else {
        // Regular array item
        const value = line.replace(/^\s+-\s*/, '').trim();
        currentArray.push(parseYamlValue(value));
      }
      continue;
    }

    // Check for recommendation sub-properties
    if (inRecommendations && line.match(/^\s+\w+:/)) {
      const subMatch = line.match(/^\s+(\w+):\s*(.*)$/);
      if (subMatch) {
        currentRec[subMatch[1]] = parseYamlValue(subMatch[2]);
      }
      continue;
    }

    // Check for new key
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch) {
      // Save previous array if any
      if (inArray && currentKey) {
        if (inRecommendations && Object.keys(currentRec).length > 0) {
          currentArray.push(currentRec);
        }
        frontmatter[currentKey] = currentArray;
      }

      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();

      if (value === '' || value === '[]') {
        // Might be start of array
        inArray = true;
        inRecommendations = currentKey === 'recommendations';
        currentArray = [];
        currentRec = {};
        if (value === '[]') {
          frontmatter[currentKey] = [];
          inArray = false;
          inRecommendations = false;
        }
      } else {
        inArray = false;
        inRecommendations = false;
        frontmatter[currentKey] = parseYamlValue(value);
      }
    }
  }

  // Save last array if any
  if (inArray && currentKey) {
    if (inRecommendations && Object.keys(currentRec).length > 0) {
      currentArray.push(currentRec);
    }
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter, body: match[2] };
}

/**
 * Parse a YAML value
 */
function parseYamlValue(value: string): any {
  if (!value) return '';

  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  // Parse numbers
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // Parse booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  return value;
}

/**
 * Parse a KnowledgeBaseEntry from a markdown file
 */
function parseEntry(filePath: string): KnowledgeBaseEntry | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (frontmatter.type !== 'knowledge-base-entry') {
      return null;
    }

    // Parse resume and job description from body
    const resumeMatch = body.match(/# Optimized Resume\n\n([\s\S]*?)(?=\n---\n|\n# Job Description|$)/);
    const jobDescMatch = body.match(/# Job Description\n\n([\s\S]*?)$/);

    return {
      id: frontmatter.id || path.basename(filePath, '.md'),
      jobTitle: frontmatter.job_title || '',
      company: frontmatter.company || '',
      jobDescription: jobDescMatch ? jobDescMatch[1].trim() : '',
      sourceUrl: frontmatter.source_url || undefined,
      optimizedResume: resumeMatch ? resumeMatch[1].trim() : '',
      analysis: {
        finalScore: frontmatter.score || 0,
        initialScore: frontmatter.initial_score || 0,
        iterations: frontmatter.iterations || 1,
        strengths: frontmatter.strengths || [],
        gaps: frontmatter.gaps || [],
        recommendations: frontmatter.recommendations || []
      },
      createdAt: frontmatter.created_at || '',
      notes: frontmatter.notes || undefined,
      tags: frontmatter.tags || []
    };
  } catch (error) {
    console.error(`[KnowledgeBase] Error parsing file ${filePath}:`, error);
    return null;
  }
}

// ============================================================================
// Exported API
// ============================================================================

export const knowledgeBaseStore = {
  /**
   * List all knowledge base entries with optional filtering and sorting
   */
  list: (filters?: KnowledgeBaseFilters): KnowledgeBaseSummary[] => {
    const kbPath = getKnowledgeBasePath();
    if (!kbPath || !fs.existsSync(kbPath)) {
      return [];
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.md'));
    let entries: KnowledgeBaseSummary[] = [];

    for (const file of files) {
      const entry = parseEntry(path.join(kbPath, file));
      if (entry) {
        // Apply company filter
        if (filters?.company && entry.company !== filters.company) {
          continue;
        }

        // Apply text search filter
        if (filters?.text) {
          const searchText = filters.text.toLowerCase();
          const matchesText =
            entry.jobTitle.toLowerCase().includes(searchText) ||
            entry.company.toLowerCase().includes(searchText) ||
            entry.jobDescription.toLowerCase().includes(searchText) ||
            (entry.tags && entry.tags.some(t => t.toLowerCase().includes(searchText)));

          if (!matchesText) {
            continue;
          }
        }

        entries.push({
          id: entry.id,
          jobTitle: entry.jobTitle,
          company: entry.company,
          score: entry.analysis.finalScore,
          createdAt: entry.createdAt,
          tags: entry.tags
        });
      }
    }

    // Sort
    const sortBy = filters?.sortBy || 'date';
    const sortOrder = filters?.sortOrder || 'desc';
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    entries.sort((a, b) => {
      if (sortBy === 'date') {
        return multiplier * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (sortBy === 'score') {
        return multiplier * (b.score - a.score);
      } else if (sortBy === 'company') {
        return multiplier * a.company.localeCompare(b.company);
      }
      return 0;
    });

    console.log(`[KnowledgeBase] Listed ${entries.length} entries`);
    return entries;
  },

  /**
   * Get a single entry by ID
   */
  get: (id: string): KnowledgeBaseEntry | null => {
    const kbPath = getKnowledgeBasePath();
    if (!kbPath || !fs.existsSync(kbPath)) {
      return null;
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      if (file.includes(id)) {
        const entry = parseEntry(path.join(kbPath, file));
        if (entry && entry.id === id) {
          console.log(`[KnowledgeBase] Found entry: ${id}`);
          return entry;
        }
      }
    }

    console.log(`[KnowledgeBase] Entry not found: ${id}`);
    return null;
  },

  /**
   * Save a new knowledge base entry
   */
  save: (data: Omit<KnowledgeBaseEntry, 'id' | 'createdAt'>): KnowledgeBaseEntry | null => {
    const kbPath = ensureKnowledgeBaseFolder();
    if (!kbPath) {
      console.error('[KnowledgeBase] Cannot save: vault path not configured');
      return null;
    }

    const id = generateId();
    const now = new Date().toISOString();

    const entry: KnowledgeBaseEntry = {
      id,
      jobTitle: data.jobTitle,
      company: data.company,
      jobDescription: data.jobDescription,
      sourceUrl: data.sourceUrl,
      optimizedResume: data.optimizedResume,
      analysis: data.analysis,
      createdAt: now,
      notes: data.notes,
      tags: data.tags
    };

    const filename = generateFilename(entry);
    const filePath = path.join(kbPath, filename);
    const markdown = generateMarkdown(entry);

    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`[KnowledgeBase] Saved entry: ${id} to ${filename}`);

    return entry;
  },

  /**
   * Update an existing entry (notes, tags, or resume content)
   */
  update: (id: string, updates: {
    notes?: string;
    tags?: string[];
    optimizedResume?: string;
  }): KnowledgeBaseEntry | null => {
    const kbPath = getKnowledgeBasePath();
    if (!kbPath || !fs.existsSync(kbPath)) {
      return null;
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      if (file.includes(id)) {
        const filePath = path.join(kbPath, file);
        const entry = parseEntry(filePath);

        if (entry && entry.id === id) {
          // Apply updates
          if (updates.notes !== undefined) {
            entry.notes = updates.notes;
          }
          if (updates.tags !== undefined) {
            entry.tags = updates.tags;
          }
          if (updates.optimizedResume !== undefined) {
            entry.optimizedResume = updates.optimizedResume;
          }

          // Write back
          const markdown = generateMarkdown(entry);
          fs.writeFileSync(filePath, markdown, 'utf-8');
          console.log(`[KnowledgeBase] Updated entry: ${id}`);

          return entry;
        }
      }
    }

    console.log(`[KnowledgeBase] Entry not found for update: ${id}`);
    return null;
  },

  /**
   * Delete an entry
   */
  delete: (id: string): boolean => {
    const kbPath = getKnowledgeBasePath();
    if (!kbPath || !fs.existsSync(kbPath)) {
      return false;
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      if (file.includes(id)) {
        const filePath = path.join(kbPath, file);
        const entry = parseEntry(filePath);

        if (entry && entry.id === id) {
          fs.unlinkSync(filePath);
          console.log(`[KnowledgeBase] Deleted entry: ${id}`);
          return true;
        }
      }
    }

    console.log(`[KnowledgeBase] Entry not found for deletion: ${id}`);
    return false;
  },

  /**
   * Get statistics about knowledge base entries
   */
  getStats: (): KnowledgeBaseStats => {
    const kbPath = getKnowledgeBasePath();
    if (!kbPath || !fs.existsSync(kbPath)) {
      return {
        total: 0,
        averageScore: 0,
        thisWeek: 0,
        uniqueCompanies: 0
      };
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.md'));
    const companies = new Set<string>();
    let totalScore = 0;
    let thisWeekCount = 0;
    let validEntries = 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const file of files) {
      const entry = parseEntry(path.join(kbPath, file));
      if (entry) {
        validEntries++;
        companies.add(entry.company);
        totalScore += entry.analysis.finalScore;

        if (new Date(entry.createdAt) >= sevenDaysAgo) {
          thisWeekCount++;
        }
      }
    }

    return {
      total: validEntries,
      averageScore: validEntries > 0 ? totalScore / validEntries : 0,
      thisWeek: thisWeekCount,
      uniqueCompanies: companies.size
    };
  },

  /**
   * Get list of unique companies for filter dropdown
   */
  getCompanies: (): string[] => {
    const kbPath = getKnowledgeBasePath();
    if (!kbPath || !fs.existsSync(kbPath)) {
      return [];
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.md'));
    const companies = new Set<string>();

    for (const file of files) {
      const entry = parseEntry(path.join(kbPath, file));
      if (entry && entry.company) {
        companies.add(entry.company);
      }
    }

    return Array.from(companies).sort();
  }
};
