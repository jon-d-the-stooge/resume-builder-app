/**
 * Unit tests for text normalization utilities
 */

import {
  normalizeText,
  normalizeWithPunctuation,
  handleEncoding,
  cleanWhitespace,
  prepareForParsing
} from '../../ats-agent/parser/textNormalizer';

describe('Text Normalization Utilities', () => {
  describe('normalizeText', () => {
    it('should convert text to lowercase', () => {
      expect(normalizeText('HELLO WORLD')).toBe('hello world');
      expect(normalizeText('Machine Learning')).toBe('machine learning');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeText('  hello  ')).toBe('hello');
      expect(normalizeText('\n\thello\t\n')).toBe('hello');
    });

    it('should replace multiple spaces with single space', () => {
      expect(normalizeText('hello    world')).toBe('hello world');
      expect(normalizeText('a  b   c')).toBe('a b c');
    });

    it('should remove special characters except hyphens', () => {
      expect(normalizeText('hello@world!')).toBe('helloworld');
      expect(normalizeText('test-case')).toBe('test-case');
      expect(normalizeText('a.b,c;d')).toBe('abcd');
    });

    it('should handle empty input', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText(null as any)).toBe('');
      expect(normalizeText(undefined as any)).toBe('');
    });

    it('should handle multi-word phrases', () => {
      expect(normalizeText('Machine Learning Engineer')).toBe('machine learning engineer');
      expect(normalizeText('Project Management')).toBe('project management');
    });
  });

  describe('normalizeWithPunctuation', () => {
    it('should preserve punctuation', () => {
      expect(normalizeWithPunctuation('Hello, World!')).toBe('hello, world!');
      expect(normalizeWithPunctuation('Test: value.')).toBe('test: value.');
    });

    it('should still normalize case and whitespace', () => {
      expect(normalizeWithPunctuation('  HELLO  ')).toBe('hello');
      expect(normalizeWithPunctuation('A    B')).toBe('a b');
    });

    it('should handle empty input', () => {
      expect(normalizeWithPunctuation('')).toBe('');
      expect(normalizeWithPunctuation(null as any)).toBe('');
    });
  });

  describe('handleEncoding', () => {
    it('should convert smart quotes to regular quotes', () => {
      expect(handleEncoding('\u2018hello\u2019')).toBe("'hello'");
      expect(handleEncoding('\u201Cworld\u201D')).toBe('"world"');
    });

    it('should convert en dash and em dash', () => {
      expect(handleEncoding('test\u2013case')).toBe('test-case');
      expect(handleEncoding('hello\u2014world')).toBe('hello--world');
    });

    it('should convert ellipsis', () => {
      expect(handleEncoding('wait\u2026')).toBe('wait...');
    });

    it('should remove control characters', () => {
      expect(handleEncoding('hello\u0000world')).toBe('helloworld');
      expect(handleEncoding('test\u001Fcase')).toBe('testcase');
    });

    it('should handle empty input', () => {
      expect(handleEncoding('')).toBe('');
      expect(handleEncoding(null as any)).toBe('');
    });
  });

  describe('cleanWhitespace', () => {
    it('should normalize line endings', () => {
      expect(cleanWhitespace('hello\r\nworld')).toBe('hello\nworld');
      expect(cleanWhitespace('test\rcase')).toBe('test\ncase');
    });

    it('should replace tabs with spaces', () => {
      expect(cleanWhitespace('hello\tworld')).toBe('hello world');
    });

    it('should replace multiple spaces with single space', () => {
      expect(cleanWhitespace('a    b')).toBe('a b');
    });

    it('should limit consecutive newlines to 2', () => {
      expect(cleanWhitespace('a\n\n\n\nb')).toBe('a\n\nb');
      expect(cleanWhitespace('x\n\n\n\n\ny')).toBe('x\n\ny');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(cleanWhitespace('  hello  ')).toBe('hello');
      expect(cleanWhitespace('\n\nhello\n\n')).toBe('hello');
    });

    it('should handle empty input', () => {
      expect(cleanWhitespace('')).toBe('');
      expect(cleanWhitespace(null as any)).toBe('');
    });
  });

  describe('prepareForParsing', () => {
    it('should apply encoding and whitespace normalization', () => {
      const input = '  HELLO\u2018world\u2019\r\n\r\nTest    Case  ';
      const result = prepareForParsing(input);
      
      // Should handle encoding (smart quotes)
      expect(result).toContain("'world'");
      // Should clean whitespace
      expect(result).toContain('HELLO');
      expect(result).toContain('Test Case');
    });

    it('should handle complex real-world text', () => {
      const input = `
        Job Title: Machine Learning Engineer
        
        Requirements:
        \u2022 5+ years experience
        \u2022 Python\u2014required
        \u2022 "Deep Learning" expertise
      `;
      const result = prepareForParsing(input);
      
      expect(result).toContain('Machine Learning Engineer');
      expect(result).toContain('5+ years experience');
      expect(result).toContain('Python--required');
      expect(result).toContain('"Deep Learning" expertise');
    });

    it('should handle empty input', () => {
      expect(prepareForParsing('')).toBe('');
      expect(prepareForParsing(null as any)).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const result = normalizeText(longText);
      expect(result.length).toBe(10000);
      expect(result).toBe(longText);
    });

    it('should handle text with only special characters', () => {
      expect(normalizeText('!@#$%^&*()')).toBe('');
      expect(normalizeText('...')).toBe('');
    });

    it('should handle text with mixed encodings', () => {
      const mixed = 'Hello\u2018world\u2019 test\u2013case';
      const result = handleEncoding(mixed);
      expect(result).toBe("Hello'world' test-case");
    });

    it('should handle text with only whitespace', () => {
      expect(normalizeText('   \n\t  ')).toBe('');
      expect(cleanWhitespace('   \n\n\n   ')).toBe('');
    });
  });
});
