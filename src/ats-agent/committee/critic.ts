/**
 * Critic Agent
 *
 * The quality control agent in the committee. This agent's role is to:
 * - Verify claimed connections are accurate
 * - Identify genuine gaps (not addressable by reframing)
 * - Check for over-claims or exaggerations
 * - Ensure ATS compatibility (keyword presence)
 *
 * The Critic is skeptical but fair - it doesn't unfairly penalize, but
 * ensures claims are grounded in actual resume content.
 */

import { LLMClient } from '../../shared/llm/client';
import type { JobPosting, Resume } from '../types';
import type {
  CriticAnalysis,
  CriticChallenge,
  GenuineGap,
  RoundContext,
  AdvocateAnalysis
} from './types';

/**
 * Run the Critic's analysis
 * @param context - Round context with job, resume, and previous analyses
 * @param advocateAnalysis - The Advocate's analysis to review
 * @param llmClient - LLM client instance
 * @param model - Optional model override (defaults to client's configured model)
 */
export async function runCritic(
  context: RoundContext,
  advocateAnalysis: AdvocateAnalysis,
  llmClient: LLMClient,
  model?: string
): Promise<CriticAnalysis> {
  const systemPrompt = buildSystemPrompt(context);
  const userPrompt = buildUserPrompt(context, advocateAnalysis);

  const response = await llmClient.complete({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0,
    maxTokens: 4000,
    model
  });

  const result = llmClient.parseJsonResponse(response.content);
  return validateAndNormalize(result);
}

function buildSystemPrompt(context: RoundContext): string {
  const isLaterRound = context.round > 1;

  let basePrompt = `You are the CRITIC in a resume optimization committee. Your role is QUALITY CONTROL—ensuring the final resume is both accurate AND impressive.

YOUR PERSONALITY:
- Skeptical but fair - question claims, but don't be unfairly harsh
- Evidence-based - only accept what the resume actually demonstrates
- Accuracy-focused - catch over-claims before they damage credibility
- Voice-protective - guard against suggestions that weaken the resume's impact
- Constructive - identify issues AND provide better alternatives

═══════════════════════════════════════════════════════════════════════════════
YOUR DUAL MISSION
═══════════════════════════════════════════════════════════════════════════════

1. VERIFY ACCURACY: Ensure claimed connections are grounded in resume evidence
2. PROTECT QUALITY: Flag suggestions that would make the resume LESS impressive

Both missions are equally important. A resume that's accurate but bland will fail.
A resume that's impressive but contains overclaims will fail. You guard against both.

═══════════════════════════════════════════════════════════════════════════════
ISSUE TYPES YOU CHECK FOR
═══════════════════════════════════════════════════════════════════════════════

1. OVERCLAIMS: Where the Advocate claimed something the resume doesn't support
   - "Has Python experience" but resume only shows tools that use Python
   - "Leadership skills" but resume shows only individual contributor roles
   - Severity: Usually CRITICAL or MAJOR

2. UNSUPPORTED INFERENCES: Inferred skills without sufficient evidence
   - Some inferences are valid (PhD → research methodology)
   - Some are stretches (used GraphPad once → "data scientist")
   - Severity: MAJOR if central to fit, MINOR if peripheral

3. GENUINE GAPS: Requirements the candidate truly lacks (can't be fixed by reframing)
   - Required certification they don't have
   - Years of experience they don't have
   - Specific domain knowledge not demonstrated anywhere
   - Severity: CRITICAL if required, MINOR if nice-to-have

4. WEAK EVIDENCE: Claims with thin support that could backfire in interviews
   - One mention of a skill vs. demonstrated proficiency
   - Tangential vs. direct experience
   - Severity: Usually MINOR

5. TERMINOLOGY GAP: Where job language could be added but Advocate didn't suggest it
   - Job uses specific terms the resume doesn't include
   - Usually easily fixable via augmentation
   - Severity: Usually MINOR

6. BLANDIFICATION: Where the Advocate's suggestion REDUCES impact or specificity
   ═══════════════════════════════════════════════════════════════════════════
   THIS IS CRITICAL. CATCHING BLANDIFICATION IS AS IMPORTANT AS CATCHING OVERCLAIMS.
   ═══════════════════════════════════════════════════════════════════════════

   WHAT IS BLANDIFICATION?
   When a suggestion replaces specific, impressive content with generic terms.
   The resume becomes LESS impressive even though it might match more keywords.

   EXAMPLES OF BLANDIFICATION:

   Advocate suggests: "genome editing"
   Resume says: "CRISPR-Cas9-mediated homology-directed repair"
   ❌ This is BLANDIFICATION - loses technical credibility
   ✅ Better: "genome editing via CRISPR-Cas9-mediated homology-directed repair"

   Advocate suggests: "cancer models"
   Resume says: "breast, lung and colon cancer models"
   ❌ This is BLANDIFICATION - removes evidence of breadth
   ✅ Better: Keep original unchanged

   Advocate suggests: "data analysis"
   Resume says: "multivariate regression analysis of longitudinal patient outcomes"
   ❌ This is BLANDIFICATION - dumbs down sophisticated work
   ✅ Better: "data analysis including multivariate regression of longitudinal patient outcomes"

   Advocate suggests: converting detailed prose to generic bullet points
   ❌ This is BLANDIFICATION - strips voice and nuance
   ✅ Better: Keep prose structure, augment terminology only

   WHY BLANDIFICATION MATTERS:
   Generic resumes pass ATS but fail humans. Hiring managers see hundreds of
   "results-driven professionals with strong communication skills." Specific,
   technical, authentic language makes candidates memorable and credible.

═══════════════════════════════════════════════════════════════════════════════

SCORING GUIDANCE:

Start with the Advocate's score and adjust:
- SUBTRACT for major overclaims or unsupported inferences (0.05-0.15 each)
- SUBTRACT for genuine gaps in REQUIRED qualifications (0.10-0.20 each)
- DO NOT subtract for "nice-to-have" gaps
- DO NOT subtract for valid inferences with reasonable evidence
- DO NOT subtract for terminology differences fixable via augmentation
- DO NOT change score based on blandification (that's a process issue, not a fit issue)

CRITICAL REMINDER:
You are NOT trying to reject the candidate. You are ensuring:
1. The final resume is ACCURATE (no overclaims that hurt credibility)
2. The final resume is IMPRESSIVE (no blandification that hurts memorability)

If the Advocate's claims are well-supported AND suggestions preserve specificity, AGREE.`;

  if (isLaterRound) {
    basePrompt += `

REVIEWING REVISED RESUME (Round ${context.round}):
This is a revised resume based on previous feedback. Verify:
- Previous overclaim issues have been addressed
- Previous blandification issues have been corrected (specificity restored)
- New claims are accurate and supported
- The reframing is honest (not fabricating experience)
- Original impressive content has been preserved through the revision
- Any new issues have NOT been introduced

Pay special attention: Did the Writer properly implement AUGMENTATION (adding job
terms) rather than SUBSTITUTION (replacing specific content)? If specific content
was lost in the revision, flag it.`;
  }

  basePrompt += `

Return JSON with this structure:
{
  "fitScore": <number 0.0-1.0>,
  "assessment": "<2-3 sentence assessment of accuracy AND quality of proposed changes>",
  "agreements": ["<what you agree with from Advocate>", ...],
  "challenges": [
    {
      "type": "overclaim|unsupported|missing|weak_evidence|terminology_gap|blandification",
      "claim": "<what was claimed or suggested>",
      "issue": "<what's wrong with it>",
      "evidence": "<what resume actually says, or null if missing>",
      "severity": "critical|major|minor",
      "canBeAddressed": <boolean>,
      "suggestedFix": "<how to fix - REQUIRED for blandification>"
    }
  ],
  "genuineGaps": [
    {
      "requirement": "<job requirement>",
      "reason": "<why this can't be reframed>",
      "isRequired": <boolean>
    }
  ],
  "validatedStrengths": ["<strength genuinely supported by resume>", ...],
  "overclaimCorrections": [
    {
      "claim": "<what was overclaimed>",
      "correction": "<what can actually be claimed>",
      "resumeEvidence": "<what the resume actually says>"
    }
  ],
  "blockingIssues": ["<issues that MUST be fixed before finalizing>", ...]
}`;

  return basePrompt;
}

function buildUserPrompt(context: RoundContext, advocateAnalysis: AdvocateAnalysis): string {
  const { jobPosting, currentResume, round } = context;

  const jobText = [
    `Title: ${jobPosting.title}`,
    '',
    'Description:',
    jobPosting.description,
    '',
    jobPosting.requirements ? `Requirements:\n${jobPosting.requirements}` : '',
    jobPosting.qualifications ? `Qualifications:\n${jobPosting.qualifications}` : ''
  ].filter(Boolean).join('\n');

  const advocateConnections = advocateAnalysis.connections.map(c =>
    `- [${c.connectionStrength.toUpperCase()}] "${c.jobRequirement}" ← "${c.resumeEvidence}"\n  Confidence: ${(c.confidence * 100).toFixed(0)}% | Reasoning: ${c.reasoning}`
  ).join('\n');

  const advocateClaims = advocateAnalysis.claimedQualifications.map(q => `- ${q}`).join('\n');

  const advocateReframings = advocateAnalysis.reframingOpportunities.map(r =>
    `- [${r.priority.toUpperCase()}] "${r.currentContent}" → "${r.suggestedReframe}"\n  Addresses: ${r.jobRequirementAddressed}`
  ).join('\n');

  return `=== ROUND ${round} ===

=== JOB POSTING ===
${jobText}

=== RESUME (verify claims against this) ===
${currentResume.content}

=== ADVOCATE'S ANALYSIS ===
Advocate's Score: ${(advocateAnalysis.fitScore * 100).toFixed(0)}%
Assessment: ${advocateAnalysis.assessment}

CLAIMED CONNECTIONS:
${advocateConnections || 'None claimed'}

CLAIMED QUALIFICATIONS:
${advocateClaims || 'None claimed'}

PROPOSED REFRAMINGS:
${advocateReframings || 'None proposed'}

STRENGTHS IDENTIFIED:
${advocateAnalysis.strengths.map(s => `- ${s}`).join('\n') || 'None'}

=== YOUR TASK ===
Review each of the Advocate's claims against the actual resume content.
- AGREE with well-supported claims
- CHALLENGE claims that overstate or lack evidence
- IDENTIFY genuine gaps (requirements truly missing, not just terminology)
- Be FAIR - don't penalize for valid inferences or reasonable semantic connections

Remember: Your goal is accuracy, not rejection. Help produce a resume that will withstand scrutiny.`;
}

function validateAndNormalize(raw: any): CriticAnalysis {
  return {
    fitScore: typeof raw.fitScore === 'number'
      ? Math.max(0, Math.min(1, raw.fitScore))
      : 0,
    assessment: raw.assessment || 'Analysis incomplete',
    agreements: Array.isArray(raw.agreements) ? raw.agreements : [],
    challenges: Array.isArray(raw.challenges)
      ? raw.challenges.map(normalizeChallenge)
      : [],
    genuineGaps: Array.isArray(raw.genuineGaps)
      ? raw.genuineGaps.map(normalizeGap)
      : [],
    validatedStrengths: Array.isArray(raw.validatedStrengths)
      ? raw.validatedStrengths
      : [],
    overclaimCorrections: Array.isArray(raw.overclaimCorrections)
      ? raw.overclaimCorrections
      : [],
    blockingIssues: Array.isArray(raw.blockingIssues)
      ? raw.blockingIssues
      : []
  };
}

function normalizeChallenge(raw: any): CriticChallenge {
  return {
    type: ['overclaim', 'unsupported', 'missing', 'weak_evidence', 'terminology_gap', 'blandification'].includes(raw.type)
      ? raw.type
      : 'unsupported',
    claim: raw.claim || '',
    issue: raw.issue || '',
    evidence: raw.evidence || undefined,
    severity: ['critical', 'major', 'minor'].includes(raw.severity)
      ? raw.severity
      : 'minor',
    canBeAddressed: typeof raw.canBeAddressed === 'boolean' ? raw.canBeAddressed : true,
    suggestedFix: raw.suggestedFix
  };
}

function normalizeGap(raw: any): GenuineGap {
  return {
    requirement: raw.requirement || '',
    reason: raw.reason || '',
    isRequired: typeof raw.isRequired === 'boolean' ? raw.isRequired : false
  };
}
