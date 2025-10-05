import { describe, test, expect } from '@jest/globals';
import { buildPrompt } from '../../src/modules/PromptBuilder.js';

describe('PromptBuilder', () => {
  describe('buildPrompt', () => {
    test('should construct complete prompt with all sections', () => {
      const command = 'Make more concise';
      const pageContent = {
        path: '/products/enterprise',
        blocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Enterprise Solutions That Scale',
              subheadline: 'Built for organizations',
              cta: 'Get Started'
            }
          }
        ],
        metadata: { title: 'Enterprise' }
      };

      const result = buildPrompt(command, pageContent);

      expect(result).toHaveProperty('systemInstructions');
      expect(result).toHaveProperty('userCommand');
      expect(result).toHaveProperty('pageContext');
      expect(result).toHaveProperty('editingGuidelines');
      expect(result).toHaveProperty('totalTokens');
    });

    test('should include system instructions in prompt structure', () => {
      const command = 'Test command';
      const pageContent = { path: '/test', blocks: [], metadata: {} };

      const result = buildPrompt(command, pageContent);

      expect(result.systemInstructions).toContain('content editor');
      expect(result.systemInstructions).toContain('JSON');
      expect(result.systemInstructions.length).toBeGreaterThan(100);
    });

    test('should include user command in prompt', () => {
      const command = 'Make the tone more formal';
      const pageContent = { path: '/test', blocks: [], metadata: {} };

      const result = buildPrompt(command, pageContent);

      expect(result.userCommand).toBe(command);
    });

    test('should include page context as JSON string', () => {
      const command = 'Test';
      const pageContent = {
        path: '/products/test',
        blocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: { headline: 'Test Headline' }
          }
        ],
        metadata: { title: 'Test Page' }
      };

      const result = buildPrompt(command, pageContent);

      expect(typeof result.pageContext).toBe('string');
      const parsedContext = JSON.parse(result.pageContext);
      expect(parsedContext.path).toBe('/products/test');
      expect(parsedContext.blocks).toHaveLength(1);
      expect(parsedContext.blocks[0].id).toBe('hero-1');
    });

    test('should include editing guidelines in prompt', () => {
      const command = 'Test';
      const pageContent = { path: '/test', blocks: [], metadata: {} };

      const result = buildPrompt(command, pageContent);

      expect(result.editingGuidelines).toMatch(/preserve/i);
      expect(result.editingGuidelines).toMatch(/brand/i);
      expect(result.editingGuidelines.length).toBeGreaterThan(50);
    });

    test('should calculate token count approximately', () => {
      const command = 'Make more concise';
      const pageContent = {
        path: '/products/enterprise',
        blocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'This is a test headline with many words',
              subheadline: 'This is a longer subheadline with even more words to test token counting',
              cta: 'Get Started Now'
            }
          }
        ],
        metadata: { title: 'Test' }
      };

      const result = buildPrompt(command, pageContent);

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(typeof result.totalTokens).toBe('number');
      // Rough estimate: should be in hundreds for typical page
      expect(result.totalTokens).toBeGreaterThan(100);
    });

    test('should handle prompt with various commands', () => {
      const pageContent = { path: '/test', blocks: [], metadata: {} };

      const commands = [
        'Make more concise',
        'Adjust tone to be more formal',
        'Simplify the language',
        'Emphasize benefits over features'
      ];

      commands.forEach((command) => {
        const result = buildPrompt(command, pageContent);
        expect(result.userCommand).toBe(command);
        expect(result).toHaveProperty('systemInstructions');
        expect(result).toHaveProperty('totalTokens');
      });
    });

    test('should produce consistent structure across different pages', () => {
      const command = 'Test';
      const page1 = {
        path: '/page1',
        blocks: [{ id: 'hero-1', type: 'hero', content: {} }],
        metadata: {}
      };
      const page2 = {
        path: '/page2',
        blocks: [
          { id: 'hero-1', type: 'hero', content: {} },
          { id: 'cards-1', type: 'product-cards', content: {} }
        ],
        metadata: {}
      };

      const result1 = buildPrompt(command, page1);
      const result2 = buildPrompt(command, page2);

      // Same structure
      expect(Object.keys(result1)).toEqual(Object.keys(result2));
      // Same system instructions and guidelines
      expect(result1.systemInstructions).toBe(result2.systemInstructions);
      expect(result1.editingGuidelines).toBe(result2.editingGuidelines);
      // Different page context
      expect(result1.pageContext).not.toBe(result2.pageContext);
    });
  });
});
