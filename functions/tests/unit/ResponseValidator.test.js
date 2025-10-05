import { describe, test, expect } from '@jest/globals';
import { validate } from '../../src/modules/ResponseValidator.js';

describe('ResponseValidator', () => {
  const originalContent = {
    path: '/products/enterprise',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        content: {
          headline: 'Acme Corp Enterprise Solutions',
          subheadline: 'Trusted by 500 companies worldwide',
          cta: 'Get Started'
        }
      },
      {
        id: 'cards-1',
        type: 'product-cards',
        content: {
          cards: [
            {
              title: 'Security',
              description: 'Enterprise-grade security',
              features: ['SOC 2', 'SAML']
            }
          ]
        }
      },
      {
        id: 'cta-1',
        type: 'cta',
        content: {
          buttonText: 'Contact Sales',
          supportingCopy: 'Get a demo'
        }
      }
    ],
    metadata: {}
  };

  describe('validate', () => {
    test('should pass validation for valid LLM response', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Acme Corp Enterprise Solutions',
              subheadline: 'Trusted by 500 companies worldwide',
              cta: 'Get Started'
            }
          }
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'No changes needed',
        reasoning: 'Content is already optimal'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should fail when editedBlocks is missing', () => {
      const llmResponse = {
        unchangedBlocks: ['hero-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/editedBlocks.*array/i)]));
    });

    test('should fail when unchangedBlocks is missing', () => {
      const llmResponse = {
        editedBlocks: [],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/unchangedBlocks.*array/i)]));
    });

    test('should fail when block ID not found in original content', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'invalid-block-999',
            type: 'hero',
            content: { headline: 'Test', subheadline: 'Test', cta: 'Test' }
          }
        ],
        unchangedBlocks: ['hero-1', 'cards-1', 'cta-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/invalid-block-999.*not found/i)]));
    });

    test('should fail when hero block missing required headline field', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              // Missing headline
              subheadline: 'Test subheadline',
              cta: 'Test CTA'
            }
          }
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/hero.*headline/i)]));
    });

    test('should fail when hero block missing subheadline field', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Test headline',
              // Missing subheadline
              cta: 'Test CTA'
            }
          }
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/hero.*subheadline/i)]));
    });

    test('should fail when product-cards block missing cards array', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'cards-1',
            type: 'product-cards',
            content: {
              // Missing cards array
              title: 'Test'
            }
          }
        ],
        unchangedBlocks: ['hero-1', 'cta-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/product-cards.*cards.*array/i)]));
    });

    test('should fail when CTA block missing buttonText', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'cta-1',
            type: 'cta',
            content: {
              // Missing buttonText
              supportingCopy: 'Test copy'
            }
          }
        ],
        unchangedBlocks: ['hero-1', 'cards-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/cta.*buttonText/i)]));
    });

    test('should detect hallucination - new statistic not in original', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Acme Corp Solutions',
              subheadline: 'Trusted by 95% of Fortune 500', // Hallucinated percentage
              cta: 'Start Now'
            }
          }
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/hallucination.*95%/i)]));
    });

    test('should detect brand term change - company name modified', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'ACME Corporation Solutions', // Changed "Acme Corp" to "ACME Corporation"
              subheadline: 'Trusted by 500 companies worldwide',
              cta: 'Start Now'
            }
          }
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/brand.*Acme Corp/i)]));
    });

    test('should allow valid edits that preserve facts and brand terms', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Acme Corp Enterprise Solutions', // Brand term preserved
              subheadline: '500 companies trust us worldwide', // Reworded but preserved "500"
              cta: 'Get Started' // Brand term preserved
            }
          }
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'Made subheadline more conversational',
        reasoning: 'Preserved key facts and brand terms'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should validate all block IDs are accounted for', () => {
      const llmResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: { headline: 'Test', subheadline: 'Test', cta: 'Test' }
          }
        ],
        unchangedBlocks: ['cards-1'], // Missing cta-1
        explanation: 'Test',
        reasoning: 'Test'
      };

      const result = validate(llmResponse, originalContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/cta-1.*missing|not accounted/i)]));
    });
  });
});
