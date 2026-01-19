/**
 * Theme Extractor
 *
 * Extracts high-level job themes to guide recommendation prioritization.
 */

import { LLMClient } from '../../shared/llm/client';
import { JobPosting, ParsedJob, JobTheme } from '../types';

interface ThemeExtractionResponse {
  themes: JobTheme[];
}

const THEME_SYSTEM_PROMPT = `You are an ATS analyst. Return JSON only.

Extract the top 3-6 themes from the job posting. A theme is a high-level idea
that captures the type of candidate and the role's priorities (e.g., "biosecurity
and safety", "ML evaluation", "cross-functional collaboration").

Return JSON:
{
  "themes": [
    {
      "name": "theme name",
      "importance": 0.0-1.0,
      "keywords": ["keyword1", "keyword2"],
      "rationale": "short justification"
    }
  ]
}`;

export async function extractJobThemes(
  jobPosting: JobPosting,
  parsedJob: ParsedJob,
  llmClient: LLMClient
): Promise<JobTheme[]> {
  const topElements = parsedJob.elements
    .slice()
    .sort((a, b) => ((b as any).importance || 0.5) - ((a as any).importance || 0.5))
    .slice(0, 30)
    .map(element => ({
      text: element.text,
      normalizedText: element.normalizedText,
      importance: (element as any).importance || 0.5,
      category: (element as any).category || 'keyword'
    }));

  const userPrompt = `Job title: ${jobPosting.title}

Job description:
${jobPosting.description}

Top extracted elements (JSON):
${JSON.stringify(topElements)}
`;

  try {
    const response = await llmClient.complete({
      systemPrompt: THEME_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0,
      maxTokens: 1024
    });

    const parsed = llmClient.parseJsonResponse(response.content) as ThemeExtractionResponse;
    if (!parsed.themes || !Array.isArray(parsed.themes)) {
      return [];
    }

    return parsed.themes
      .filter(theme => theme && theme.name)
      .map(theme => ({
        name: theme.name,
        importance: Math.max(0, Math.min(1, Number(theme.importance) || 0.5)),
        keywords: Array.isArray(theme.keywords) ? theme.keywords : [],
        rationale: theme.rationale || ''
      }));
  } catch (error) {
    console.error('Theme extraction failed:', error);
    return [];
  }
}
