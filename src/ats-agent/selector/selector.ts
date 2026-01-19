/**
 * Selector Agent
 *
 * Stage 1 of the two-stage resume pipeline.
 *
 * The Selector agent:
 * 1. Parses job requirements into structured format
 * 2. Retrieves all content from the vault
 * 3. Uses LLM to intelligently select relevant content
 * 4. Returns selected items with rationale
 *
 * The output is passed to the Resume Builder, then to the Committee for optimization.
 */

import { LLMClient } from '../../shared/llm/client';
import type { ContentItem } from '../../types';
import { ContentType } from '../../shared/obsidian/types';
import type { JobPosting } from '../types';
import {
  ContentVaultItem,
  SelectedItem,
  SelectionResult,
  SelectorConfig,
  DEFAULT_SELECTOR_CONFIG,
  ParsedJobRequirements,
  JobRequirement,
  RequirementParseResponse,
  ContentSelectionResponse
} from './types';
import { buildDraftResume } from './resumeBuilder';

// ============================================================================
// Prompts
// ============================================================================

const REQUIREMENT_PARSE_PROMPT = `You are a job requirement analyst. Parse the following job posting and extract structured requirements.

For each requirement, determine:
1. The requirement text (concise description)
2. Type: skill | experience | education | certification | soft_skill | other
3. Importance: required | preferred | nice_to_have
4. Keywords: key terms that would appear in a matching resume

Also identify:
- Themes: 2-4 key focus areas or themes of the role
- Domain: the industry or domain (e.g., "biotech", "fintech", "enterprise SaaS")
- Seniority Level: entry | mid | senior | lead | executive

Return your analysis as JSON:
{
  "requirements": [
    {
      "text": "requirement description",
      "type": "skill",
      "importance": "required",
      "keywords": ["keyword1", "keyword2"]
    }
  ],
  "themes": ["theme1", "theme2"],
  "domain": "domain name",
  "seniorityLevel": "senior"
}

JOB POSTING:
Title: {title}

Description:
{description}

Requirements:
{requirements}

Qualifications:
{qualifications}`;

const CONTENT_SELECTION_PROMPT = `You are a strategic resume content selector. Your job is to pick the most relevant content from a candidate's experience vault for a specific job posting.

GUIDELINES:
1. Prioritize content that directly matches job requirements
2. Include transferable experiences that demonstrate relevant skills
3. Consider the seniority level - match experience depth appropriately
4. Balance technical skills with soft skills when both are valued
5. Include accomplishments that quantify impact when available
6. Don't include everything - be selective and strategic

For each selected item, provide:
- relevanceScore (0.0 to 1.0): How relevant is this to the job?
- matchedRequirements: Which job requirements does this address?
- rationale: Why did you select this?
- suggestedUsage: How should this be presented in the resume?

Return your selections as JSON:
{
  "selections": [
    {
      "itemId": "item-id",
      "relevanceScore": 0.85,
      "matchedRequirements": ["requirement text 1", "requirement text 2"],
      "rationale": "This directly addresses X and demonstrates Y",
      "suggestedUsage": "Lead with the quantified impact, emphasize Z"
    }
  ],
  "unmatchedRequirements": ["requirements that have no matching content"],
  "selectionSummary": "Brief summary of selection strategy",
  "warnings": ["Any concerns or gaps to note"]
}

JOB REQUIREMENTS:
{requirements}

KEY THEMES: {themes}
DOMAIN: {domain}
SENIORITY LEVEL: {seniorityLevel}

CONTENT VAULT (available items to select from):
{vaultContent}

CONFIGURATION:
- Maximum jobs to select: {maxJobs}
- Maximum skills to select: {maxSkills}
- Maximum accomplishments per job: {maxAccomplishmentsPerJob}
- Minimum relevance score: {minRelevanceScore}`;

// ============================================================================
// Selector Implementation
// ============================================================================

/**
 * Parse job posting into structured requirements
 */
export async function parseJobRequirements(
  jobPosting: JobPosting,
  llmClient: LLMClient,
  model?: string
): Promise<ParsedJobRequirements> {
  const prompt = REQUIREMENT_PARSE_PROMPT
    .replace('{title}', jobPosting.title)
    .replace('{description}', jobPosting.description)
    .replace('{requirements}', jobPosting.requirements)
    .replace('{qualifications}', jobPosting.qualifications);

  const response = await llmClient.complete({
    messages: [{ role: 'user', content: prompt }],
    model,
    temperature: 0.2
  });

  const parsed: RequirementParseResponse = llmClient.parseJsonResponse(response.content);

  return {
    jobId: jobPosting.id,
    title: jobPosting.title,
    company: jobPosting.metadata?.company as string | undefined,
    requirements: parsed.requirements.map(r => ({
      text: r.text,
      type: r.type,
      importance: r.importance,
      keywords: r.keywords
    })),
    themes: parsed.themes,
    domain: parsed.domain,
    seniorityLevel: parsed.seniorityLevel
  };
}

/**
 * Format vault content for the LLM
 */
function formatVaultContent(items: ContentVaultItem[]): string {
  const sections: string[] = [];

  // Group by type
  const jobs = items.filter(i => i.type === ContentType.JOB_ENTRY);
  const skills = items.filter(i => i.type === ContentType.SKILL);
  const accomplishments = items.filter(i => i.type === ContentType.ACCOMPLISHMENT);
  const education = items.filter(i => i.type === ContentType.EDUCATION);
  const certifications = items.filter(i => i.type === ContentType.CERTIFICATION);

  if (jobs.length > 0) {
    sections.push('## JOBS\n' + jobs.map(j => formatItem(j)).join('\n'));
  }

  if (skills.length > 0) {
    sections.push('## SKILLS\n' + skills.map(s => formatItem(s)).join('\n'));
  }

  if (accomplishments.length > 0) {
    sections.push('## ACCOMPLISHMENTS\n' + accomplishments.map(a => formatItem(a)).join('\n'));
  }

  if (education.length > 0) {
    sections.push('## EDUCATION\n' + education.map(e => formatItem(e)).join('\n'));
  }

  if (certifications.length > 0) {
    sections.push('## CERTIFICATIONS\n' + certifications.map(c => formatItem(c)).join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Format a single item for the LLM
 */
function formatItem(item: ContentVaultItem): string {
  const parts: string[] = [];
  parts.push(`[ID: ${item.id}]`);
  parts.push(`Type: ${item.type}`);
  parts.push(`Content: ${item.content}`);

  if (item.tags.length > 0) {
    parts.push(`Tags: ${item.tags.join(', ')}`);
  }

  if (item.metadata.company) {
    parts.push(`Company: ${item.metadata.company}`);
  }

  if (item.metadata.dateRange) {
    const dr = item.metadata.dateRange;
    parts.push(`Period: ${dr.start}${dr.end ? ` - ${dr.end}` : ' - Present'}`);
  }

  if (item.metadata.proficiency) {
    parts.push(`Proficiency: ${item.metadata.proficiency}`);
  }

  if (item.parentId) {
    parts.push(`Parent: ${item.parentId}`);
  }

  if (item.children && item.children.length > 0) {
    const childTypes = new Map<string, number>();
    for (const child of item.children) {
      childTypes.set(child.type, (childTypes.get(child.type) || 0) + 1);
    }
    const childSummary = Array.from(childTypes.entries())
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    parts.push(`Children: ${childSummary}`);
  }

  return parts.join(' | ');
}

/**
 * Convert ContentItem array to ContentVaultItem array with resolved relationships
 */
export function resolveVaultRelationships(items: ContentItem[]): ContentVaultItem[] {
  const itemMap = new Map<string, ContentVaultItem>();

  // First pass: convert to vault items
  for (const item of items) {
    const vaultItem: ContentVaultItem = {
      ...item,
      children: []
    };
    itemMap.set(item.id, vaultItem);
  }

  // Second pass: resolve parent-child relationships
  const allItems = Array.from(itemMap.values());
  for (const item of allItems) {
    if (item.parentId) {
      const parent = itemMap.get(item.parentId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(item);
      }
    }
  }

  return allItems;
}

/**
 * Run the selector agent to pick relevant content for a job
 */
export async function runSelector(
  jobPosting: JobPosting,
  vaultItems: ContentItem[],
  llmClient: LLMClient,
  config: Partial<SelectorConfig> = {}
): Promise<SelectionResult> {
  const cfg: SelectorConfig = {
    ...DEFAULT_SELECTOR_CONFIG,
    ...config
  };

  console.log('\n=== SELECTOR STAGE START ===');
  console.log(`Job: ${jobPosting.title}`);
  console.log(`Vault items: ${vaultItems.length}`);
  console.log(`Config: maxJobs=${cfg.maxJobs}, maxSkills=${cfg.maxSkills}, minRelevance=${cfg.minRelevanceScore}`);

  // Step 1: Parse job requirements
  console.log('\n[SELECTOR] Parsing job requirements...');
  const parsedRequirements = await parseJobRequirements(jobPosting, llmClient, cfg.model);
  console.log(`[SELECTOR] Found ${parsedRequirements.requirements.length} requirements`);
  console.log(`[SELECTOR] Themes: ${parsedRequirements.themes.join(', ')}`);
  console.log(`[SELECTOR] Domain: ${parsedRequirements.domain || 'not specified'}`);
  console.log(`[SELECTOR] Seniority: ${parsedRequirements.seniorityLevel || 'not specified'}`);

  // Step 2: Resolve vault relationships
  const resolvedVault = resolveVaultRelationships(vaultItems);

  // Step 3: Select content using LLM
  console.log('\n[SELECTOR] Selecting relevant content...');
  const selectionResponse = await selectContent(
    parsedRequirements,
    resolvedVault,
    llmClient,
    cfg
  );

  // Step 4: Build selection result
  const selectedItems = buildSelectedItems(selectionResponse, resolvedVault);
  console.log(`[SELECTOR] Selected ${selectedItems.length} items`);

  // Group selected items by type
  const groupedItems = groupSelectedItems(selectedItems);

  // Calculate coverage score
  const matchedRequirementTexts = new Set<string>();
  for (const item of selectedItems) {
    for (const req of item.matchedRequirements) {
      matchedRequirementTexts.add(req);
    }
  }
  const coverageScore = parsedRequirements.requirements.length > 0
    ? matchedRequirementTexts.size / parsedRequirements.requirements.length
    : 0;

  // Build unmatchedRequirements
  const unmatchedRequirements = parsedRequirements.requirements.filter(
    req => !matchedRequirementTexts.has(req.text)
  );

  // Build draft resume
  console.log('\n[SELECTOR] Building draft resume...');
  const draftResume = buildDraftResume(groupedItems, parsedRequirements, jobPosting.id);

  console.log('\n=== SELECTOR STAGE COMPLETE ===');
  console.log(`Selected items: ${selectedItems.length}`);
  console.log(`Coverage: ${(coverageScore * 100).toFixed(1)}%`);
  console.log(`Unmatched requirements: ${unmatchedRequirements.length}`);

  return {
    selectedItems,
    groupedItems,
    draftResume,
    selectionSummary: selectionResponse.selectionSummary,
    unmatchedRequirements,
    coverageScore,
    parsedRequirements,
    warnings: selectionResponse.warnings
  };
}

/**
 * Use LLM to select content from vault
 */
async function selectContent(
  requirements: ParsedJobRequirements,
  vaultItems: ContentVaultItem[],
  llmClient: LLMClient,
  config: SelectorConfig
): Promise<ContentSelectionResponse> {
  const requirementsText = requirements.requirements
    .map((r, i) => `${i + 1}. [${r.importance.toUpperCase()}] [${r.type}] ${r.text}`)
    .join('\n');

  const vaultContent = formatVaultContent(vaultItems);

  const prompt = CONTENT_SELECTION_PROMPT
    .replace('{requirements}', requirementsText)
    .replace('{themes}', requirements.themes.join(', '))
    .replace('{domain}', requirements.domain || 'general')
    .replace('{seniorityLevel}', requirements.seniorityLevel || 'not specified')
    .replace('{vaultContent}', vaultContent)
    .replace('{maxJobs}', String(config.maxJobs))
    .replace('{maxSkills}', String(config.maxSkills))
    .replace('{maxAccomplishmentsPerJob}', String(config.maxAccomplishmentsPerJob))
    .replace('{minRelevanceScore}', String(config.minRelevanceScore));

  const response = await llmClient.complete({
    messages: [{ role: 'user', content: prompt }],
    model: config.model,
    temperature: config.temperature
  });

  return llmClient.parseJsonResponse(response.content);
}

/**
 * Build SelectedItem array from LLM response
 */
function buildSelectedItems(
  response: ContentSelectionResponse,
  vaultItems: ContentVaultItem[]
): SelectedItem[] {
  const itemMap = new Map<string, ContentVaultItem>();
  for (const item of vaultItems) {
    itemMap.set(item.id, item);
  }

  const selectedItems: SelectedItem[] = [];

  for (const selection of response.selections) {
    const item = itemMap.get(selection.itemId);
    if (!item) {
      console.warn(`[SELECTOR] Warning: Item not found: ${selection.itemId}`);
      continue;
    }

    selectedItems.push({
      item,
      relevanceScore: selection.relevanceScore,
      matchedRequirements: selection.matchedRequirements,
      rationale: selection.rationale,
      suggestedUsage: selection.suggestedUsage
    });
  }

  // Sort by relevance score descending
  selectedItems.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return selectedItems;
}

/**
 * Group selected items by content type
 */
function groupSelectedItems(items: SelectedItem[]): SelectionResult['groupedItems'] {
  return {
    jobs: items.filter(i => i.item.type === ContentType.JOB_ENTRY),
    skills: items.filter(i => i.item.type === ContentType.SKILL),
    accomplishments: items.filter(i => i.item.type === ContentType.ACCOMPLISHMENT),
    education: items.filter(i => i.item.type === ContentType.EDUCATION),
    certifications: items.filter(i => i.item.type === ContentType.CERTIFICATION)
  };
}
