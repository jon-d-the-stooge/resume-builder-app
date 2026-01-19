/**
 * External Agent Client
 * 
 * Handles communication with external agents (Job Search Agent, Resume Writer Agent).
 * Implements timeout handling and request/response validation.
 * 
 * Requirements: 7.1, 8.2
 */

import { ATSLogger } from '../logging/logger';
import { ATSErrorFactory } from '../errors/types';
import { jobPostingValidator, resumeValidator, recommendationsValidator } from '../validation';
import type {
  JobSearchPayload,
  JobSearchResponse,
  ResumeWriterRequest,
  ResumeWriterResponse,
  JobSearchResultPayload
} from './protocols';

/**
 * Agent client configuration
 */
export interface AgentClientConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AgentClientConfig = {
  timeoutMs: 30000, // 30 seconds
  maxRetries: 2,
  retryDelayMs: 1000
};

/**
 * External Agent Client
 */
export class ExternalAgentClient {
  private config: AgentClientConfig;

  constructor(config?: Partial<AgentClientConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  /**
   * Send recommendations to Resume Writer Agent
   * 
   * In a real implementation, this would make an HTTP request or call an API.
   * For now, this is a placeholder that demonstrates the interface.
   */
  async sendRecommendations(
    request: ResumeWriterRequest,
    handler?: (request: ResumeWriterRequest) => Promise<ResumeWriterResponse>
  ): Promise<ResumeWriterResponse> {
    const startTime = Date.now();

    try {
      ATSLogger.logInfo('Sending recommendations to Resume Writer Agent', {
        requestId: request.request_id,
        jobId: request.job_id,
        resumeId: request.resume_id,
        iteration: request.iteration_round
      });

      // Validate request
      const validationResult = recommendationsValidator.validate({
        summary: request.recommendations.summary,
        priority: request.recommendations.priority,
        optional: request.recommendations.optional,
        rewording: request.recommendations.rewording,
        metadata: {
          iterationRound: request.iteration_round,
          currentScore: request.current_score,
          targetScore: request.target_score
        }
      });

      if (!validationResult.isValid) {
        throw ATSErrorFactory.invalidInput(
          'recommendations',
          'Invalid recommendations format',
          validationResult.errors
        );
      }

      // If handler is provided, use it (for testing or custom implementations)
      if (handler) {
        const response = await this.withTimeout(
          handler(request),
          this.config.timeoutMs,
          'Resume Writer Agent'
        );

        const duration = Date.now() - startTime;
        ATSLogger.logInfo('Received response from Resume Writer Agent', {
          requestId: request.request_id,
          responseId: response.response_id,
          durationMs: duration
        });

        return response;
      }

      // Default: throw error indicating no handler configured
      throw new Error(
        'No Resume Writer Agent handler configured. ' +
        'Provide a handler function or implement external API communication.'
      );
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'send_recommendations',
          requestId: request.request_id
        }
      );
      throw error;
    }
  }

  /**
   * Send final result to Job Search Agent
   */
  async sendResult(
    result: JobSearchResultPayload,
    handler?: (result: JobSearchResultPayload) => Promise<void>
  ): Promise<void> {
    try {
      ATSLogger.logInfo('Sending final result to Job Search Agent', {
        jobId: result.job_id,
        resumeId: result.resume_id,
        finalScore: result.final_score
      });

      if (handler) {
        await this.withTimeout(
          handler(result),
          this.config.timeoutMs,
          'Job Search Agent'
        );

        ATSLogger.logInfo('Result sent to Job Search Agent', {
          jobId: result.job_id
        });

        return;
      }

      // Default: log result (no external communication)
      ATSLogger.logInfo('No Job Search Agent handler configured. Result logged only.', {
        result
      });
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'send_result',
          jobId: result.job_id
        }
      );
      throw error;
    }
  }

  /**
   * Receive job posting from Job Search Agent
   */
  async receiveJobPosting(
    payload: JobSearchPayload
  ): Promise<JobSearchResponse> {
    try {
      ATSLogger.logInfo('Received job posting from Job Search Agent', {
        jobId: payload.job.id,
        title: payload.job.title
      });

      // Validate job posting
      const validationResult = jobPostingValidator.validate({
        id: payload.job.id,
        title: payload.job.title,
        description: payload.job.description,
        requirements: payload.job.requirements,
        qualifications: payload.job.qualifications
      });

      if (!validationResult.isValid) {
        return {
          status: 'rejected',
          job_id: payload.job.id,
          message: 'Job posting validation failed',
          errors: validationResult.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        };
      }

      return {
        status: 'accepted',
        job_id: payload.job.id,
        message: 'Job posting accepted for processing'
      };
    } catch (error) {
      ATSLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'receive_job_posting',
          jobId: payload.job.id
        }
      );

      return {
        status: 'rejected',
        job_id: payload.job.id,
        message: 'Internal error processing job posting'
      };
    }
  }

  /**
   * Wrap operation with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    agentName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(ATSErrorFactory.agentTimeout(agentName, timeoutMs)),
          timeoutMs
        )
      )
    ]);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgentClientConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentClientConfig {
    return { ...this.config };
  }
}

/**
 * Create a new external agent client
 */
export function createAgentClient(config?: Partial<AgentClientConfig>): ExternalAgentClient {
  return new ExternalAgentClient(config);
}
