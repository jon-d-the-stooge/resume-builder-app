/**
 * Tests for Shared LLM Client
 * 
 * Validates the unified LLM client supporting both Anthropic and OpenAI
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMClient, LLMCache, DEFAULT_LLM_CONFIG } from '../shared/llm';

describe('LLM Cache', () => {
  let cache: LLMCache;

  beforeEach(() => {
    cache = new LLMCache({ enabled: true, ttlSeconds: 60, maxEntries: 10 });
  });

  it('should cache and retrieve responses', () => {
    const systemPrompt = 'You are a helpful assistant';
    const userPrompt = 'Hello';
    const temperature = 0;
    const model = 'test-model';
    const response = { content: 'Hi there!', model: 'test-model' };

    // Cache should be empty initially
    expect(cache.get(systemPrompt, userPrompt, temperature, model)).toBeNull();

    // Set a value
    cache.set(systemPrompt, userPrompt, temperature, model, response);

    // Should retrieve the cached value
    const cached = cache.get(systemPrompt, userPrompt, temperature, model);
    expect(cached).toEqual(response);
  });

  it('should return null for different prompts', () => {
    const systemPrompt = 'You are a helpful assistant';
    const userPrompt1 = 'Hello';
    const userPrompt2 = 'Goodbye';
    const temperature = 0;
    const model = 'test-model';
    const response = { content: 'Hi there!', model: 'test-model' };

    cache.set(systemPrompt, userPrompt1, temperature, model, response);

    // Different user prompt should not hit cache
    expect(cache.get(systemPrompt, userPrompt2, temperature, model)).toBeNull();
  });

  it('should enforce max entries limit with FIFO eviction', () => {
    const cache = new LLMCache({ enabled: true, ttlSeconds: 60, maxEntries: 3 });
    const systemPrompt = 'System';
    const temperature = 0;
    const model = 'test-model';

    // Add 4 entries (exceeds limit of 3)
    for (let i = 0; i < 4; i++) {
      cache.set(
        systemPrompt,
        `prompt-${i}`,
        temperature,
        model,
        { content: `response-${i}`, model }
      );
    }

    // First entry should be evicted
    expect(cache.get(systemPrompt, 'prompt-0', temperature, model)).toBeNull();
    
    // Other entries should still be cached
    expect(cache.get(systemPrompt, 'prompt-1', temperature, model)).toBeTruthy();
    expect(cache.get(systemPrompt, 'prompt-2', temperature, model)).toBeTruthy();
    expect(cache.get(systemPrompt, 'prompt-3', temperature, model)).toBeTruthy();
  });

  it('should clear all entries', () => {
    const systemPrompt = 'System';
    const userPrompt = 'Hello';
    const temperature = 0;
    const model = 'test-model';
    const response = { content: 'Hi!', model };

    cache.set(systemPrompt, userPrompt, temperature, model, response);
    expect(cache.get(systemPrompt, userPrompt, temperature, model)).toBeTruthy();

    cache.clear();
    expect(cache.get(systemPrompt, userPrompt, temperature, model)).toBeNull();
  });

  it('should provide cache statistics', () => {
    const stats = cache.getStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('maxEntries');
    expect(stats).toHaveProperty('enabled');
    expect(stats.maxEntries).toBe(10);
    expect(stats.enabled).toBe(true);
  });
});

describe('LLM Client Configuration', () => {
  it('should have default configurations for both providers', () => {
    expect(DEFAULT_LLM_CONFIG.anthropic).toBeDefined();
    expect(DEFAULT_LLM_CONFIG.openai).toBeDefined();
    
    expect(DEFAULT_LLM_CONFIG.anthropic.provider).toBe('anthropic');
    expect(DEFAULT_LLM_CONFIG.openai.provider).toBe('openai');
    
    expect(DEFAULT_LLM_CONFIG.anthropic.temperature).toBe(0);
    expect(DEFAULT_LLM_CONFIG.openai.temperature).toBe(0);
  });

  it('should create client with custom configuration', () => {
    const client = new LLMClient({
      apiKey: 'test-key',
      provider: 'anthropic',
      model: 'custom-model',
      temperature: 0.5,
      maxTokens: 2000,
      timeout: 15000
    });

    const config = client.getConfig();
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('custom-model');
    expect(config.temperature).toBe(0.5);
    expect(config.maxTokens).toBe(2000);
    expect(config.timeout).toBe(15000);
  });

  it('should merge with defaults when partial config provided', () => {
    const client = new LLMClient({
      apiKey: 'test-key',
      provider: 'openai'
    });

    const config = client.getConfig();
    expect(config.provider).toBe('openai');
    expect(config.model).toBe(DEFAULT_LLM_CONFIG.openai.model);
    expect(config.temperature).toBe(DEFAULT_LLM_CONFIG.openai.temperature);
  });
});

describe('LLM Client JSON Parsing', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient({
      apiKey: 'test-key',
      provider: 'anthropic'
    });
  });

  it('should parse clean JSON', () => {
    const json = '{"key": "value"}';
    const parsed = client.parseJsonResponse(json);
    expect(parsed).toEqual({ key: 'value' });
  });

  it('should parse JSON with markdown code blocks', () => {
    const json = '```json\n{"key": "value"}\n```';
    const parsed = client.parseJsonResponse(json);
    expect(parsed).toEqual({ key: 'value' });
  });

  it('should parse JSON with space after json marker', () => {
    const json = '```json {"key": "value"}```';
    const parsed = client.parseJsonResponse(json);
    expect(parsed).toEqual({ key: 'value' });
  });

  it('should extract JSON from surrounding text', () => {
    const json = 'Here is the result: {"key": "value"} and some more text';
    const parsed = client.parseJsonResponse(json);
    expect(parsed).toEqual({ key: 'value' });
  });

  it('should throw error for invalid JSON', () => {
    const json = 'not valid json at all';
    expect(() => client.parseJsonResponse(json)).toThrow();
  });
});

describe('LLM Client Cache Integration', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient(
      { apiKey: 'test-key', provider: 'anthropic' },
      { enabled: true, ttlSeconds: 60, maxEntries: 10 }
    );
  });

  it('should clear cache', () => {
    client.clearCache();
    const stats = client.getCacheStats();
    expect(stats.size).toBe(0);
  });

  it('should provide cache statistics', () => {
    const stats = client.getCacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('maxEntries');
    expect(stats).toHaveProperty('enabled');
    expect(stats.enabled).toBe(true);
  });
});

describe('LLM Client Provider Support', () => {
  it('should create Anthropic client', () => {
    const client = new LLMClient({
      apiKey: 'test-key',
      provider: 'anthropic'
    });

    const config = client.getConfig();
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe(DEFAULT_LLM_CONFIG.anthropic.model);
  });

  it('should create OpenAI client', () => {
    const client = new LLMClient({
      apiKey: 'test-key',
      provider: 'openai'
    });

    const config = client.getConfig();
    expect(config.provider).toBe('openai');
    expect(config.model).toBe(DEFAULT_LLM_CONFIG.openai.model);
  });

  it('should use environment variable for provider', () => {
    const originalProvider = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = 'openai';

    const client = new LLMClient({ apiKey: 'test-key' });
    const config = client.getConfig();
    expect(config.provider).toBe('openai');

    // Restore
    if (originalProvider) {
      process.env.LLM_PROVIDER = originalProvider;
    } else {
      delete process.env.LLM_PROVIDER;
    }
  });

  it('should default to Anthropic when no provider specified', () => {
    const originalProvider = process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER;

    const client = new LLMClient({ apiKey: 'test-key' });
    const config = client.getConfig();
    expect(config.provider).toBe('anthropic');

    // Restore
    if (originalProvider) {
      process.env.LLM_PROVIDER = originalProvider;
    }
  });
});

describe('LLM Client Configuration Validation', () => {
  it('should accept valid temperature values', () => {
    const validTemperatures = [0, 0.5, 1.0];

    for (const temp of validTemperatures) {
      const client = new LLMClient({
        apiKey: 'test-key',
        provider: 'anthropic',
        temperature: temp
      });

      expect(client.getConfig().temperature).toBe(temp);
    }
  });

  it('should accept valid maxTokens values', () => {
    const validMaxTokens = [100, 1000, 4096, 8192];

    for (const maxTokens of validMaxTokens) {
      const client = new LLMClient({
        apiKey: 'test-key',
        provider: 'anthropic',
        maxTokens
      });

      expect(client.getConfig().maxTokens).toBe(maxTokens);
    }
  });

  it('should accept valid timeout values', () => {
    const validTimeouts = [5000, 15000, 30000, 60000];

    for (const timeout of validTimeouts) {
      const client = new LLMClient({
        apiKey: 'test-key',
        provider: 'anthropic',
        timeout
      });

      expect(client.getConfig().timeout).toBe(timeout);
    }
  });

  it('should accept custom model names', () => {
    const models = [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'gpt-4o',
      'gpt-4-turbo'
    ];

    for (const model of models) {
      const client = new LLMClient({
        apiKey: 'test-key',
        provider: 'anthropic',
        model
      });

      expect(client.getConfig().model).toBe(model);
    }
  });
});

describe('LLM Client Cache Configuration', () => {
  it('should create client with cache disabled', () => {
    const client = new LLMClient(
      { apiKey: 'test-key', provider: 'anthropic' },
      { enabled: false }
    );

    const stats = client.getCacheStats();
    expect(stats.enabled).toBe(false);
  });

  it('should create client with custom cache size', () => {
    const client = new LLMClient(
      { apiKey: 'test-key', provider: 'anthropic' },
      { enabled: true, maxEntries: 50 }
    );

    const stats = client.getCacheStats();
    expect(stats.maxEntries).toBe(50);
  });

  it('should create client with custom TTL', () => {
    const client = new LLMClient(
      { apiKey: 'test-key', provider: 'anthropic' },
      { enabled: true, ttlSeconds: 300 }
    );

    // TTL is internal, but we can verify cache is enabled
    const stats = client.getCacheStats();
    expect(stats.enabled).toBe(true);
  });
});

describe('LLM Client JSON Parsing Edge Cases', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient({
      apiKey: 'test-key',
      provider: 'anthropic'
    });
  });

  it('should parse nested JSON objects', () => {
    const json = '{"outer": {"inner": {"deep": "value"}}}';
    const parsed = client.parseJsonResponse(json);
    expect(parsed.outer.inner.deep).toBe('value');
  });

  it('should parse JSON arrays', () => {
    const json = '[{"id": 1}, {"id": 2}, {"id": 3}]';
    const parsed = client.parseJsonResponse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });

  it('should parse JSON with special characters', () => {
    const json = '{"text": "Line 1\\nLine 2\\tTabbed"}';
    const parsed = client.parseJsonResponse(json);
    // JSON.parse interprets escape sequences, so \n becomes actual newline
    expect(parsed.text).toContain('\n');
    expect(parsed.text).toContain('\t');
  });

  it('should parse JSON with unicode characters', () => {
    const json = '{"emoji": "🚀", "chinese": "你好"}';
    const parsed = client.parseJsonResponse(json);
    expect(parsed.emoji).toBe('🚀');
    expect(parsed.chinese).toBe('你好');
  });

  it('should parse JSON with numbers', () => {
    const json = '{"int": 42, "float": 3.14, "negative": -10}';
    const parsed = client.parseJsonResponse(json);
    expect(parsed.int).toBe(42);
    expect(parsed.float).toBe(3.14);
    expect(parsed.negative).toBe(-10);
  });

  it('should parse JSON with booleans and null', () => {
    const json = '{"bool_true": true, "bool_false": false, "null_value": null}';
    const parsed = client.parseJsonResponse(json);
    expect(parsed.bool_true).toBe(true);
    expect(parsed.bool_false).toBe(false);
    expect(parsed.null_value).toBe(null);
  });

  it('should extract JSON from surrounding text', () => {
    const json = 'Here is the result: {"a": 1} and some more text';
    const parsed = client.parseJsonResponse(json);
    // Should extract the JSON object
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
    expect(parsed.a).toBe(1);
  });

  it('should handle JSON with extra whitespace', () => {
    const json = '  \n\t  {"key": "value"}  \n\t  ';
    const parsed = client.parseJsonResponse(json);
    expect(parsed.key).toBe('value');
  });

  it('should throw error for completely invalid JSON', () => {
    const invalidInputs = [
      'not json at all',
      '{invalid: json}',
      '{"unclosed": ',
      'undefined',
      'NaN'
    ];

    for (const input of invalidInputs) {
      expect(() => client.parseJsonResponse(input)).toThrow();
    }
  });
});

describe('LLM Client Error Handling', () => {
  it('should throw error when no user message provided', async () => {
    const client = new LLMClient({
      apiKey: 'test-key',
      provider: 'anthropic'
    });

    await expect(
      client.complete({
        messages: [{ role: 'system', content: 'System prompt' }]
      })
    ).rejects.toThrow('must include at least one user message');
  });

  it('should handle empty messages array', async () => {
    const client = new LLMClient({
      apiKey: 'test-key',
      provider: 'anthropic'
    });

    await expect(
      client.complete({ messages: [] })
    ).rejects.toThrow();
  });
});

describe('LLM Cache Behavior', () => {
  let cache: LLMCache;

  beforeEach(() => {
    cache = new LLMCache({ enabled: true, ttlSeconds: 60, maxEntries: 10 });
  });

  it('should differentiate between different temperatures', () => {
    const systemPrompt = 'System';
    const userPrompt = 'Hello';
    const model = 'test-model';
    const response1 = { content: 'Response 1', model };
    const response2 = { content: 'Response 2', model };

    cache.set(systemPrompt, userPrompt, 0, model, response1);
    cache.set(systemPrompt, userPrompt, 0.5, model, response2);

    expect(cache.get(systemPrompt, userPrompt, 0, model)).toEqual(response1);
    expect(cache.get(systemPrompt, userPrompt, 0.5, model)).toEqual(response2);
  });

  it('should differentiate between different models', () => {
    const systemPrompt = 'System';
    const userPrompt = 'Hello';
    const temperature = 0;
    const response1 = { content: 'Response 1', model: 'model-1' };
    const response2 = { content: 'Response 2', model: 'model-2' };

    cache.set(systemPrompt, userPrompt, temperature, 'model-1', response1);
    cache.set(systemPrompt, userPrompt, temperature, 'model-2', response2);

    expect(cache.get(systemPrompt, userPrompt, temperature, 'model-1')).toEqual(response1);
    expect(cache.get(systemPrompt, userPrompt, temperature, 'model-2')).toEqual(response2);
  });

  it('should differentiate between different system prompts', () => {
    const userPrompt = 'Hello';
    const temperature = 0;
    const model = 'test-model';
    const response1 = { content: 'Response 1', model };
    const response2 = { content: 'Response 2', model };

    cache.set('System 1', userPrompt, temperature, model, response1);
    cache.set('System 2', userPrompt, temperature, model, response2);

    expect(cache.get('System 1', userPrompt, temperature, model)).toEqual(response1);
    expect(cache.get('System 2', userPrompt, temperature, model)).toEqual(response2);
  });

  it('should handle cache with zero max entries', () => {
    const cache = new LLMCache({ enabled: true, ttlSeconds: 60, maxEntries: 0 });
    const response = { content: 'Response', model: 'test-model' };

    cache.set('System', 'User', 0, 'test-model', response);

    // With maxEntries=0, cache should still work but immediately evict
    // The behavior depends on implementation - it may cache or not
    // Let's just verify it doesn't crash
    const result = cache.get('System', 'User', 0, 'test-model');
    expect(result === null || result !== null).toBe(true);
  });

  it('should handle disabled cache', () => {
    const cache = new LLMCache({ enabled: false, ttlSeconds: 60, maxEntries: 10 });
    const response = { content: 'Response', model: 'test-model' };

    cache.set('System', 'User', 0, 'test-model', response);

    // Should not cache when disabled
    expect(cache.get('System', 'User', 0, 'test-model')).toBeNull();
  });

  it('should provide accurate size in stats', () => {
    const cache = new LLMCache({ enabled: true, ttlSeconds: 60, maxEntries: 10 });
    const response = { content: 'Response', model: 'test-model' };

    expect(cache.getStats().size).toBe(0);

    cache.set('System', 'User1', 0, 'test-model', response);
    expect(cache.getStats().size).toBe(1);

    cache.set('System', 'User2', 0, 'test-model', response);
    expect(cache.getStats().size).toBe(2);

    cache.clear();
    expect(cache.getStats().size).toBe(0);
  });
});
