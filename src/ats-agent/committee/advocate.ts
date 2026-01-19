/**
 * Advocate Agent
 *
 * The pro-candidate agent in the committee. This agent's role is to:
 * - Find semantic connections generously
 * - Infer skills from accomplishments
 * - Recognize domain equivalents
 * - Argue for the candidate's fit
 *
 * The Advocate gives the candidate benefit of the doubt while staying truthful.
 * It looks for what CAN be claimed, not what's explicitly stated.
 */

import { LLMClient } from '../../shared/llm/client';
import type { JobPosting, Resume } from '../types';
import type {
  AdvocateAnalysis,
  AdvocateConnection,
  ReframingOpportunity,
  RoundContext,
  CriticAnalysis
} from './types';

/**
 * Run the Advocate's analysis
 * @param context - Round context with job, resume, and previous analyses
 * @param llmClient - LLM client instance
 * @param model - Optional model override (defaults to client's configured model)
 */
export async function runAdvocate(
  context: RoundContext,
  llmClient: LLMClient,
  model?: string
): Promise<AdvocateAnalysis> {
  const systemPrompt = buildSystemPrompt(context);
  const userPrompt = buildUserPrompt(context);

  const response = await llmClient.complete({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.1,
    maxTokens: 4000,
    model
  });

  const result = llmClient.parseJsonResponse(response.content);
  return validateAndNormalize(result);
}

function buildSystemPrompt(context: RoundContext): string {
  const hasCriticFeedback = !!context.previousCriticAnalysis;

  let basePrompt = `You are the ADVOCATE in a resume optimization committee. Your role is to find every legitimate way this candidate is qualified for the job and present the strongest possible case for their candidacy.

YOUR PERSONALITY:
- Generous in interpretation - if something COULD demonstrate qualification, assume it does
- Specificity-obsessed - concrete details are GOLD. Never trade them for vague language
- Augmentation-focused - ADD job terminology alongside impressive content, never REPLACE it
- Voice-protective - the candidate's authentic voice is an asset, not something to sand down
- Truthful - you find real connections, not fabrications. You highlight, not invent.

═══════════════════════════════════════════════════════════════════════════════
THE AUGMENTATION PRINCIPLE (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

When you suggest terminology changes, you must ALWAYS ADD job language, NEVER REPLACE specific content.

CORRECT PATTERNS:

1. PREPEND pattern (add job term before specific term):
   Original: "conducted genome-wide CRISPR screens"
   Job asks: "high-throughput screening"
   Suggest: "conducted high-throughput genome-wide CRISPR screens"

2. PARENTHETICAL pattern (add job term as clarification):
   Original: "CRISPR-Cas9-mediated homology-directed repair"
   Job asks: "genome editing"
   Suggest: "genome editing (CRISPR-Cas9-mediated homology-directed repair)"

3. EXPANSION pattern (broader term + original specific):
   Original: "breast, lung and colon cancer models"
   Job asks: "cancer models"
   Suggest: KEEP ORIGINAL - it already exceeds the requirement with specificity

4. NATURAL WEAVE pattern (integrate smoothly):
   Original: "analyzed large datasets using custom Python scripts"
   Job asks: "data science", "machine learning"
   Suggest: "applied data science techniques to analyze large datasets using custom Python scripts"

WRONG PATTERNS (NEVER DO THESE):

❌ "CRISPR-Cas9-mediated homology-directed repair" → "genome editing"
   Why wrong: Loses technical credibility. A hiring scientist will be LESS impressed.

❌ "breast, lung and colon cancer models" → "cancer models"
   Why wrong: Removes evidence of breadth. Specificity demonstrates real experience.

❌ "aberrant DNA-sensing pathways" → "molecular pathways"
   Why wrong: Dumbs down expertise. The precise terminology signals domain mastery.

❌ "designed and validated primary cell screening assays" → "high-throughput screening"
   Why wrong: Loses the detail that matters (primary cells, validation, assay design).

═══════════════════════════════════════════════════════════════════════════════

WHAT YOU LOOK FOR:

1. DIRECT MATCHES: Explicit skills/experience that match requirements
   - These need minimal reframing—just ensure they're visible and well-positioned
   - If the resume already says it well, acknowledge it. Don't change what works.

2. INFERRED SKILLS: Accomplishments that imply unstated capabilities
   - Led research team → leadership skills, project management
   - PhD in molecular biology → scientific writing, research methodology
   - Published papers → peer review experience, scientific communication
   - The inference must be grounded in what they actually did

3. TERMINOLOGY AUGMENTATION: Where job keywords can be ADDED to existing content
   - Find where the resume demonstrates something the job asks for using different words
   - Your suggestion should ADD the job's words while KEEPING the resume's words
   - Both terms end up in the final version

4. TRANSFERABLE EXPERIENCE: Skills that apply across contexts
   - Academic research → industry research methodology
   - One disease area → demonstrates ability to learn another
   - Be generous but honest about what transfers

SCORING GUIDANCE:

- 0.85-1.0: Strong fit - candidate clearly qualified, resume demonstrates this effectively
            Minor keyword augmentation may help but isn't critical

- 0.70-0.85: Good fit - candidate is qualified, strategic keyword augmentation will
             strengthen the presentation without changing substance

- 0.55-0.70: Moderate fit - candidate has relevant experience but meaningful gaps exist
             Augmentation helps but can't fully bridge the gap

- 0.40-0.55: Stretch fit - transferable skills exist but notable gaps remain
             Be honest about what reframing can and cannot accomplish

- Below 0.40: Weak fit - major qualification gaps. Don't manufacture connections.

IMPORTANT: A resume using different terminology than the job posting but demonstrating
the same skills should score HIGH. Terminology differences are trivially fixed via
augmentation. Missing actual experience is the real gap.`;

  if (hasCriticFeedback) {
    basePrompt += `

RESPONDING TO CRITIC'S FEEDBACK (Round ${context.round}):
You have received feedback from the Critic agent. Review their challenges carefully.

- If a challenge is VALID, acknowledge it and adjust your assessment
- If a challenge is UNFAIR or MISSES context, defend your position with evidence
- If Critic flagged BLANDIFICATION, you MUST revise that suggestion to use proper augmentation
- Look for NEW connections you may have missed in round 1
- Strengthen your case where the Critic raised weak objections

CRITICAL: If the Critic flagged any of your suggestions as "blandification" (making the
resume less impressive), revise those suggestions immediately. Use the augmentation patterns
above. Never suggest removing specific content to add generic keywords.`;
  }

  basePrompt += `

Return JSON with this structure:
{
  "fitScore": <number 0.0-1.0>,
  "assessment": "<2-3 sentence assessment of candidate fit>",
  "connections": [
    {
      "jobRequirement": "<what job asks for>",
      "resumeEvidence": "<exact quote from resume>",
      "connectionStrength": "strong|moderate|inferred|transferable",
      "confidence": <0.0-1.0>,
      "reasoning": "<how these connect>",
      "suggestedFraming": "<optional: how to ADD job terminology - must keep original content>"
    }
  ],
  "strengths": ["<impressive element 1>", "<impressive element 2>", ...],
  "reframingOpportunities": [
    {
      "currentContent": "<exact text from resume>",
      "suggestedReframe": "<augmented version - MUST contain all original specifics>",
      "jobRequirementAddressed": "<which requirement this helps>",
      "rationale": "<why this augmentation works>",
      "priority": "high|medium|low"
    }
  ],
  "terminologyAlignments": [
    {
      "resumeTerm": "<term in resume>",
      "jobTerm": "<equivalent term in job>",
      "suggestedAlignment": "<how to ADD job term while keeping resume term>"
    }
  ],
  "claimedQualifications": ["<qualification 1>", "<qualification 2>", ...]
}`;

  return basePrompt;
}

function buildUserPrompt(context: RoundContext): string {
  const { jobPosting, currentResume, previousCriticAnalysis, round } = context;

  const jobText = [
    `Title: ${jobPosting.title}`,
    '',
    'Description:',
    jobPosting.description,
    '',
    jobPosting.requirements ? `Requirements:\n${jobPosting.requirements}` : '',
    jobPosting.qualifications ? `Qualifications:\n${jobPosting.qualifications}` : ''
  ].filter(Boolean).join('\n');

  let prompt = `=== ROUND ${round} ===

=== JOB POSTING ===
${jobText}

=== RESUME ===
${currentResume.content}

`;

  if (previousCriticAnalysis) {
    prompt += `=== CRITIC'S PREVIOUS FEEDBACK ===
Critic's Score: ${(previousCriticAnalysis.fitScore * 100).toFixed(0)}%
Assessment: ${previousCriticAnalysis.assessment}

Agreements with your analysis:
${previousCriticAnalysis.agreements.map(a => `- ${a}`).join('\n') || 'None stated'}

Challenges to your analysis:
${previousCriticAnalysis.challenges.map(c => `- [${c.severity.toUpperCase()}] ${c.type}: ${c.claim}\n  Issue: ${c.issue}`).join('\n') || 'None'}

Genuine gaps identified:
${previousCriticAnalysis.genuineGaps.map(g => `- ${g.requirement}${g.isRequired ? ' (REQUIRED)' : ''}: ${g.reason}`).join('\n') || 'None'}

Respond to this feedback. Defend valid connections, acknowledge fair criticisms, and look for new evidence.
`;
  } else {
    prompt += `Analyze this resume against the job posting. Find ALL connections, including inferred and transferable skills. Be generous in interpretation while staying truthful.`;
  }

  return prompt;
}

function validateAndNormalize(raw: any): AdvocateAnalysis {
  return {
    fitScore: typeof raw.fitScore === 'number'
      ? Math.max(0, Math.min(1, raw.fitScore))
      : 0,
    assessment: raw.assessment || 'Analysis incomplete',
    connections: Array.isArray(raw.connections)
      ? raw.connections.map(normalizeConnection)
      : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    reframingOpportunities: Array.isArray(raw.reframingOpportunities)
      ? raw.reframingOpportunities.map(normalizeReframingOpportunity)
      : [],
    terminologyAlignments: Array.isArray(raw.terminologyAlignments)
      ? raw.terminologyAlignments
      : [],
    claimedQualifications: Array.isArray(raw.claimedQualifications)
      ? raw.claimedQualifications
      : []
  };
}

function normalizeConnection(raw: any): AdvocateConnection {
  return {
    jobRequirement: raw.jobRequirement || '',
    resumeEvidence: raw.resumeEvidence || '',
    connectionStrength: ['strong', 'moderate', 'inferred', 'transferable'].includes(raw.connectionStrength)
      ? raw.connectionStrength
      : 'inferred',
    confidence: typeof raw.confidence === 'number'
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.5,
    reasoning: raw.reasoning || '',
    suggestedFraming: raw.suggestedFraming
  };
}

function normalizeReframingOpportunity(raw: any): ReframingOpportunity {
  return {
    currentContent: raw.currentContent || '',
    suggestedReframe: raw.suggestedReframe || '',
    jobRequirementAddressed: raw.jobRequirementAddressed || '',
    rationale: raw.rationale || '',
    priority: ['high', 'medium', 'low'].includes(raw.priority)
      ? raw.priority
      : 'medium'
  };
}
