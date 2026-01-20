/**
 * Holistic Analyzer
 *
 * Single-pass analysis that reads both job posting and resume as complete documents,
 * understanding them holistically rather than fragmenting into elements.
 *
 * This approach preserves context and makes semantic connections that element-based
 * matching misses (e.g., "wet lab experience" → "gene synthesis capability").
 */

import { LLMClient } from '../../shared/llm/client';
import type { JobPosting, Resume } from '../types';

/**
 * A semantic connection between resume content and job requirements
 */
export interface SemanticConnection {
  jobRequirement: string;
  resumeEvidence: string;
  connectionType: 'direct' | 'inferred' | 'partial' | 'missing';
  confidence: number;
  explanation: string;
}

/**
 * A specific recommendation for improving the resume
 */
export interface ReframingRecommendation {
  priority: 'high' | 'medium' | 'low';
  currentContent: string;
  suggestedReframe: string;
  rationale: string;
  jobRequirementAddressed: string;
}

/**
 * Result of holistic analysis
 */
export interface HolisticAnalysisResult {
  overallFit: number; // 0.0 to 1.0
  fitAssessment: string; // Human-readable assessment

  connections: SemanticConnection[];

  strengths: string[];
  gaps: string[];

  recommendations: ReframingRecommendation[];

  terminologyAlignments: Array<{
    resumeTerm: string;
    jobTerm: string;
    suggestion: string;
  }>;

  themesIdentified: string[];
}

/**
 * Analyze job posting and resume holistically in a single pass
 */
export async function analyzeHolistically(
  jobPosting: JobPosting,
  resume: Resume,
  llmClient: LLMClient
): Promise<HolisticAnalysisResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(jobPosting, resume);

  const response = await llmClient.complete({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0,
    maxTokens: 4000
  });

  const result = llmClient.parseJsonResponse(response.content);

  // Log raw response for debugging score issues
  console.log('[HolisticAnalyzer] Raw LLM response overallFit:', result?.overallFit, 'type:', typeof result?.overallFit);

  return validateAndNormalizeResult(result);
}

function buildSystemPrompt(): string {
  return `You are an expert career counselor and ATS (Applicant Tracking System) analyst.

Your task is to analyze a job posting and resume HOLISTICALLY - understanding them as complete narratives, not just keyword lists.

CRITICAL INSTRUCTIONS:
1. Read BOTH documents completely before making any assessments
2. Look for SEMANTIC connections, not just keyword matches:
   - "wet lab experience" implies "gene synthesis", "cell culture", "molecular cloning"
   - "scientific computing" includes "Python", "R", "data analysis pipelines"
   - "PhD in molecular biology" demonstrates "research methodology", "scientific writing", "independent project management"
3. Give the candidate BENEFIT OF THE DOUBT:
   - If they have related experience, count it as relevant
   - Recognize that skills cluster (someone with CRISPR experience likely knows molecular biology fundamentals)
   - Infer capabilities from accomplishments (led a research team → leadership skills)
4. Focus on REFRAMING, not removing:
   - Suggest how existing content can be restated to better match job language
   - Preserve the candidate's actual experience while highlighting relevant aspects

SCORING GUIDANCE:
- 0.8-1.0: Strong fit - candidate clearly qualified, minor terminology adjustments needed
- 0.6-0.8: Good fit - candidate has most requirements, some gaps or reframing needed
- 0.4-0.6: Moderate fit - candidate has transferable skills, significant reframing needed
- 0.2-0.4: Weak fit - candidate missing key requirements
- 0.0-0.2: Poor fit - fundamental mismatch

Return your analysis as JSON with this structure:
{
  "overallFit": <number 0.0-1.0>,
  "fitAssessment": "<2-3 sentence assessment of candidate fit>",
  "connections": [
    {
      "jobRequirement": "<what the job asks for>",
      "resumeEvidence": "<what the resume shows, or 'Not explicitly stated' if missing>",
      "connectionType": "direct|inferred|partial|missing",
      "confidence": <0.0-1.0>,
      "explanation": "<how these connect, or what's missing>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "gaps": ["<gap 1>", "<gap 2>", ...],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "currentContent": "<what the resume currently says>",
      "suggestedReframe": "<how to restate it>",
      "rationale": "<why this helps>",
      "jobRequirementAddressed": "<which job requirement this addresses>"
    }
  ],
  "terminologyAlignments": [
    {
      "resumeTerm": "<term used in resume>",
      "jobTerm": "<term used in job posting>",
      "suggestion": "<use job term or explain the connection>"
    }
  ],
  "themesIdentified": ["<theme 1>", "<theme 2>", ...]
}`;
}

function buildUserPrompt(jobPosting: JobPosting, resume: Resume): string {
  const jobText = [
    `Title: ${jobPosting.title}`,
    '',
    'Description:',
    jobPosting.description,
    '',
    jobPosting.requirements ? `Requirements:\n${jobPosting.requirements}` : '',
    jobPosting.qualifications ? `Qualifications:\n${jobPosting.qualifications}` : ''
  ].filter(Boolean).join('\n');

  return `=== JOB POSTING ===
${jobText}

=== RESUME ===
${resume.content}

Analyze these documents holistically. Identify semantic connections between the candidate's experience and the job requirements. Provide specific, actionable recommendations for reframing resume content to better match the job language while preserving accuracy.`;
}

/**
 * Normalize a score value to a decimal between 0 and 1.
 * Handles string numbers, percentages (>1), and invalid values.
 */
function normalizeScore(value: any): number {
  // Handle string numbers (e.g., "0.75" or "75")
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      value = parsed;
    } else {
      console.warn('[HolisticAnalyzer] Invalid overallFit value:', value);
      return 0;
    }
  }

  if (typeof value !== 'number' || isNaN(value)) {
    console.warn('[HolisticAnalyzer] Non-numeric overallFit:', value);
    return 0;
  }

  // If value > 1, assume percentage (e.g., 75 instead of 0.75)
  if (value > 1) {
    console.warn('[HolisticAnalyzer] Converting percentage to decimal:', value);
    value = value / 100;
  }

  return Math.max(0, Math.min(1, value));
}

function validateAndNormalizeResult(raw: any): HolisticAnalysisResult {
  return {
    overallFit: normalizeScore(raw.overallFit),
    fitAssessment: raw.fitAssessment || 'Analysis incomplete',
    connections: Array.isArray(raw.connections)
      ? raw.connections.map(normalizeConnection)
      : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.map(normalizeRecommendation)
      : [],
    terminologyAlignments: Array.isArray(raw.terminologyAlignments)
      ? raw.terminologyAlignments
      : [],
    themesIdentified: Array.isArray(raw.themesIdentified)
      ? raw.themesIdentified
      : []
  };
}

function normalizeConnection(raw: any): SemanticConnection {
  return {
    jobRequirement: raw.jobRequirement || '',
    resumeEvidence: raw.resumeEvidence || '',
    connectionType: ['direct', 'inferred', 'partial', 'missing'].includes(raw.connectionType)
      ? raw.connectionType
      : 'missing',
    confidence: normalizeScore(raw.confidence),
    explanation: raw.explanation || ''
  };
}

function normalizeRecommendation(raw: any): ReframingRecommendation {
  return {
    priority: ['high', 'medium', 'low'].includes(raw.priority)
      ? raw.priority
      : 'medium',
    currentContent: raw.currentContent || '',
    suggestedReframe: raw.suggestedReframe || '',
    rationale: raw.rationale || '',
    jobRequirementAddressed: raw.jobRequirementAddressed || ''
  };
}
