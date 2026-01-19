/**
 * Queue Processor Service
 *
 * Bridges the job queue with the ATS optimization orchestrator.
 * Handles type conversions between queue domain and ATS domain.
 */

import { ATSAgentOrchestrator } from '../ats-agent/orchestrator';
import type {
  JobPosting,
  Resume,
  MatchResult,
  Recommendations,
  Gap,
  Strength
} from '../ats-agent/types';
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
   * Processes a single queued job through ATS optimization
   *
   * @param job - The queued job to process
   * @returns The optimization result with scores, matches, and recommendations
   */
  async processJob(job: QueuedJob): Promise<OptimizationResult> {
    // 1. Convert QueuedJob → JobPosting (ATS domain)
    const jobPosting = this.convertToJobPosting(job);

    // 2. Get resume content from vault
    const resume = await this.getResumeFromVault();

    // 3. Run ATS analysis (single-shot for now)
    const analysisResult = await this.getATSAgent().analyzeMatch(jobPosting, resume);

    // 4. Build OptimizationResult for queue domain
    const result = this.buildOptimizationResult(
      job,
      analysisResult.matchResult,
      analysisResult.recommendations
    );

    return result;
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
   * Builds the queue-domain OptimizationResult from ATS analysis
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
