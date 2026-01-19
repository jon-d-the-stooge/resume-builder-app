/**
 * Resume Builder
 *
 * Assembles selected content items into a draft Resume object.
 * The draft is then passed to the Committee for optimization.
 *
 * This builder creates a well-structured markdown resume that:
 * - Organizes content by section (summary, experience, skills, education)
 * - Preserves the selector's rationale for committee to consider
 * - Maintains relationships between jobs and their accomplishments
 */

import type { Resume } from '../types';
import type {
  SelectedItem,
  SelectionResult,
  ParsedJobRequirements,
  ContentVaultItem
} from './types';
import { ContentType } from '../../shared/obsidian/types';

// ============================================================================
// Resume Building
// ============================================================================

/**
 * Build a draft resume from selected content
 */
export function buildDraftResume(
  groupedItems: SelectionResult['groupedItems'],
  parsedRequirements: ParsedJobRequirements,
  jobId: string
): Resume {
  const sections: string[] = [];

  // Summary section (generated from requirements and selected content)
  const summarySection = buildSummarySection(groupedItems, parsedRequirements);
  if (summarySection) {
    sections.push(summarySection);
  }

  // Experience section
  const experienceSection = buildExperienceSection(groupedItems);
  if (experienceSection) {
    sections.push(experienceSection);
  }

  // Skills section
  const skillsSection = buildSkillsSection(groupedItems.skills);
  if (skillsSection) {
    sections.push(skillsSection);
  }

  // Education section
  const educationSection = buildEducationSection(groupedItems.education);
  if (educationSection) {
    sections.push(educationSection);
  }

  // Certifications section
  const certificationsSection = buildCertificationsSection(groupedItems.certifications);
  if (certificationsSection) {
    sections.push(certificationsSection);
  }

  const content = sections.join('\n\n');

  return {
    id: `draft-${jobId}-${Date.now()}`,
    content,
    format: 'markdown',
    metadata: {
      generatedFor: jobId,
      generatedAt: new Date().toISOString(),
      selectedItemCount: countSelectedItems(groupedItems),
      coverageInfo: {
        themes: parsedRequirements.themes,
        domain: parsedRequirements.domain,
        seniorityLevel: parsedRequirements.seniorityLevel
      }
    }
  };
}

/**
 * Build the summary section highlighting key qualifications
 */
function buildSummarySection(
  groupedItems: SelectionResult['groupedItems'],
  requirements: ParsedJobRequirements
): string {
  const lines: string[] = [];
  lines.push('## Professional Summary');
  lines.push('');

  // Extract key qualifications from selected items
  const keySkills = groupedItems.skills
    .slice(0, 5)
    .map(s => s.item.content);

  const yearsExperience = calculateYearsExperience(groupedItems.jobs);

  // Build summary highlighting key themes and skills
  const summaryParts: string[] = [];

  if (yearsExperience > 0) {
    summaryParts.push(`${yearsExperience}+ years of experience`);
  }

  if (requirements.domain) {
    summaryParts.push(`in ${requirements.domain}`);
  }

  if (keySkills.length > 0) {
    summaryParts.push(`with expertise in ${keySkills.slice(0, 3).join(', ')}`);
  }

  if (requirements.themes.length > 0) {
    summaryParts.push(`. Background in ${requirements.themes.slice(0, 2).join(' and ')}`);
  }

  if (summaryParts.length > 0) {
    lines.push(summaryParts.join(' ') + '.');
  }

  // Add top accomplishments as highlights
  const topAccomplishments = groupedItems.accomplishments
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);

  if (topAccomplishments.length > 0) {
    lines.push('');
    lines.push('Key achievements:');
    for (const acc of topAccomplishments) {
      lines.push(`- ${acc.item.content}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the experience section with jobs and accomplishments
 */
function buildExperienceSection(
  groupedItems: SelectionResult['groupedItems']
): string {
  if (groupedItems.jobs.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Professional Experience');
  lines.push('');

  // Sort jobs by date (most recent first)
  const sortedJobs = [...groupedItems.jobs].sort((a, b) => {
    const dateA = a.item.metadata.dateRange?.start || '';
    const dateB = b.item.metadata.dateRange?.start || '';
    return dateB.localeCompare(dateA);
  });

  for (const jobItem of sortedJobs) {
    const job = jobItem.item;
    const jobLines = formatJobEntry(job, groupedItems.accomplishments);
    lines.push(jobLines);
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Format a single job entry with its accomplishments
 */
function formatJobEntry(
  job: ContentVaultItem,
  allAccomplishments: SelectedItem[]
): string {
  const lines: string[] = [];

  // Job header
  const title = extractJobTitle(job);
  const company = job.metadata.company || '';
  const location = formatLocation(job.metadata.location);
  const dateRange = formatDateRange(job.metadata.dateRange);

  lines.push(`### ${title}${company ? ` | ${company}` : ''}`);
  if (location || dateRange) {
    lines.push(`*${[location, dateRange].filter(Boolean).join(' | ')}*`);
  }
  lines.push('');

  // Get accomplishments for this job
  const jobAccomplishments = allAccomplishments.filter(
    acc => acc.item.parentId === job.id
  );

  // Sort by relevance score
  const sortedAccomplishments = [...jobAccomplishments].sort(
    (a, b) => b.relevanceScore - a.relevanceScore
  );

  if (sortedAccomplishments.length > 0) {
    for (const acc of sortedAccomplishments) {
      lines.push(`- ${acc.item.content}`);
    }
  } else {
    // Use the job's own content if no linked accomplishments
    const jobContent = job.content;
    if (jobContent && !jobContent.includes(title)) {
      lines.push(`- ${jobContent}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the skills section
 */
function buildSkillsSection(skills: SelectedItem[]): string {
  if (skills.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Skills');
  lines.push('');

  // Group skills by proficiency level
  const expertSkills: string[] = [];
  const proficientSkills: string[] = [];
  const familiarSkills: string[] = [];
  const otherSkills: string[] = [];

  for (const skill of skills) {
    const proficiency = skill.item.metadata.proficiency?.toLowerCase() || '';
    const content = skill.item.content;

    if (proficiency.includes('expert') || proficiency.includes('advanced')) {
      expertSkills.push(content);
    } else if (proficiency.includes('proficient') || proficiency.includes('intermediate')) {
      proficientSkills.push(content);
    } else if (proficiency.includes('familiar') || proficiency.includes('basic')) {
      familiarSkills.push(content);
    } else {
      otherSkills.push(content);
    }
  }

  // Format as grouped list or simple list depending on what we have
  if (expertSkills.length > 0 || proficientSkills.length > 0) {
    if (expertSkills.length > 0) {
      lines.push(`**Expert:** ${expertSkills.join(', ')}`);
    }
    if (proficientSkills.length > 0) {
      lines.push(`**Proficient:** ${proficientSkills.join(', ')}`);
    }
    if (familiarSkills.length > 0) {
      lines.push(`**Familiar:** ${familiarSkills.join(', ')}`);
    }
    if (otherSkills.length > 0) {
      lines.push(`**Additional:** ${otherSkills.join(', ')}`);
    }
  } else {
    // Simple list if no proficiency info
    const allSkills = [...otherSkills, ...familiarSkills];
    lines.push(allSkills.join(' • '));
  }

  return lines.join('\n');
}

/**
 * Build the education section
 */
function buildEducationSection(education: SelectedItem[]): string {
  if (education.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Education');
  lines.push('');

  // Sort by date (most recent first)
  const sortedEducation = [...education].sort((a, b) => {
    const dateA = a.item.metadata.dateRange?.start || '';
    const dateB = b.item.metadata.dateRange?.start || '';
    return dateB.localeCompare(dateA);
  });

  for (const edu of sortedEducation) {
    const content = edu.item.content;
    const dateRange = formatDateRange(edu.item.metadata.dateRange);
    const location = formatLocation(edu.item.metadata.location);

    lines.push(`**${content}**`);
    if (dateRange || location) {
      lines.push(`*${[location, dateRange].filter(Boolean).join(' | ')}*`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Build the certifications section
 */
function buildCertificationsSection(certifications: SelectedItem[]): string {
  if (certifications.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Certifications');
  lines.push('');

  for (const cert of certifications) {
    const content = cert.item.content;
    const dateRange = cert.item.metadata.dateRange;
    const dateStr = dateRange?.start || '';

    if (dateStr) {
      lines.push(`- ${content} (${formatYear(dateStr)})`);
    } else {
      lines.push(`- ${content}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract job title from content or metadata
 */
function extractJobTitle(job: ContentVaultItem): string {
  // Try to extract from content
  const content = job.content;

  // If content starts with a typical title pattern, use that
  const titleMatch = content.match(/^([^-–|•\n]+)/);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  return content.split('\n')[0].trim();
}

/**
 * Format location from metadata
 */
function formatLocation(location?: { city?: string; state?: string; country?: string }): string {
  if (!location) return '';

  const parts: string[] = [];
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country && location.country !== 'USA' && location.country !== 'United States') {
    parts.push(location.country);
  }

  return parts.join(', ');
}

/**
 * Format date range
 */
function formatDateRange(dateRange?: { start: string; end?: string }): string {
  if (!dateRange || !dateRange.start) return '';

  const startYear = formatYear(dateRange.start);
  if (dateRange.end) {
    const endYear = formatYear(dateRange.end);
    return `${startYear} - ${endYear}`;
  }

  return `${startYear} - Present`;
}

/**
 * Format year from ISO date string
 */
function formatYear(dateStr: string): string {
  if (!dateStr) return '';

  // Handle ISO date or just year
  if (dateStr.includes('-')) {
    return dateStr.split('-')[0];
  }

  return dateStr;
}

/**
 * Calculate approximate years of experience from job entries
 */
function calculateYearsExperience(jobs: SelectedItem[]): number {
  if (jobs.length === 0) return 0;

  let earliestStart: Date | null = null;
  let latestEnd: Date | null = null;

  for (const job of jobs) {
    const dateRange = job.item.metadata.dateRange;
    if (!dateRange?.start) continue;

    const startDate = new Date(dateRange.start);
    if (!earliestStart || startDate < earliestStart) {
      earliestStart = startDate;
    }

    const endDate = dateRange.end ? new Date(dateRange.end) : new Date();
    if (!latestEnd || endDate > latestEnd) {
      latestEnd = endDate;
    }
  }

  if (!earliestStart || !latestEnd) return 0;

  const years = (latestEnd.getTime() - earliestStart.getTime()) / (1000 * 60 * 60 * 24 * 365);
  return Math.floor(years);
}

/**
 * Count total selected items
 */
function countSelectedItems(groupedItems: SelectionResult['groupedItems']): number {
  return (
    groupedItems.jobs.length +
    groupedItems.skills.length +
    groupedItems.accomplishments.length +
    groupedItems.education.length +
    groupedItems.certifications.length
  );
}
