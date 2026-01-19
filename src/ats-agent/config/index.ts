/**
 * Configuration Management
 * 
 * Centralized configuration for ATS Agent with environment variable support.
 * 
 * Requirement 7.4: Support configurable thresholds, weights, and parameters
 */

import { ATSErrorFactory } from '../errors/types';
import type { OptimizationConfig } from '../types';

/**
 * Complete ATS Agent configuration
 */
export interface ATSAgentConfig {
  // Optimization settings
  optimization: OptimizationConfig;

  // Scoring weights
  scoring: {
    dimensionWeights: {
      keywords: number;
      skills: number;
      attributes: number;
      experience: number;
      level: number;
    };
  };

  // Agent communication settings
  communication: {
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
  };

  // Logging settings
  logging: {
    enabled: boolean;
    maxLogs: number;
  };

  // LLM settings (inherited from shared config)
  llm?: {
    provider: 'anthropic' | 'openai';
    model: string;
    temperature: number;
    maxTokens: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: ATSAgentConfig = {
  optimization: {
    targetScore: 0.8,
    maxIterations: 10,
    earlyStoppingRounds: 2,
    minImprovement: 0.01
  },
  scoring: {
    dimensionWeights: {
      keywords: 0.20,
      skills: 0.35,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10
    }
  },
  communication: {
    timeoutMs: 30000,
    maxRetries: 2,
    retryDelayMs: 1000
  },
  logging: {
    enabled: true,
    maxLogs: 5000
  }
};

/**
 * Configuration manager
 */
export class ConfigManager {
  private config: ATSAgentConfig;

  constructor(config?: Partial<ATSAgentConfig>) {
    this.config = this.loadConfig(config);
    this.validateConfig();
  }

  /**
   * Load configuration from environment variables and provided config
   */
  private loadConfig(providedConfig?: Partial<ATSAgentConfig>): ATSAgentConfig {
    const envConfig: Partial<ATSAgentConfig> = {
      optimization: {
        targetScore: this.parseFloat(process.env.ATS_TARGET_SCORE, DEFAULT_CONFIG.optimization.targetScore),
        maxIterations: this.parseInt(process.env.ATS_MAX_ITERATIONS, DEFAULT_CONFIG.optimization.maxIterations),
        earlyStoppingRounds: this.parseInt(process.env.ATS_EARLY_STOPPING_ROUNDS, DEFAULT_CONFIG.optimization.earlyStoppingRounds),
        minImprovement: this.parseFloat(process.env.ATS_MIN_IMPROVEMENT, DEFAULT_CONFIG.optimization.minImprovement)
      },
      scoring: {
        dimensionWeights: {
          keywords: this.parseFloat(process.env.ATS_WEIGHT_KEYWORDS, DEFAULT_CONFIG.scoring.dimensionWeights.keywords),
          skills: this.parseFloat(process.env.ATS_WEIGHT_SKILLS, DEFAULT_CONFIG.scoring.dimensionWeights.skills),
          attributes: this.parseFloat(process.env.ATS_WEIGHT_ATTRIBUTES, DEFAULT_CONFIG.scoring.dimensionWeights.attributes),
          experience: this.parseFloat(process.env.ATS_WEIGHT_EXPERIENCE, DEFAULT_CONFIG.scoring.dimensionWeights.experience),
          level: this.parseFloat(process.env.ATS_WEIGHT_LEVEL, DEFAULT_CONFIG.scoring.dimensionWeights.level)
        }
      },
      communication: {
        timeoutMs: this.parseInt(process.env.ATS_AGENT_TIMEOUT_MS, DEFAULT_CONFIG.communication.timeoutMs),
        maxRetries: this.parseInt(process.env.ATS_AGENT_MAX_RETRIES, DEFAULT_CONFIG.communication.maxRetries),
        retryDelayMs: this.parseInt(process.env.ATS_AGENT_RETRY_DELAY_MS, DEFAULT_CONFIG.communication.retryDelayMs)
      },
      logging: {
        enabled: process.env.ATS_LOGGING_ENABLED !== 'false',
        maxLogs: this.parseInt(process.env.ATS_MAX_LOGS, DEFAULT_CONFIG.logging.maxLogs)
      }
    };

    // Merge: DEFAULT_CONFIG < envConfig < providedConfig
    return this.deepMerge(
      DEFAULT_CONFIG,
      this.deepMerge(envConfig, providedConfig || {})
    );
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    const { optimization, scoring } = this.config;

    // Validate target score
    if (optimization.targetScore < 0 || optimization.targetScore > 1) {
      throw ATSErrorFactory.configurationError(
        'targetScore',
        'Must be between 0 and 1'
      );
    }

    // Validate max iterations
    if (optimization.maxIterations < 1) {
      throw ATSErrorFactory.configurationError(
        'maxIterations',
        'Must be at least 1'
      );
    }

    // Validate early stopping rounds
    if (optimization.earlyStoppingRounds < 1) {
      throw ATSErrorFactory.configurationError(
        'earlyStoppingRounds',
        'Must be at least 1'
      );
    }

    // Validate min improvement
    if (optimization.minImprovement < 0) {
      throw ATSErrorFactory.configurationError(
        'minImprovement',
        'Must be non-negative'
      );
    }

    // Validate dimension weights sum to 1.0
    const weightSum =
      scoring.dimensionWeights.keywords +
      scoring.dimensionWeights.skills +
      scoring.dimensionWeights.attributes +
      scoring.dimensionWeights.experience +
      scoring.dimensionWeights.level;

    if (Math.abs(weightSum - 1.0) > 0.01) {
      throw ATSErrorFactory.configurationError(
        'dimensionWeights',
        `Weights must sum to 1.0 (current sum: ${weightSum})`
      );
    }

    // Validate each weight is non-negative
    for (const [key, value] of Object.entries(scoring.dimensionWeights)) {
      if (value < 0) {
        throw ATSErrorFactory.configurationError(
          `dimensionWeights.${key}`,
          'Must be non-negative'
        );
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig(): ATSAgentConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ATSAgentConfig>): void {
    this.config = this.deepMerge(this.config, updates);
    this.validateConfig();
  }

  /**
   * Get optimization config
   */
  getOptimizationConfig(): OptimizationConfig {
    return { ...this.config.optimization };
  }

  /**
   * Get scoring weights
   */
  getScoringWeights() {
    return { ...this.config.scoring.dimensionWeights };
  }

  /**
   * Parse integer from environment variable
   */
  private parseInt(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Parse float from environment variable
   */
  private parseFloat(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        (result as any)[key] = this.deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        (result as any)[key] = sourceValue;
      }
    }

    return result;
  }
}

/**
 * Global configuration instance
 */
let globalConfig: ConfigManager | null = null;

/**
 * Initialize global configuration
 */
export function initializeConfig(config?: Partial<ATSAgentConfig>): ConfigManager {
  globalConfig = new ConfigManager(config);
  return globalConfig;
}

/**
 * Get global configuration
 */
export function getConfig(): ConfigManager {
  if (!globalConfig) {
    globalConfig = new ConfigManager();
  }
  return globalConfig;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  globalConfig = new ConfigManager();
}
