/**
 * Applications Store Module
 *
 * Stores completed resume optimizations as markdown files in the vault's Applications/ folder.
 * Solves the UX problem: previously generated resumes not retrievable.
 *
 * Each application is stored as a markdown file with YAML frontmatter containing:
 * - Application metadata (job title, company, date, status)
 * - Generated resume content
 * - Optimization results (score, iterations)
 */

import * as fs from 'fs';
import * as path from 'path';
import { obsidianClient } from './obsidianClient';

// ============================================================================
// Type Definitions
// ============================================================================

export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'interviewing'
  | 'offered'
  | 'rejected'
  | 'withdrawn';

export interface ApplicationMetadata {
  optimizedAt: string;
  iterations: number;
  initialScore: number;
}

export interface Application {
  id: string;
  userId?: string; // Owner of this application (for multi-user support)
  jobTitle: string;
  company: string;
  date: string;
  jobDescription: string;
  generatedResume: string;
  score: number;
  status: ApplicationStatus;
  sourceUrl?: string;
  notes?: string;
  metadata: ApplicationMetadata;
}

export interface ApplicationSummary {
  id: string;
  userId?: string; // Owner of this application (for multi-user support)
  jobTitle: string;
  company: string;
  date: string;
  score: number;
  status: ApplicationStatus;
}

// ============================================================================
// Constants
// ============================================================================

const APPLICATIONS_FOLDER = 'Applications';

/**
 * Default user ID for backward compatibility when userId is not provided
 */
const DEFAULT_USER_ID = 'default';

/**
 * Get effective userId, falling back to default for backward compatibility
 */
function getEffectiveUserId(userId: string | undefined): string {
  return userId || DEFAULT_USER_ID;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the path to the Applications folder in the vault
 */
function getApplicationsPath(): string | null {
  const vaultPath = obsidianClient.getVaultRootPath();
  if (!vaultPath) {
    return null;
  }
  return path.join(vaultPath, APPLICATIONS_FOLDER);
}

/**
 * Ensure the Applications folder exists
 */
function ensureApplicationsFolder(): string | null {
  const applicationsPath = getApplicationsPath();
  if (!applicationsPath) {
    return null;
  }

  if (!fs.existsSync(applicationsPath)) {
    fs.mkdirSync(applicationsPath, { recursive: true });
    console.log(`[Applications] Created folder: ${applicationsPath}`);
  }

  return applicationsPath;
}

/**
 * Generate a safe filename from job title and company
 */
function generateFilename(id: string, jobTitle: string, company: string): string {
  const safeTitle = (jobTitle || 'job').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 40);
  const safeCompany = (company || 'company').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 30);
  return `${safeCompany}-${safeTitle}-${id}.md`;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = match[1].split('\n');
  const frontmatter: Record<string, any> = {};

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value: any = line.substring(colonIndex + 1).trim();

      // Parse numbers
      if (/^\d+(\.\d+)?$/.test(value)) {
        value = parseFloat(value);
      }
      // Parse booleans
      else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      }
      // Remove quotes from strings
      else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2] };
}

/**
 * Generate markdown content for an application
 */
function generateMarkdown(app: Application): string {
  // Escape special characters in YAML strings
  const escapeYaml = (str: string): string => {
    if (!str) return '""';
    // If string contains special chars or newlines, use quotes
    if (/[:\n"']/.test(str) || str.includes('#')) {
      return `"${str.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return str;
  };

  const frontmatter = `---
type: application
id: ${app.id}
user_id: ${app.userId || ''}
job_title: ${escapeYaml(app.jobTitle)}
company: ${escapeYaml(app.company)}
date: ${app.date}
score: ${app.score}
status: ${app.status}
source_url: ${app.sourceUrl || ''}
notes: ${escapeYaml(app.notes || '')}
optimized_at: ${app.metadata.optimizedAt}
iterations: ${app.metadata.iterations}
initial_score: ${app.metadata.initialScore}
---

`;

  const body = `# ${app.jobTitle} at ${app.company}

## Job Description

${app.jobDescription}

## Optimized Resume

${app.generatedResume}
`;

  return frontmatter + body;
}

/**
 * Parse an Application from a markdown file
 */
function parseApplication(filePath: string): Application | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (frontmatter.type !== 'application') {
      return null;
    }

    // Parse job description and resume from body
    const jobDescMatch = body.match(/## Job Description\n\n([\s\S]*?)(?=\n## Optimized Resume|\n## |$)/);
    const resumeMatch = body.match(/## Optimized Resume\n\n([\s\S]*?)$/);

    return {
      id: frontmatter.id || path.basename(filePath, '.md'),
      userId: frontmatter.user_id || undefined,
      jobTitle: frontmatter.job_title || '',
      company: frontmatter.company || '',
      date: frontmatter.date || '',
      jobDescription: jobDescMatch ? jobDescMatch[1].trim() : '',
      generatedResume: resumeMatch ? resumeMatch[1].trim() : '',
      score: frontmatter.score || 0,
      status: frontmatter.status || 'saved',
      sourceUrl: frontmatter.source_url || undefined,
      notes: frontmatter.notes || undefined,
      metadata: {
        optimizedAt: frontmatter.optimized_at || '',
        iterations: frontmatter.iterations || 1,
        initialScore: frontmatter.initial_score || 0
      }
    };
  } catch (error) {
    console.error(`[Applications] Error parsing file ${filePath}:`, error);
    return null;
  }
}

// ============================================================================
// Exported API
// ============================================================================

export const applicationsStore = {
  /**
   * List all applications for a user, optionally filtered by status
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  list: (userId: string | undefined, statusFilter?: ApplicationStatus): ApplicationSummary[] => {
    const effectiveUserId = getEffectiveUserId(userId);
    const applicationsPath = getApplicationsPath();
    if (!applicationsPath || !fs.existsSync(applicationsPath)) {
      return [];
    }

    const files = fs.readdirSync(applicationsPath).filter(f => f.endsWith('.md'));
    const applications: ApplicationSummary[] = [];

    for (const file of files) {
      const app = parseApplication(path.join(applicationsPath, file));
      if (app) {
        // Filter by ownership - include if no userId set (legacy) or matches
        const isOwned = !app.userId || app.userId === effectiveUserId;
        if (isOwned && (!statusFilter || app.status === statusFilter)) {
          applications.push({
            id: app.id,
            userId: app.userId,
            jobTitle: app.jobTitle,
            company: app.company,
            date: app.date,
            score: app.score,
            status: app.status
          });
        }
      }
    }

    // Sort by date descending (newest first)
    applications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`[Applications] Listed ${applications.length} applications${statusFilter ? ` (filtered by ${statusFilter})` : ''}`);
    return applications;
  },

  /**
   * Get a single application by ID
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   * Returns null if not found or not owned (same response to prevent enumeration)
   */
  get: (userId: string | undefined, id: string): Application | null => {
    const effectiveUserId = getEffectiveUserId(userId);
    const applicationsPath = getApplicationsPath();
    if (!applicationsPath || !fs.existsSync(applicationsPath)) {
      return null;
    }

    const files = fs.readdirSync(applicationsPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(applicationsPath, file);
      const app = parseApplication(filePath);
      if (app && app.id === id) {
        // Check ownership - return null for non-owned (same as not found)
        if (app.userId && app.userId !== effectiveUserId) {
          console.log(`[Applications] Application not found: ${id}`);
          return null;
        }
        console.log(`[Applications] Found application: ${id}`);
        return app;
      }
    }

    console.log(`[Applications] Application not found: ${id}`);
    return null;
  },

  /**
   * Save a new application
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  save: (userId: string | undefined, data: {
    jobTitle: string;
    company: string;
    jobDescription: string;
    generatedResume: string;
    score: number;
    sourceUrl?: string;
    metadata: {
      iterations: number;
      initialScore: number;
    };
  }): Application | null => {
    const effectiveUserId = getEffectiveUserId(userId);
    const applicationsPath = ensureApplicationsFolder();
    if (!applicationsPath) {
      console.error('[Applications] Cannot save: vault path not configured');
      return null;
    }

    const id = `app-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const application: Application = {
      id,
      userId: effectiveUserId,
      jobTitle: data.jobTitle,
      company: data.company,
      date: now.split('T')[0], // YYYY-MM-DD
      jobDescription: data.jobDescription,
      generatedResume: data.generatedResume,
      score: data.score,
      status: 'saved',
      sourceUrl: data.sourceUrl,
      metadata: {
        optimizedAt: now,
        iterations: data.metadata.iterations,
        initialScore: data.metadata.initialScore
      }
    };

    const filename = generateFilename(id, data.jobTitle, data.company);
    const filePath = path.join(applicationsPath, filename);
    const markdown = generateMarkdown(application);

    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`[Applications] Saved application: ${id} to ${filename}`);

    return application;
  },

  /**
   * Update an existing application (status, notes)
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   * Returns null if not found or not owned
   */
  update: (userId: string | undefined, id: string, updates: {
    status?: ApplicationStatus;
    notes?: string;
  }): Application | null => {
    const effectiveUserId = getEffectiveUserId(userId);
    const applicationsPath = getApplicationsPath();
    if (!applicationsPath || !fs.existsSync(applicationsPath)) {
      return null;
    }

    const files = fs.readdirSync(applicationsPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(applicationsPath, file);
      const app = parseApplication(filePath);

      if (app && app.id === id) {
        // Check ownership
        if (app.userId && app.userId !== effectiveUserId) {
          console.log(`[Applications] Application not found for update: ${id}`);
          return null;
        }

        // Apply updates
        if (updates.status !== undefined) {
          app.status = updates.status;
        }
        if (updates.notes !== undefined) {
          app.notes = updates.notes;
        }

        // Write back
        const markdown = generateMarkdown(app);
        fs.writeFileSync(filePath, markdown, 'utf-8');
        console.log(`[Applications] Updated application: ${id}`);

        return app;
      }
    }

    console.log(`[Applications] Application not found for update: ${id}`);
    return null;
  },

  /**
   * Delete an application
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   * Returns false if not found or not owned
   */
  delete: (userId: string | undefined, id: string): boolean => {
    const effectiveUserId = getEffectiveUserId(userId);
    const applicationsPath = getApplicationsPath();
    if (!applicationsPath || !fs.existsSync(applicationsPath)) {
      return false;
    }

    const files = fs.readdirSync(applicationsPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(applicationsPath, file);
      const app = parseApplication(filePath);

      if (app && app.id === id) {
        // Check ownership
        if (app.userId && app.userId !== effectiveUserId) {
          console.log(`[Applications] Application not found for deletion: ${id}`);
          return false;
        }

        fs.unlinkSync(filePath);
        console.log(`[Applications] Deleted application: ${id}`);
        return true;
      }
    }

    console.log(`[Applications] Application not found for deletion: ${id}`);
    return false;
  },

  /**
   * Get statistics about applications for a user
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  getStats: (userId: string | undefined): {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    averageScore: number;
    recentCount: number; // Last 7 days
  } => {
    const effectiveUserId = getEffectiveUserId(userId);
    const applicationsPath = getApplicationsPath();
    if (!applicationsPath || !fs.existsSync(applicationsPath)) {
      return {
        total: 0,
        byStatus: {
          saved: 0,
          applied: 0,
          interviewing: 0,
          offered: 0,
          rejected: 0,
          withdrawn: 0
        },
        averageScore: 0,
        recentCount: 0
      };
    }

    const files = fs.readdirSync(applicationsPath).filter(f => f.endsWith('.md'));
    const byStatus: Record<ApplicationStatus, number> = {
      saved: 0,
      applied: 0,
      interviewing: 0,
      offered: 0,
      rejected: 0,
      withdrawn: 0
    };

    let totalScore = 0;
    let recentCount = 0;
    let validCount = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const file of files) {
      const app = parseApplication(path.join(applicationsPath, file));
      if (app) {
        // Filter by ownership - include if no userId set (legacy) or matches
        const isOwned = !app.userId || app.userId === effectiveUserId;
        if (!isOwned) continue;

        validCount++;
        byStatus[app.status]++;
        totalScore += app.score;

        if (new Date(app.date) >= sevenDaysAgo) {
          recentCount++;
        }
      }
    }

    return {
      total: validCount,
      byStatus,
      averageScore: validCount > 0 ? totalScore / validCount : 0,
      recentCount
    };
  }
};
