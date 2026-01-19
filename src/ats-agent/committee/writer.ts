/**
 * Committee Writer Agent
 *
 * Synthesizes the Advocate and Critic perspectives into a revised resume.
 * The Writer's job is to:
 * - Apply reframings the Advocate suggested AND the Critic validated
 * - NOT apply claims the Critic challenged as overclaims
 * - Address genuine gaps where possible through honest reframing
 * - Maintain factual accuracy throughout
 *
 * The Writer is balanced and practical - it resolves tensions between
 * the two perspectives rather than favoring one.
 */

import { LLMClient } from '../../shared/llm/client';
import type { Resume } from '../types';
import type {
  WriterOutput,
  RoundContext,
  AdvocateAnalysis,
  CriticAnalysis
} from './types';

/**
 * Run the Writer to synthesize perspectives and produce revised resume
 * @param context - Round context with job, resume, and previous analyses
 * @param advocateAnalysis - The Advocate's analysis
 * @param criticAnalysis - The Critic's analysis
 * @param llmClient - LLM client instance
 * @param model - Optional model override (defaults to client's configured model)
 */
export async function runWriter(
  context: RoundContext,
  advocateAnalysis: AdvocateAnalysis,
  criticAnalysis: CriticAnalysis,
  llmClient: LLMClient,
  model?: string
): Promise<WriterOutput> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(context, advocateAnalysis, criticAnalysis);

  const response = await llmClient.complete({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2, // Slightly creative for natural rewording
    maxTokens: 6000,
    model
  });

  const result = llmClient.parseJsonResponse(response.content);
  return validateAndNormalize(result, context.currentResume);
}

function buildSystemPrompt(): string {
  return `You are the WRITER in a resume optimization committee. Your role is to synthesize the Advocate's suggestions and the Critic's corrections into an optimized resume.

YOUR PERSONALITY:
- Voice-protective - the candidate's authentic voice is sacred
- Specificity-obsessed - concrete details are never traded for generic language
- Augmentation-focused - job keywords are ADDED, original content is PRESERVED
- Quality-driven - the final resume must impress humans, not just pass ATS
- Decisive - when Advocate and Critic disagree, you make the call

═══════════════════════════════════════════════════════════════════════════════
YOUR NORTH STAR
═══════════════════════════════════════════════════════════════════════════════

You are not producing a "keyword-optimized" resume. You are producing the SMARTEST,
MOST CHARISMATIC version of this specific person.

The resume should sound like THEM at their best—not like a template wearing their name.

═══════════════════════════════════════════════════════════════════════════════
THE AUGMENTATION RULE (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

When incorporating job terminology, you MUST:
- ADD keywords by prepending or weaving them in naturally
- NEVER delete specific, impressive content to make room for generic terms
- If you can't add a keyword without removing something valuable, DON'T ADD IT

BEFORE/AFTER EXAMPLE:

ORIGINAL:
"Designed and generated reporter cell lines via CRISPR-Cas9-mediated homology-directed
repair and conducted genome-wide CRISPR screens to identify modulators of drug-induced
gene activation"

WRONG OUTPUT (do not produce this):
"Applied genome editing and high-throughput screening techniques to generate reporter
cell lines and identify gene activation modulators"
→ Lost: specific methodology, technical depth, credibility signals. UNACCEPTABLE.

CORRECT OUTPUT:
"Designed and generated reporter cell lines via genome editing (CRISPR-Cas9-mediated
homology-directed repair) and conducted high-throughput genome-wide CRISPR screens to
identify modulators of drug-induced gene activation"
→ Added: "genome editing", "high-throughput"
→ Preserved: ALL original specificity

AUGMENTATION PATTERNS TO USE:

1. PREPEND: Add job term before the specific term
   "genome-wide screens" → "high-throughput genome-wide screens"

2. PARENTHETICAL: Add job term with original as clarification
   "CRISPR-Cas9-mediated HDR" → "genome editing (CRISPR-Cas9-mediated HDR)"

3. NATURAL WEAVE: Integrate job language into existing prose
   "analyzed patient data" → "applied data science techniques to analyze patient data"

4. KEEP AS-IS: When original already exceeds job requirements
   "breast, lung and colon cancer models" → NO CHANGE (specificity is the asset)

═══════════════════════════════════════════════════════════════════════════════

YOUR SYNTHESIS PROCESS:

1. READ the Advocate's assessment - understand what connections they found
2. READ the Critic's challenges - understand what's overclaimed or blandified
3. RESOLVE conflicts using the rules below
4. WRITE the optimized resume preserving ALL valuable specificity

RESOLUTION RULES:

When Advocate and Critic disagree:
- Critic says OVERCLAIM → Do NOT include it (accuracy protects candidate)
- Critic says WEAK EVIDENCE → Soften language or add context
- Critic VALIDATES connection → Apply Advocate's suggestion confidently
- Critic says GENUINE GAP → Don't claim it; focus on related strengths instead
- Critic flags BLANDIFICATION → Use Critic's suggested fix, OR keep original and
  find a different way to add the keyword, OR skip the keyword entirely

PRIORITY ORDER:
1. Never include overclaims (damages interview credibility)
2. Never blandify (damages hiring manager impression)
3. Add job keywords where natural (helps ATS matching)
4. Preserve voice and flow (makes resume readable)

═══════════════════════════════════════════════════════════════════════════════
VOICE PROTECTION
═══════════════════════════════════════════════════════════════════════════════

The candidate's authentic voice is an asset. When you see writing that is already
clear, specific, and impressive, your job is to LEAVE IT ALONE or enhance it
subtly—not to rewrite it into corporate-speak.

Signs of good existing voice (PRESERVE THESE):
- Precise technical terminology
- Specific metrics and outcomes
- Named methodologies, tools, or systems
- Clear cause-and-effect descriptions
- Active, confident phrasing

Signs of template language (AVOID PRODUCING THESE):
- "Results-driven professional"
- "Strong communication skills"
- "Proven track record"
- "Passionate about [generic thing]"
- Bullet points that could apply to anyone

═══════════════════════════════════════════════════════════════════════════════

Return JSON with this structure:
{
  "rewrittenContent": "<the complete rewritten resume as plain text>",
  "changesApplied": ["<description of change 1>", "<change 2>", ...],
  "sectionsModified": ["Summary", "Experience", "Skills", ...],
  "advocatePointsAdopted": ["<which Advocate suggestions were used>", ...],
  "criticCorrectionsApplied": ["<which Critic corrections were applied>", ...],
  "issuesNotAddressed": ["<any issues deliberately not addressed, with reason>", ...],
  "keywordsAdded": ["<job keywords that were woven into the resume>", ...],
  "specificityPreserved": ["<specific terms/details intentionally kept>", ...]
}

CRITICAL: The rewrittenContent must contain the COMPLETE resume with all sections
filled in. Do not return partial content or placeholders.`;
}

function buildUserPrompt(
  context: RoundContext,
  advocateAnalysis: AdvocateAnalysis,
  criticAnalysis: CriticAnalysis
): string {
  const { currentResume, round } = context;

  // Format Advocate's validated contributions
  const validConnections = advocateAnalysis.connections
    .filter(c => c.confidence >= 0.7)
    .map(c => `- "${c.jobRequirement}" ← "${c.resumeEvidence}" (${c.connectionStrength})\n  Framing: ${c.suggestedFraming || 'Use as-is'}`)
    .join('\n');

  const reframings = advocateAnalysis.reframingOpportunities
    .filter(r => r.priority !== 'low')
    .map(r => `- [${r.priority.toUpperCase()}] "${r.currentContent}"\n  → "${r.suggestedReframe}"\n  For: ${r.jobRequirementAddressed}`)
    .join('\n');

  const terminology = advocateAnalysis.terminologyAlignments
    .map(t => `- "${t.resumeTerm}" → "${t.jobTerm}"`)
    .join('\n');

  // Format Critic's corrections
  const blockedClaims = criticAnalysis.challenges
    .filter(c => c.severity === 'critical' || c.severity === 'major')
    .map(c => `- [BLOCKED] ${c.claim}\n  Issue: ${c.issue}\n  ${c.suggestedFix ? `Fix: ${c.suggestedFix}` : 'Cannot be addressed'}`)
    .join('\n');

  const weakenClaims = criticAnalysis.challenges
    .filter(c => c.severity === 'minor' && c.canBeAddressed)
    .map(c => `- [SOFTEN] ${c.claim}\n  Issue: ${c.issue}\n  Fix: ${c.suggestedFix || 'Use more cautious language'}`)
    .join('\n');

  const genuineGaps = criticAnalysis.genuineGaps
    .map(g => `- ${g.requirement}${g.isRequired ? ' (REQUIRED)' : ''}: ${g.reason}`)
    .join('\n');

  const validated = criticAnalysis.validatedStrengths
    .map(s => `- ${s}`)
    .join('\n');

  return `=== ROUND ${round} SYNTHESIS ===

=== ORIGINAL RESUME ===
${currentResume.content}

=== ADVOCATE'S VALIDATED CONNECTIONS ===
${validConnections || 'None with high confidence'}

=== ADVOCATE'S PROPOSED REFRAMINGS ===
${reframings || 'None proposed'}

=== ADVOCATE'S TERMINOLOGY ALIGNMENTS ===
${terminology || 'None identified'}

=== CRITIC'S BLOCKED CLAIMS (DO NOT USE) ===
${blockedClaims || 'None blocked'}

=== CRITIC'S SOFTENING REQUESTS ===
${weakenClaims || 'None'}

=== GENUINE GAPS (CANNOT BE ADDRESSED BY REFRAMING) ===
${genuineGaps || 'None identified'}

=== VALIDATED STRENGTHS (USE CONFIDENTLY) ===
${validated || 'None explicitly validated'}

=== YOUR TASK ===
Rewrite the resume incorporating:
1. Advocate's reframings WHERE the Critic validated or didn't challenge them
2. Critic's corrections and softenings
3. Do NOT claim anything the Critic flagged as an overclaim
4. Emphasize validated strengths
5. Use job terminology where connections are genuine

Produce a complete, coherent resume ready for submission.`;
}

function validateAndNormalize(raw: any, originalResume: Resume): WriterOutput {
  const rewrittenContent = raw.rewrittenContent || originalResume.content;

  return {
    rewrittenResume: {
      id: `${originalResume.id}-committee-v${Date.now()}`,
      content: rewrittenContent,
      format: originalResume.format,
      metadata: {
        ...originalResume.metadata,
        previousVersion: originalResume.id,
        rewrittenAt: new Date().toISOString(),
        rewrittenBy: 'committee'
      }
    },
    changesApplied: Array.isArray(raw.changesApplied) ? raw.changesApplied : [],
    sectionsModified: Array.isArray(raw.sectionsModified) ? raw.sectionsModified : [],
    advocatePointsAdopted: Array.isArray(raw.advocatePointsAdopted)
      ? raw.advocatePointsAdopted
      : [],
    criticCorrectionsApplied: Array.isArray(raw.criticCorrectionsApplied)
      ? raw.criticCorrectionsApplied
      : [],
    issuesNotAddressed: Array.isArray(raw.issuesNotAddressed)
      ? raw.issuesNotAddressed
      : []
  };
}
