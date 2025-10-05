/**
 * Validate LLM response against original content
 * Performs 5-step validation: structure, block IDs, schema, hallucinations, brand terms
 * @param {Object} llmResponse - LLM generated response with edited blocks
 * @param {Object} originalContent - Original page content for comparison
 * @returns {Object} ValidationResult { valid: boolean, errors: string[] }
 */
export function validate(llmResponse, originalContent) {
  const errors = [];

  // Step 1: Structural validation
  if (!Array.isArray(llmResponse.editedBlocks)) {
    errors.push('editedBlocks must be an array');
  }
  if (!Array.isArray(llmResponse.unchangedBlocks)) {
    errors.push('unchangedBlocks must be an array');
  }
  if (!llmResponse.explanation || typeof llmResponse.explanation !== 'string') {
    errors.push('explanation must be a non-empty string');
  }
  if (!llmResponse.reasoning || typeof llmResponse.reasoning !== 'string') {
    errors.push('reasoning must be a non-empty string');
  }

  // If structural validation fails, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Step 2: Block ID verification
  const originalBlockIds = originalContent.blocks.map((block) => block.id);
  const editedBlockIds = llmResponse.editedBlocks.map((block) => block.id);
  const unchangedBlockIds = llmResponse.unchangedBlocks;
  const allResponseBlockIds = [...editedBlockIds, ...unchangedBlockIds];

  // Check all original block IDs are accounted for
  for (const originalId of originalBlockIds) {
    if (!allResponseBlockIds.includes(originalId)) {
      errors.push(`Block ID '${originalId}' is missing or not accounted for in response`);
    }
  }

  // Check all response block IDs exist in original
  for (const blockId of allResponseBlockIds) {
    if (!originalBlockIds.includes(blockId)) {
      errors.push(`Block ID '${blockId}' not found in original content`);
    }
  }

  // Step 3: Schema compliance
  for (const editedBlock of llmResponse.editedBlocks) {
    const schemaErrors = validateBlockSchema(editedBlock);
    errors.push(...schemaErrors);
  }

  // Step 4: Hallucination detection
  const originalText = JSON.stringify(originalContent);
  for (const editedBlock of llmResponse.editedBlocks) {
    const editedText = JSON.stringify(editedBlock.content);

    // Extract numbers and percentages
    const numbers = editedText.match(/\d+%?/g) || [];
    for (const number of numbers) {
      if (!originalText.includes(number)) {
        errors.push(`Potential hallucination: New statistic or number '${number}' not in original content`);
      }
    }
  }

  // Step 5: Brand terminology preservation
  const brandTerms = extractBrandTerms(originalContent);
  for (const brandTerm of brandTerms) {
    // Get unchanged blocks from original content
    const unchangedBlocksContent = originalContent.blocks
      .filter((block) => llmResponse.unchangedBlocks.includes(block.id))
      .map((block) => block.content);

    // Check if brand term appears in either edited blocks or unchanged blocks
    const editedContent = JSON.stringify(llmResponse.editedBlocks);
    const unchangedContent = JSON.stringify(unchangedBlocksContent);
    const allContent = editedContent + unchangedContent;

    const brandTermRegex = new RegExp(brandTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (!brandTermRegex.test(allContent)) {
      // Brand term might have been removed or changed
      errors.push(`Brand term '${brandTerm}' appears to have been modified or removed`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate block content against its schema
 * @param {Object} block - Content block to validate
 * @returns {string[]} Array of validation errors
 */
function validateBlockSchema(block) {
  const errors = [];

  switch (block.type) {
    case 'hero':
      if (!block.content.headline || typeof block.content.headline !== 'string') {
        errors.push(`Hero block '${block.id}' missing required field 'headline'`);
      }
      if (!block.content.subheadline || typeof block.content.subheadline !== 'string') {
        errors.push(`Hero block '${block.id}' missing required field 'subheadline'`);
      }
      if (!block.content.cta || typeof block.content.cta !== 'string') {
        errors.push(`Hero block '${block.id}' missing required field 'cta'`);
      }
      break;

    case 'product-cards':
      if (!Array.isArray(block.content.cards)) {
        errors.push(`Product-cards block '${block.id}' missing required field 'cards' as array`);
      } else {
        for (let i = 0; i < block.content.cards.length; i++) {
          const card = block.content.cards[i];
          if (!card.title || typeof card.title !== 'string') {
            errors.push(`Product-cards block '${block.id}' card ${i} missing 'title'`);
          }
          if (!card.description || typeof card.description !== 'string') {
            errors.push(`Product-cards block '${block.id}' card ${i} missing 'description'`);
          }
        }
      }
      break;

    case 'cta':
      if (!block.content.buttonText || typeof block.content.buttonText !== 'string') {
        errors.push(`CTA block '${block.id}' missing required field 'buttonText'`);
      }
      if (!block.content.supportingCopy || typeof block.content.supportingCopy !== 'string') {
        errors.push(`CTA block '${block.id}' missing required field 'supportingCopy'`);
      }
      break;

    default:
      // Unknown block type - skip validation
      break;
  }

  return errors;
}

/**
 * Extract brand terms from original content
 * Looks for capitalized multi-word phrases that are likely brand names
 * @param {Object} originalContent - Original page content
 * @returns {string[]} Array of potential brand terms
 */
function extractBrandTerms(originalContent) {
  const brandTerms = [];
  const contentText = JSON.stringify(originalContent);

  // Look for capitalized phrases (e.g., "Acme Corp", "Adobe Experience Manager")
  const capitalizedPhrases = contentText.match(/[A-Z][a-z]+(?: [A-Z][a-z]+)+/g) || [];

  for (const phrase of capitalizedPhrases) {
    // Filter out common non-brand phrases
    if (!phrase.match(/^(The|And|Or|For|With|From|To|In|On|At|By)/)) {
      if (!brandTerms.includes(phrase)) {
        brandTerms.push(phrase);
      }
    }
  }

  return brandTerms;
}
