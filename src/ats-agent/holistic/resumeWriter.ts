/**
 * Resume Writer Agent
 *
 * Takes the holistic analysis results and rewrites the resume to better
 * match the job requirements while preserving the candidate's actual experience.
 *
 * Philosophy: REFRAME, don't remove. The goal is to highlight relevant aspects
 * of existing experience using job-aligned language.
 */

import { LLMClient } from '../../shared/llm/client';
import type { Resume } from '../types';
import type { HolisticAnalysisResult, ReframingRecommendation } from './holisticAnalyzer';

export interface RewriteResult {
  rewrittenResume: Resume;
  changesApplied: string[];
  sectionsModified: string[];
}

/**
 * Rewrite resume based on holistic analysis recommendations
 */
export async function rewriteResume(
  originalResume: Resume,
  analysis: HolisticAnalysisResult,
  llmClient: LLMClient
): Promise<RewriteResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(originalResume, analysis);

  const response = await llmClient.complete({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2, // Slightly higher for creative rewriting
    maxTokens: 6000
  });

  const result = llmClient.parseJsonResponse(response.content);

  return {
    rewrittenResume: {
      id: `${originalResume.id}-v2`,
      content: result.rewrittenContent || originalResume.content,
      format: originalResume.format,
      metadata: {
        ...originalResume.metadata,
        previousVersion: originalResume.id,
        rewrittenAt: new Date().toISOString()
      }
    },
    changesApplied: Array.isArray(result.changesApplied) ? result.changesApplied : [],
    sectionsModified: Array.isArray(result.sectionsModified) ? result.sectionsModified : []
  };
}

function buildSystemPrompt(): string {
  return `You are an expert resume writer specializing in optimizing resumes for specific job applications.

CRITICAL RULES:
1. NEVER fabricate experience or skills the candidate doesn't have
2. REFRAME existing content to highlight relevant aspects - don't remove content
3. Use terminology from the job posting where it accurately describes the candidate's experience
4. Maintain the candidate's authentic voice and career narrative
5. Keep the resume to a reasonable length (aim for 1-2 pages worth of content)
6. Preserve all factual details (dates, companies, degrees, publications)

REWRITING STRATEGIES:
- Terminology alignment: Replace resume terms with job posting terms where semantically equivalent
  Example: "cell sorting" → "flow cytometry and cell sorting" if job mentions flow cytometry
- Emphasis shifting: Move highly relevant experience/skills to more prominent positions
- Bullet point reframing: Rewrite accomplishments to emphasize aspects relevant to the job
  Example: "Analyzed patient data" → "Applied scientific computing and data analysis to curate patient datasets"
- Skills section optimization: Ensure skills mentioned in job posting are prominently listed (if candidate has them)

Return JSON with this structure:
{
  "rewrittenContent": "<the complete rewritten resume as plain text>",
  "changesApplied": [
    "<description of change 1>",
    "<description of change 2>",
    ...
  ],
  "sectionsModified": ["Summary", "Experience", "Skills", ...]
}`;
}

function buildUserPrompt(resume: Resume, analysis: HolisticAnalysisResult): string {
  const highPriorityRecs = analysis.recommendations
    .filter(r => r.priority === 'high')
    .map(formatRecommendation)
    .join('\n');

  const mediumPriorityRecs = analysis.recommendations
    .filter(r => r.priority === 'medium')
    .map(formatRecommendation)
    .join('\n');

  const terminologyChanges = analysis.terminologyAlignments
    .map(t => `- "${t.resumeTerm}" → "${t.jobTerm}": ${t.suggestion}`)
    .join('\n');

  const strengthsToEmphasize = analysis.strengths.join('\n- ');
  const gapsToAddress = analysis.gaps.join('\n- ');
  const themes = analysis.themesIdentified.join(', ');

  return `=== ORIGINAL RESUME ===
${resume.content}

=== ANALYSIS SUMMARY ===
Current Fit Score: ${(analysis.overallFit * 100).toFixed(0)}%
Assessment: ${analysis.fitAssessment}

Key Themes in Job Posting: ${themes}

=== STRENGTHS TO EMPHASIZE ===
- ${strengthsToEmphasize}

=== GAPS TO ADDRESS (if possible through reframing) ===
- ${gapsToAddress}

=== HIGH PRIORITY RECOMMENDATIONS ===
${highPriorityRecs || 'None'}

=== MEDIUM PRIORITY RECOMMENDATIONS ===
${mediumPriorityRecs || 'None'}

=== TERMINOLOGY ALIGNMENTS ===
${terminologyChanges || 'None identified'}

Rewrite the resume applying these recommendations. Focus on high priority items first. Maintain all factual accuracy while reframing content to better match job requirements.`;
}

function formatRecommendation(rec: ReframingRecommendation): string {
  return `[${rec.priority.toUpperCase()}] ${rec.jobRequirementAddressed}
  Current: "${rec.currentContent}"
  Suggested: "${rec.suggestedReframe}"
  Rationale: ${rec.rationale}`;
}
