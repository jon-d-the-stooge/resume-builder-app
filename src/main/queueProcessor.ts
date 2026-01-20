/**
 * Queue Processor Service
 *
 * Bridges the job queue with the ATS holistic optimization system.
 * Uses the holistic optimizer for better semantic understanding and resume rewriting.
 */

import { ATSAgentOrchestrator } from '../ats-agent/orchestrator';
import {
  optimizeResume as holisticOptimize,
  HolisticOptimizationResult,
  OptimizationIteration
} from '../ats-agent/holistic/orchestrator';
import type {
  JobPosting,
  Resume,
  MatchResult,
  Recommendations,
  Gap,
  Strength
} from '../ats-agent/types';
import type { ReframingRecommendation } from '../ats-agent/holistic/holisticAnalyzer';
import { jobQueue, QueuedJob, OptimizationResult } from './jobQueue';
import { contentManager } from './contentManager';
import { ContentType } from '../types';
import { settingsStore } from './settingsStore';
import { LLMClient } from '../shared/llm/client';

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
   * @returns The optimization result with scores, matches, recommendations, and optimized content
   */
  async processJob(job: QueuedJob): Promise<OptimizationResult> {
    // 1. Convert QueuedJob → JobPosting (ATS domain)
    const jobPosting = this.convertToJobPosting(job);

    // 2. Get resume content from vault
    const resume = await this.getResumeFromVault();

    console.log('[QueueProcessor] Starting holistic optimization for:', job.title);
    console.log('[QueueProcessor] Resume content length:', resume.content.length);
    console.log('[QueueProcessor] Job description length:', jobPosting.description?.length || 0);

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
   * Retrieves resume content from the Obsidian vault
   *
   * Searches for job entries and their associated accomplishments
   * to build a complete resume representation.
   */
  private async getResumeFromVault(): Promise<Resume> {
    const contentParts: string[] = [];

    // Get job entries (work experience)
    const jobEntries = await contentManager.searchContentItems({
      contentType: ContentType.JOB_ENTRY
    });

    for (const job of jobEntries) {
      const jobContent: string[] = [];
      jobContent.push(`## ${job.content}`);

      // Add metadata
      if (job.metadata?.company) {
        jobContent.push(`Company: ${job.metadata.company}`);
      }
      if (job.metadata?.location) {
        jobContent.push(`Location: ${job.metadata.location}`);
      }
      if (job.metadata?.dateRange) {
        const dr = job.metadata.dateRange;
        jobContent.push(`Duration: ${dr.start} - ${dr.end || 'Present'}`);
      }

      contentParts.push(jobContent.join('\n'));
    }

    // Get accomplishments
    const accomplishments = await contentManager.searchContentItems({
      contentType: ContentType.ACCOMPLISHMENT
    });

    if (accomplishments.length > 0) {
      contentParts.push('\n## Accomplishments');
      for (const acc of accomplishments) {
        contentParts.push(`- ${acc.content}`);
      }
    }

    // Get skills
    const skills = await contentManager.searchContentItems({
      contentType: ContentType.SKILL
    });

    if (skills.length > 0) {
      contentParts.push('\n## Skills');
      const skillNames = skills.map(s => s.content);
      contentParts.push(skillNames.join(', '));
    }

    // Get education
    const education = await contentManager.searchContentItems({
      contentType: ContentType.EDUCATION
    });

    if (education.length > 0) {
      contentParts.push('\n## Education');
      for (const edu of education) {
        contentParts.push(`- ${edu.content}`);
      }
    }

    // Get certifications
    const certifications = await contentManager.searchContentItems({
      contentType: ContentType.CERTIFICATION
    });

    if (certifications.length > 0) {
      contentParts.push('\n## Certifications');
      for (const cert of certifications) {
        contentParts.push(`- ${cert.content}`);
      }
    }

    const content = contentParts.join('\n\n');

    // Handle case where no resume content exists
    if (!content.trim()) {
      throw new Error('No resume content found in vault. Please upload a resume first.');
    }

    return {
      id: 'user-resume',
      content,
      format: 'markdown',
      metadata: {
        source: 'obsidian-vault',
        generatedAt: new Date().toISOString(),
        itemCounts: {
          jobEntries: jobEntries.length,
          accomplishments: accomplishments.length,
          skills: skills.length,
          education: education.length,
          certifications: certifications.length
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
