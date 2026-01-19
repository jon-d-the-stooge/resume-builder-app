/**
 * LLM Cache
 * 
 * Response caching layer for LLM calls to improve performance
 * and reduce redundant API calls.
 */

import { LLMResponse } from './types';

/**
 * Cache entry with timestamp for TTL management
 */
interface CacheEntry {
  response: LLMResponse;
  timestamp: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttlSeconds: 3600, // 1 hour
  maxEntries: 1000
};

/**
 * LLM response cache implementation
 * Uses FIFO eviction when max entries is reached
 */
export class LLMCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generate cache key from request parameters
   */
  private generateKey(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    model: string
  ): string {
    // Create a deterministic key from request parameters
    const keyData = `${model}|${temperature}|${systemPrompt}|${userPrompt}`;
    
    // Use a simple hash for the key (length + first/last chars + content length)
    const hash = this.simpleHash(keyData);
    return `${model}-${temperature}-${hash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached response if available and not expired
   */
  get(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    model: string
  ): LLMResponse | null {
    if (!this.config.enabled) {
      return null;
    }

    const key = this.generateKey(systemPrompt, userPrompt, temperature, model);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000; // Convert to seconds
    
    if (age > this.config.ttlSeconds) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * Store response in cache
   */
  set(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    model: string,
    response: LLMResponse
  ): void {
    if (!this.config.enabled) {
      return;
    }

    // Enforce max entries limit (FIFO eviction)
    if (this.cache.size >= this.config.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const key = this.generateKey(systemPrompt, userPrompt, temperature, model);
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxEntries: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      enabled: this.config.enabled
    };
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000;
      if (age > this.config.ttlSeconds) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}
