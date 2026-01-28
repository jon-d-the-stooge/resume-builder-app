/**
 * Queue Processor Service
 *
 * Bridges the job queue with the ATS holistic optimization system.
 * Uses the holistic optimizer for better semantic understanding and resume rewriting.
 */

import { ATSAgentOrchestrator } from '../../ats-agent/orchestrator';
import {
  optimizeResume as holisticOptimize,
  HolisticOptimizationResult,
  OptimizationIteration
} from '../../ats-agent/holistic/orchestrator';
import type {
  JobPosting,
  Resume,
  MatchResult,
  Recommendations,
  Gap,
  Strength
} from '../../ats-agent/types';
import type { ReframingRecommendation } from '../../ats-agent/holistic/holisticAnalyzer';
import { jobQueue, QueuedJob, OptimizationResult } from './jobQueue';
import { vaultManager } from './vaultManager';
import { contentManager } from './contentManager';
import { knowledgeBaseStore } from './knowledgeBaseStore';
import { ContentType } from '../obsidian/types';
import type { Vault, VaultSection, SectionObject, VaultItem } from '../../types/vault';
import { settingsStore } from './settingsStore';
import { LLMClient } from '../llm/client';

/**
 * Processes queued jobs through the ATS optimization system
 */
export class QueueProcessor {
  private atsAgent: ATSAgentOrchestrator | null = null;

  /**
   * Lazily initializes the ATS agent on first use.
   * This prevents the app from crashing at startup if API keys are not configured.
   */
  private getATSAgent(): ATSAgentOrchestrator {
    if (!this.atsAgent) {
      const apiKey = settingsStore.getApiKey();
      const provider = settingsStore.getProvider() || 'anthropic';

      if (!apiKey) {
        throw new Error('API key not configured. Please set your API key in Settings.');
      }

      // Build LLM config - only include model if explicitly set
      const llmConfig: { apiKey: string; provider: 'anthropic' | 'openai'; model?: string } = {
        apiKey,
        provider
      };
      const defaultModel = settingsStore.getDefaultModel();
      if (defaultModel) {
        llmConfig.model = defaultModel;
      }

      const llmClient = new LLMClient(llmConfig);

      this.atsAgent = new ATSAgentOrchestrator(
        {
          targetScore: 0.8,
          maxIterations: 10,
          earlyStoppingRounds: 2,
          minImprovement: 0.01
        },
        llmClient
      );
    }
    return this.atsAgent;
  }

  /**
   * Processes a single queued job through holistic ATS optimization
   *
   * Uses the holistic optimizer for better semantic understanding
   * and to produce optimized resume content.
   *
   * @param job - The queued job to process
   * @param userId - The user ID for vault/knowledge base operations
   * @param resumeContent - Optional resume content provided directly (skips vault lookup)
   * @returns The optimization result with scores, matches, recommendations, and optimized content
   */
  async processJob(job: QueuedJob, userId: string, resumeContent?: string): Promise<OptimizationResult> {
    console.log('OPTIMIZE PROCESSOR: running');
    // 1. Convert QueuedJob → JobPosting (ATS domain)
    const jobPosting = this.convertToJobPosting(job);

    // 2. Get resume content - use provided content or fall back to vault
    let resume: Resume;
    if (resumeContent) {
      console.log('[QueueProcessor] Using provided resume content, length:', resumeContent.length);
      resume = {
        id: 'provided-resume',
        content: resumeContent,
        format: 'markdown',
        metadata: {
          source: 'user-provided',
          generatedAt: new Date().toISOString()
        }
      };
    } else {
      resume = await this.getResumeFromVault(userId);
    }

    console.log('[QueueProcessor] Starting holistic optimization for:', job.title);
    console.log('[QueueProcessor] Resume content length:', resume.content.length);
    console.log('[QueueProcessor] Job description length:', jobPosting.description?.length || 0);

    // Validate resume has meaningful content (not just section headers)
    const meaningfulContent = resume.content.replace(/##\s*\w+/g, '').trim();
    if (!meaningfulContent || meaningfulContent.length < 50) {
      console.error('[QueueProcessor] Resume content is empty or too short:', resume.content.substring(0, 200));
      throw new Error('No resume content found. Please upload a resume or add work experience before running optimization.');
    }

    // 3. Run holistic optimization (produces rewritten resume)
    const llmClient = this.getLLMClient();
    const holisticResult = await holisticOptimize(
      jobPosting,
      resume,
      llmClient,
      {
        targetFit: 0.8,
        maxIterations: 3,
        minImprovement: 0.05
      }
    );

    console.log('[QueueProcessor] Holistic optimization complete');
    console.log('[QueueProcessor] Final fit:', holisticResult.finalFit);
    console.log('[QueueProcessor] Iterations:', holisticResult.iterations.length);

    // 4. Build OptimizationResult from holistic result
    const result = this.buildOptimizationResultFromHolistic(job, holisticResult);

    // 5. Auto-save to Knowledge Base
    if (result.optimizedContent) {
      const lastAnalysis = holisticResult.iterations[holisticResult.iterations.length - 1]?.analysis;

      try {
        const kbSaved = await knowledgeBaseStore.save(userId, {
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.rawDescription,
          sourceUrl: job.sourceUrl,
          optimizedResume: result.optimizedContent,
          analysis: {
            finalScore: result.finalScore,
            initialScore: result.previousScore,
            iterations: holisticResult.iterations.length,
            strengths: lastAnalysis?.strengths || [],
            gaps: lastAnalysis?.gaps || [],
            recommendations: (lastAnalysis?.recommendations || []).map(rec => ({
              priority: rec.priority || 'medium',
              suggestion: rec.suggestedReframe || String(rec),
              rationale: rec.rationale
            }))
          }
        });
        console.log('[QueueProcessor] Saved to Knowledge Base:', kbSaved?.id);
      } catch (err) {
        console.error('[QueueProcessor] Failed to save to Knowledge Base:', err);
      }
    }

    return result;
  }

  /**
   * Gets a configured LLM client
   */
  private getLLMClient(): LLMClient {
    const apiKey = settingsStore.getApiKey();
    const provider = settingsStore.getProvider() || 'anthropic';

    if (!apiKey) {
      throw new Error('API key not configured. Please set your API key in Settings.');
    }

    const llmConfig: { apiKey: string; provider: 'anthropic' | 'openai'; model?: string } = {
      apiKey,
      provider
    };
    const defaultModel = settingsStore.getDefaultModel();
    if (defaultModel) {
      llmConfig.model = defaultModel;
    }

    return new LLMClient(llmConfig);
  }

  /**
   * Converts a QueuedJob to the ATS JobPosting format
   */
  private convertToJobPosting(job: QueuedJob): JobPosting {
    // Build requirements string from parsed elements
    let requirements = '';
    if (job.parsedElements?.requiredSkills?.length) {
      requirements = job.parsedElements.requiredSkills.join('\n');
    }

    // Build qualifications string from parsed elements
    let qualifications = '';
    if (job.parsedElements?.qualifications?.length) {
      qualifications = job.parsedElements.qualifications.join('\n');
    }

    // If no parsed elements, extract from raw description as fallback
    if (!requirements && !qualifications && job.rawDescription) {
      // The raw description contains everything - ATS parser will handle it
      requirements = job.rawDescription;
    }

    return {
      id: job.id,
      title: job.title,
      description: job.rawDescription,
      requirements,
      qualifications,
      metadata: {
        company: job.company,
        sourceUrl: job.sourceUrl,
        addedAt: job.addedAt.toISOString(),
        priority: job.priority
      }
    };
  }

  /**
   * Retrieves resume content from the hierarchical vault
   *
   * Traverses the vault sections to build a complete resume representation.
   */
  private async getResumeFromVault(userId: string): Promise<Resume> {
    const contentParts: string[] = [];
    let jobCount = 0;
    let accomplishmentCount = 0;
    let skillCount = 0;
    let educationCount = 0;
    let certificationCount = 0;

    // Get all vaults and use the first one (or most recent)
    const vaults = await vaultManager.getAllVaults(userId);
    console.log('[QueueProcessor.getResumeFromVault] Found', vaults.length, 'vaults for user:', userId);
    if (vaults.length === 0) {
      console.log('[QueueProcessor.getResumeFromVault] No vaults, falling back to content store');
      return this.getResumeFromContentStore();
    }

    // Use the most recently updated vault
    const vault = vaults.sort((a, b) =>
      new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
    )[0];
    console.log('[QueueProcessor.getResumeFromVault] Using vault:', vault.id, 'with', vault.sections.length, 'sections');

    // Process each section in the vault
    for (const section of vault.sections) {
      switch (section.type) {
        case 'experience': {
          // Get job entries (work experience)
          for (const obj of section.objects) {
            const jobContent: string[] = [];
            const meta = obj.metadata as any;
            jobContent.push(`## ${meta?.title || obj.id}`);

            if (meta?.company) {
              jobContent.push(`Company: ${meta.company}`);
            }
            if (meta?.location) {
              const loc = meta.location;
              const locStr = typeof loc === 'string' ? loc :
                [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
              jobContent.push(`Location: ${locStr}`);
            }
            if (meta?.dateRange) {
              const dr = meta.dateRange;
              jobContent.push(`Duration: ${dr.start} - ${dr.end || 'Present'}`);
            }

            // Add accomplishments from items
            if (obj.items.length > 0) {
              jobContent.push('\nAccomplishments:');
              for (const item of obj.items) {
                jobContent.push(`- ${item.content}`);
                accomplishmentCount++;
              }
            }

            contentParts.push(jobContent.join('\n'));
            jobCount++;
          }
          break;
        }

        case 'skills': {
          const skillNames: string[] = [];
          for (const obj of section.objects) {
            // Skills can be objects with items, or the object itself is the skill
            if (obj.items.length > 0) {
              for (const item of obj.items) {
                skillNames.push(item.content);
                skillCount++;
              }
            } else {
              const meta = obj.metadata as any;
              skillNames.push(meta?.name || obj.id);
              skillCount++;
            }
          }
          if (skillNames.length > 0) {
            contentParts.push('\n## Skills');
            contentParts.push(skillNames.join(', '));
          }
          break;
        }

        case 'education': {
          const eduContent: string[] = ['\n## Education'];
          for (const obj of section.objects) {
            const meta = obj.metadata as any;
            const degree = meta?.degree || '';
            const institution = meta?.institution || '';
            const year = meta?.graduationYear || meta?.dateRange?.end || '';
            eduContent.push(`- ${degree}${institution ? ` - ${institution}` : ''}${year ? ` (${year})` : ''}`);
            educationCount++;
          }
          if (educationCount > 0) {
            contentParts.push(eduContent.join('\n'));
          }
          break;
        }

        case 'certifications': {
          const certContent: string[] = ['\n## Certifications'];
          for (const obj of section.objects) {
            const meta = obj.metadata as any;
            const name = meta?.name || meta?.title || obj.id;
            const issuer = meta?.issuer || '';
            const year = meta?.dateObtained || meta?.year || '';
            certContent.push(`- ${name}${issuer ? ` (${issuer})` : ''}${year ? ` - ${year}` : ''}`);
            certificationCount++;
          }
          if (certificationCount > 0) {
            contentParts.push(certContent.join('\n'));
          }
          break;
        }

        case 'projects': {
          const projContent: string[] = ['\n## Projects'];
          for (const obj of section.objects) {
            const meta = obj.metadata as any;
            const name = meta?.name || meta?.title || obj.id;
            const desc = meta?.description || '';
            projContent.push(`- ${name}${desc ? `: ${desc}` : ''}`);

            // Add project items/details
            for (const item of obj.items) {
              projContent.push(`  - ${item.content}`);
            }
          }
          if (section.objects.length > 0) {
            contentParts.push(projContent.join('\n'));
          }
          break;
        }
      }
    }

    const content = contentParts.join('\n\n');
    console.log('[QueueProcessor.getResumeFromVault] Built content from vault, length:', content.length);

    // Handle case where no resume content exists
    if (!content.trim()) {
      console.log('[QueueProcessor.getResumeFromVault] Vault content empty, falling back to content store');
      return this.getResumeFromContentStore();
    }

    return {
      id: vault.id,
      content,
      format: 'markdown',
      metadata: {
        source: 'hierarchical-vault',
        generatedAt: new Date().toISOString(),
        itemCounts: {
          jobEntries: jobCount,
          accomplishments: accomplishmentCount,
          skills: skillCount,
          education: educationCount,
          certifications: certificationCount
        }
      }
    };
  }

  private async getResumeFromContentStore(): Promise<Resume> {
    console.log('[QueueProcessor.getResumeFromContentStore] Fetching from content store...');
    const types = [
      ContentType.JOB_ENTRY,
      ContentType.EDUCATION,
      ContentType.SKILL,
      ContentType.ACCOMPLISHMENT,
      ContentType.CERTIFICATION
    ];

    const allItems = [];
    for (const type of types) {
      const items = await contentManager.searchContentItems({ contentType: type });
      console.log(`[QueueProcessor.getResumeFromContentStore] Found ${items.length} items of type ${type}`);
      allItems.push(...items);
    }

    const content = allItems.map((item) => item.content).join('\n\n');
    console.log('[QueueProcessor.getResumeFromContentStore] Total items:', allItems.length, 'content length:', content.length);
    if (!content.trim()) {
      throw new Error('No resume content found. Please upload a resume first.');
    }

    const jobEntries = allItems.filter((i) => i.type === ContentType.JOB_ENTRY).length;
    const accomplishments = allItems.filter((i) => i.type === ContentType.ACCOMPLISHMENT).length;
    const skills = allItems.filter((i) => i.type === ContentType.SKILL).length;
    const education = allItems.filter((i) => i.type === ContentType.EDUCATION).length;
    const certifications = allItems.filter((i) => i.type === ContentType.CERTIFICATION).length;

    return {
      id: 'content-store-resume',
      content,
      format: 'markdown',
      metadata: {
        source: 'content-store',
        generatedAt: new Date().toISOString(),
        itemCounts: {
          jobEntries,
          accomplishments,
          skills,
          education,
          certifications
        }
      }
    };
  }

  /**
   * Builds the queue-domain OptimizationResult from ATS analysis (legacy)
   */
  private buildOptimizationResult(
    job: QueuedJob,
    matchResult: MatchResult,
    recommendations: Recommendations
  ): OptimizationResult {
    return {
      jobId: job.id,
      finalScore: matchResult.overallScore,
      previousScore: 0, // First analysis, no previous score
      matchedSkills: this.convertStrengthsToSkills(matchResult.strengths),
      missingSkills: this.convertGapsToMissingSkills(matchResult.gaps),
      gaps: this.convertGapsForQueue(matchResult.gaps),
      recommendations: this.extractRecommendationStrings(recommendations),
      optimizedContent: undefined, // Single-shot doesn't produce optimized content
      processedAt: new Date()
    };
  }

  /**
   * Builds the queue-domain OptimizationResult from holistic optimization
   */
  private buildOptimizationResultFromHolistic(
    job: QueuedJob,
    holisticResult: HolisticOptimizationResult
  ): OptimizationResult {
    // Get the last iteration's analysis for strengths/gaps/recommendations
    const lastIteration = holisticResult.iterations[holisticResult.iterations.length - 1];
    const analysis = lastIteration?.analysis;

    // Convert strengths to matched skills format
    const matchedSkills = (analysis?.strengths || []).map((strength, index) => ({
      name: strength,
      importance: 1 - (index * 0.1) // Decreasing importance by position
    }));

    // Convert gaps to missing skills and gaps format
    const gaps = (analysis?.gaps || []).map((gap, index) => ({
      name: gap,
      importance: 1 - (index * 0.1),
      suggestion: `Consider addressing: "${gap}"`
    }));

    const missingSkills = gaps.map(g => ({
      name: g.name,
      importance: g.importance
    }));

    // Convert recommendations to strings, handling both ReframingRecommendation objects and strings
    const recommendations = (analysis?.recommendations || []).map((rec: ReframingRecommendation) => {
      if (typeof rec === 'string') return rec;
      const priority = rec.priority ? `[${rec.priority.toUpperCase()}]` : '';
      const suggestion = rec.suggestedReframe || '';
      const rationale = rec.rationale ? ` - ${rec.rationale}` : '';
      return `${priority} ${suggestion}${rationale}`.trim();
    });

    return {
      jobId: job.id,
      finalScore: holisticResult.finalFit,
      previousScore: holisticResult.initialFit,
      matchedSkills,
      missingSkills,
      gaps,
      recommendations,
      optimizedContent: holisticResult.finalResume?.content, // Now we have optimized content!
      processedAt: new Date()
    };
  }

  /**
   * Converts ATS Strength[] to queue matchedSkills format
   */
  private convertStrengthsToSkills(
    strengths: Strength[]
  ): Array<{ name: string; importance: number }> {
    return strengths.map(strength => ({
      name: strength.element.text || strength.element.normalizedText,
      importance: strength.contribution
    }));
  }

  /**
   * Converts ATS Gap[] to queue missingSkills format
   */
  private convertGapsToMissingSkills(
    gaps: Gap[]
  ): Array<{ name: string; importance: number }> {
    return gaps.map(gap => ({
      name: gap.element.text || gap.element.normalizedText,
      importance: gap.importance
    }));
  }

  /**
   * Converts ATS Gap[] to queue gaps format with suggestions
   */
  private convertGapsForQueue(
    gaps: Gap[]
  ): Array<{ name: string; importance: number; suggestion: string }> {
    return gaps.map(gap => ({
      name: gap.element.text || gap.element.normalizedText,
      importance: gap.importance,
      suggestion: `Consider addressing ${gap.category}: "${gap.element.text}"`
    }));
  }

  /**
   * Extracts recommendation strings from ATS Recommendations
   */
  private extractRecommendationStrings(recommendations: Recommendations): string[] {
    const result: string[] = [];

    // Add summary first
    if (recommendations.summary) {
      result.push(recommendations.summary);
    }

    // Add priority recommendations
    for (const rec of recommendations.priority) {
      result.push(`[${rec.type.toUpperCase()}] ${rec.suggestion}`);
    }

    // Add optional recommendations
    for (const rec of recommendations.optional) {
      result.push(`[OPTIONAL] ${rec.suggestion}`);
    }

    return result;
  }

  /**
   * Gets the current ATS agent configuration
   */
  getConfig() {
    return this.getATSAgent().getConfig();
  }

  /**
   * Updates the ATS agent configuration
   */
  updateConfig(config: Parameters<ATSAgentOrchestrator['updateConfig']>[0]) {
    this.getATSAgent().updateConfig(config);
  }
}

// Export singleton instance
export const queueProcessor = new QueueProcessor();
