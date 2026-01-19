import { describe, it, expect } from 'vitest';

describe('Project Setup', () => {
  it('should have a working test environment', () => {
    expect(true).toBe(true);
  });

  it('should be able to import TypeScript modules', () => {
    const testValue = 'hello';
    expect(testValue).toBe('hello');
  });
});
