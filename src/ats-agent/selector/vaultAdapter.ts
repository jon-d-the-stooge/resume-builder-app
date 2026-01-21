/**
 * Vault Adapter
 *
 * Converts hierarchical Vault structure to ContentVaultItem[] format
 * for use with the selector agent. This adapter bridges the new
 * structured vault with the existing selector pipeline.
 *
 * Key improvements over raw ContentItem:
 * - Job title, company, dates extracted from structured metadata
 * - Items properly linked to parent objects via objectId
 * - Tags preserved from hierarchical structure
 */

import type { ContentItem, ContentType } from '../../types';
import {
  Vault,
  VaultSection,
  SectionObject,
  VaultItem,
  isExperienceMetadata,
  isEducationMetadata,
  isCertificationMetadata,
  isProjectMetadata,
  SectionObjectMetadata,
  ExperienceMetadata,
  EducationMetadata
} from '../../types/vault';
import { ContentType as ObsidianContentType } from '../../shared/obsidian/types';
import type { ContentVaultItem } from './types';

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert a hierarchical Vault to ContentVaultItem[] for selector
 *
 * This creates a flattened list that the selector can process while
 * enriching items with structured metadata from the hierarchical structure.
 */
export function vaultToContentVaultItems(vault: Vault): ContentVaultItem[] {
  const items: ContentVaultItem[] = [];

  for (const section of vault.sections) {
    const sectionItems = sectionToContentVaultItems(section, vault);
    items.push(...sectionItems);
  }

  return items;
}

/**
 * Convert a VaultSection to ContentVaultItem[]
 */
function sectionToContentVaultItems(section: VaultSection, vault: Vault): ContentVaultItem[] {
  const items: ContentVaultItem[] = [];

  for (const obj of section.objects) {
    // Convert the object itself to a ContentVaultItem
    const objectItem = objectToContentVaultItem(obj, section, vault);
    if (objectItem) {
      items.push(objectItem);
    }

    // Convert items (accomplishments) within the object
    const childItems = obj.items.map(item =>
      itemToContentVaultItem(item, obj, section, vault)
    );
    items.push(...childItems);
  }

  return items;
}

/**
 * Convert a SectionObject to a ContentVaultItem
 *
 * This is the key function that extracts structured metadata:
 * - For experience: title, company, dates become accessible
 * - For education: degree, institution become accessible
 */
function objectToContentVaultItem(
  obj: SectionObject,
  section: VaultSection,
  vault: Vault
): ContentVaultItem | null {
  const metadata = obj.metadata;

  // Determine content type based on section type
  const contentType = sectionTypeToContentType(section.type);
  if (!contentType) return null;

  // Build the content string from structured metadata
  let content: string;
  let contentMetadata: ContentVaultItem['metadata'] = {};

  if (isExperienceMetadata(metadata)) {
    // For experience objects, content = title | company
    content = `${metadata.title}${metadata.company ? ` | ${metadata.company}` : ''}`;
    if (metadata.description) {
      content += `\n${metadata.description}`;
    }

    // Populate structured metadata fields
    contentMetadata = {
      company: metadata.company,
      dateRange: metadata.startDate ? {
        start: metadata.startDate,
        end: metadata.endDate || undefined
      } : undefined,
      location: metadata.location || undefined,
      customFields: {
        title: metadata.title,
        employmentType: metadata.employmentType
      }
    };
  } else if (isEducationMetadata(metadata)) {
    content = `${metadata.degree}${metadata.institution ? ` | ${metadata.institution}` : ''}`;
    if (metadata.fieldOfStudy) {
      content += ` - ${metadata.fieldOfStudy}`;
    }

    contentMetadata = {
      dateRange: metadata.startDate ? {
        start: metadata.startDate,
        end: metadata.endDate || undefined
      } : undefined,
      location: metadata.location || undefined,
      customFields: {
        degree: metadata.degree,
        institution: metadata.institution,
        gpa: metadata.gpa,
        honors: metadata.honors,
        fieldOfStudy: metadata.fieldOfStudy
      }
    };
  } else if (isCertificationMetadata(metadata)) {
    content = `${metadata.name} | ${metadata.issuer}`;

    contentMetadata = {
      dateRange: {
        start: metadata.issueDate,
        end: metadata.expirationDate || undefined
      },
      customFields: {
        name: metadata.name,
        issuer: metadata.issuer,
        credentialId: metadata.credentialId,
        credentialUrl: metadata.credentialUrl
      }
    };
  } else if (isProjectMetadata(metadata)) {
    content = metadata.name;
    if (metadata.role) {
      content += ` | ${metadata.role}`;
    }

    contentMetadata = {
      dateRange: metadata.startDate ? {
        start: metadata.startDate,
        end: metadata.endDate || undefined
      } : undefined,
      customFields: {
        name: metadata.name,
        role: metadata.role,
        organization: metadata.organization,
        url: metadata.url,
        technologies: metadata.technologies
      }
    };
  } else {
    // Generic fallback
    content = JSON.stringify(metadata);
  }

  // Convert items to children
  const children: ContentVaultItem[] = obj.items.map(item =>
    itemToContentVaultItem(item, obj, section, vault)
  );

  return {
    id: obj.id,
    type: contentType,
    content,
    tags: obj.tags || [],
    metadata: contentMetadata,
    createdAt: new Date(vault.metadata.createdAt),
    updatedAt: new Date(vault.metadata.updatedAt),
    filePath: `resume-vaults/${vault.id}.json#${obj.id}`,
    children: children.length > 0 ? children : undefined
  };
}

/**
 * Convert a VaultItem to a ContentVaultItem
 *
 * Items are typically accomplishments/bullet points that belong to an object.
 */
function itemToContentVaultItem(
  item: VaultItem,
  parentObj: SectionObject,
  section: VaultSection,
  vault: Vault
): ContentVaultItem {
  // Items are typically accomplishments
  const contentType = ObsidianContentType.ACCOMPLISHMENT;

  // Inherit context from parent object
  let parentMetadata: ContentVaultItem['metadata'] = {};

  if (isExperienceMetadata(parentObj.metadata)) {
    parentMetadata = {
      company: parentObj.metadata.company,
      dateRange: parentObj.metadata.startDate ? {
        start: parentObj.metadata.startDate,
        end: parentObj.metadata.endDate || undefined
      } : undefined,
      customFields: {
        parentTitle: parentObj.metadata.title,
        parentCompany: parentObj.metadata.company
      }
    };
  }

  return {
    id: item.id,
    type: contentType,
    content: item.content,
    tags: item.tags || [],
    metadata: parentMetadata,
    parentId: parentObj.id,
    createdAt: new Date(vault.metadata.createdAt),
    updatedAt: new Date(vault.metadata.updatedAt),
    filePath: `resume-vaults/${vault.id}.json#${item.id}`
  };
}

/**
 * Map section type to ContentType
 */
function sectionTypeToContentType(sectionType: string): ObsidianContentType | null {
  switch (sectionType) {
    case 'experience':
      return ObsidianContentType.JOB_ENTRY;
    case 'education':
      return ObsidianContentType.EDUCATION;
    case 'skills':
      return ObsidianContentType.SKILL;
    case 'certifications':
      return ObsidianContentType.CERTIFICATION;
    case 'projects':
      // Projects can be treated as job entries for display purposes
      return ObsidianContentType.JOB_ENTRY;
    default:
      return null;
  }
}

// ============================================================================
// Enhanced Formatting for Vault Content
// ============================================================================

/**
 * Format a ContentVaultItem with structured metadata for LLM
 *
 * This enhanced version provides more context than the basic formatItem:
 * - Job title and company are explicit (not extracted from content blob)
 * - Dates are formatted consistently
 * - Context from parent object is included
 */
export function formatVaultItemForLLM(item: ContentVaultItem): string {
  const parts: string[] = [];
  parts.push(`[ID: ${item.id}]`);
  parts.push(`Type: ${item.type}`);

  // Use structured metadata for better formatting
  const customFields = item.metadata.customFields;

  if (item.type === ObsidianContentType.JOB_ENTRY) {
    // For jobs, extract title and company from customFields
    if (customFields?.title) {
      parts.push(`Title: ${customFields.title}`);
    }
    if (item.metadata.company) {
      parts.push(`Company: ${item.metadata.company}`);
    }
    if (item.metadata.dateRange) {
      const dr = item.metadata.dateRange;
      parts.push(`Period: ${dr.start}${dr.end ? ` - ${dr.end}` : ' - Present'}`);
    }
    if (item.metadata.location) {
      const loc = item.metadata.location;
      const locStr = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
      if (locStr) parts.push(`Location: ${locStr}`);
    }
    // Include description/content
    if (item.content && !item.content.includes(customFields?.title || '')) {
      parts.push(`Description: ${item.content}`);
    }
  } else if (item.type === ObsidianContentType.ACCOMPLISHMENT) {
    // For accomplishments, include parent context
    parts.push(`Content: ${item.content}`);
    if (customFields?.parentTitle) {
      parts.push(`At: ${customFields.parentTitle}${customFields.parentCompany ? ` @ ${customFields.parentCompany}` : ''}`);
    }
    if (item.parentId) {
      parts.push(`ParentJob: ${item.parentId}`);
    }
  } else {
    // Default formatting
    parts.push(`Content: ${item.content}`);
  }

  if (item.tags && item.tags.length > 0) {
    parts.push(`Tags: ${item.tags.join(', ')}`);
  }

  if (item.children && item.children.length > 0) {
    const childTypes = new Map<string, number>();
    for (const child of item.children) {
      childTypes.set(child.type, (childTypes.get(child.type) || 0) + 1);
    }
    const childSummary = Array.from(childTypes.entries())
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    parts.push(`Accomplishments: ${childSummary}`);
  }

  return parts.join(' | ');
}

/**
 * Format vault content for LLM with enhanced structure
 */
export function formatVaultContentForLLM(items: ContentVaultItem[]): string {
  const sections: string[] = [];

  // Group by type
  const jobs = items.filter(i => i.type === ObsidianContentType.JOB_ENTRY);
  const skills = items.filter(i => i.type === ObsidianContentType.SKILL);
  const accomplishments = items.filter(i => i.type === ObsidianContentType.ACCOMPLISHMENT);
  const education = items.filter(i => i.type === ObsidianContentType.EDUCATION);
  const certifications = items.filter(i => i.type === ObsidianContentType.CERTIFICATION);

  if (jobs.length > 0) {
    sections.push('## JOBS\n' + jobs.map(j => formatVaultItemForLLM(j)).join('\n'));
  }

  if (skills.length > 0) {
    sections.push('## SKILLS\n' + skills.map(s => formatVaultItemForLLM(s)).join('\n'));
  }

  if (accomplishments.length > 0) {
    sections.push('## ACCOMPLISHMENTS\n' + accomplishments.map(a => formatVaultItemForLLM(a)).join('\n'));
  }

  if (education.length > 0) {
    sections.push('## EDUCATION\n' + education.map(e => formatVaultItemForLLM(e)).join('\n'));
  }

  if (certifications.length > 0) {
    sections.push('## CERTIFICATIONS\n' + certifications.map(c => formatVaultItemForLLM(c)).join('\n'));
  }

  return sections.join('\n\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get experience metadata from a ContentVaultItem
 *
 * Returns structured fields if available, or extracts from content if not.
 */
export function getExperienceMetadata(item: ContentVaultItem): {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  location?: string;
} {
  const customFields = item.metadata.customFields;

  // Try to get from structured metadata first
  if (customFields?.title) {
    return {
      title: customFields.title as string,
      company: (customFields.company as string) || item.metadata.company || '',
      startDate: item.metadata.dateRange?.start,
      endDate: item.metadata.dateRange?.end,
      location: item.metadata.location
        ? [item.metadata.location.city, item.metadata.location.state].filter(Boolean).join(', ')
        : undefined
    };
  }

  // Fallback: extract from content string
  const content = item.content;
  const parts = content.split('|').map(p => p.trim());

  return {
    title: parts[0] || content.split('\n')[0].trim(),
    company: parts[1] || item.metadata.company || '',
    startDate: item.metadata.dateRange?.start,
    endDate: item.metadata.dateRange?.end,
    location: item.metadata.location
      ? [item.metadata.location.city, item.metadata.location.state].filter(Boolean).join(', ')
      : undefined
  };
}

/**
 * Check if a ContentVaultItem has structured experience metadata
 */
export function hasStructuredExperienceMetadata(item: ContentVaultItem): boolean {
  return !!(item.metadata.customFields?.title && item.metadata.company);
}
