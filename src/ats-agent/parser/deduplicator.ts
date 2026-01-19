/**
 * Element Deduplication
 * 
 * Consolidates duplicate elements from different sections while preserving
 * context from all occurrences and selecting the maximum importance score.
 * 
 * Requirements: 1.5, 4.5
 */

import { Element, TaggedElement } from '../types';

/**
 * Deduplicate elements based on normalized text
 * 
 * When duplicate elements are found:
 * - Consolidates them into a single element
 * - Preserves context from all occurrences (concatenated)
 * - Selects the maximum importance score (for TaggedElements)
 * - Keeps the first occurrence's position
 * - Merges tags from all occurrences (unique)
 * 
 * @param elements - Array of elements to deduplicate
 * @returns Array of deduplicated elements
 */
export function deduplicateElements<T extends Element>(elements: T[]): T[] {
  if (elements.length === 0) {
    return [];
  }

  // Group elements by normalized text
  const elementMap = new Map<string, T[]>();
  
  for (const element of elements) {
    const key = element.normalizedText.toLowerCase().trim();
    if (!elementMap.has(key)) {
      elementMap.set(key, []);
    }
    elementMap.get(key)!.push(element);
  }

  // Consolidate duplicates
  const deduplicated: T[] = [];
  
  for (const [, group] of elementMap) {
    if (group.length === 1) {
      // No duplicates, keep as is
      deduplicated.push(group[0]);
    } else {
      // Consolidate duplicates
      const consolidated = consolidateGroup(group);
      deduplicated.push(consolidated);
    }
  }

  return deduplicated;
}

/**
 * Consolidate a group of duplicate elements
 * 
 * @param group - Array of duplicate elements
 * @returns Single consolidated element
 */
function consolidateGroup<T extends Element>(group: T[]): T {
  if (group.length === 0) {
    throw new Error('Cannot consolidate empty group');
  }

  if (group.length === 1) {
    return group[0];
  }

  // Start with the first element as base
  const base = { ...group[0] };

  // Collect all unique tags
  const allTags = new Set<string>();
  for (const element of group) {
    for (const tag of element.tags) {
      allTags.add(tag);
    }
  }

  // Collect all contexts (non-empty and unique)
  const allContexts = new Set<string>();
  for (const element of group) {
    const trimmedContext = element.context.trim();
    if (trimmedContext.length > 0) {
      allContexts.add(trimmedContext);
    }
  }

  // Merge contexts with separator
  const mergedContext = Array.from(allContexts).join(' | ');

  // For TaggedElements, select maximum importance
  let maxImportance: number | undefined;
  if (isTaggedElement(group[0])) {
    maxImportance = Math.max(...group.map(el => (el as any).importance || 0));
  }

  // Build consolidated element
  const consolidated: T = {
    ...base,
    tags: Array.from(allTags),
    context: mergedContext
  };

  // Add importance if this is a TaggedElement
  if (maxImportance !== undefined) {
    (consolidated as any).importance = maxImportance;
  }

  return consolidated;
}

/**
 * Type guard to check if an element is a TaggedElement
 */
function isTaggedElement(element: Element): element is TaggedElement {
  return 'importance' in element;
}

/**
 * Count duplicate elements in an array
 * 
 * @param elements - Array of elements
 * @returns Number of duplicate elements found
 */
export function countDuplicates(elements: Element[]): number {
  const seen = new Set<string>();
  let duplicates = 0;

  for (const element of elements) {
    const key = element.normalizedText.toLowerCase().trim();
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

/**
 * Find all duplicate elements in an array
 * 
 * @param elements - Array of elements
 * @returns Array of arrays, where each inner array contains duplicate elements
 */
export function findDuplicateGroups(elements: Element[]): Element[][] {
  const elementMap = new Map<string, Element[]>();
  
  for (const element of elements) {
    const key = element.normalizedText.toLowerCase().trim();
    if (!elementMap.has(key)) {
      elementMap.set(key, []);
    }
    elementMap.get(key)!.push(element);
  }

  // Return only groups with more than one element
  const duplicateGroups: Element[][] = [];
  for (const [, group] of elementMap) {
    if (group.length > 1) {
      duplicateGroups.push(group);
    }
  }

  return duplicateGroups;
}

/**
 * Check if an array contains duplicate elements
 * 
 * @param elements - Array of elements
 * @returns True if duplicates exist
 */
export function hasDuplicates(elements: Element[]): boolean {
  const seen = new Set<string>();

  for (const element of elements) {
    const key = element.normalizedText.toLowerCase().trim();
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }

  return false;
}

/**
 * Get statistics about deduplication
 * 
 * @param original - Original array of elements
 * @param deduplicated - Deduplicated array of elements
 * @returns Statistics object
 */
export function getDeduplicationStats(
  original: Element[],
  deduplicated: Element[]
): {
  originalCount: number;
  deduplicatedCount: number;
  duplicatesRemoved: number;
  reductionPercentage: number;
} {
  const originalCount = original.length;
  const deduplicatedCount = deduplicated.length;
  const duplicatesRemoved = originalCount - deduplicatedCount;
  const reductionPercentage = originalCount > 0 
    ? (duplicatesRemoved / originalCount) * 100 
    : 0;

  return {
    originalCount,
    deduplicatedCount,
    duplicatesRemoved,
    reductionPercentage
  };
}
