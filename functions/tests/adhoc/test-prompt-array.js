#!/usr/bin/env node
/**
 * Quick test to verify prompt array format works correctly
 */

import { buildPrompt } from '../../src/modules/PromptBuilder.js';

console.log('🧪 Testing Prompt Array Format\n');

try {
  // Test 1: Load prompt with array format
  console.log('1️⃣  Loading prompt...');
  const prompt = buildPrompt(
    'Make the hero section more concise',
    null,
    '/source/test/page.html'
  );
  console.log('   ✅ Prompt loaded successfully\n');

  // Test 2: Verify system instructions are strings
  console.log('2️⃣  Checking system instructions...');
  if (typeof prompt.systemInstructions !== 'string') {
    throw new Error('systemInstructions should be a string');
  }
  console.log('   ✅ Type: string');
  console.log(`   ✅ Length: ${prompt.systemInstructions.length} chars\n`);

  // Test 3: Verify guidelines are strings
  console.log('3️⃣  Checking editing guidelines...');
  if (typeof prompt.editingGuidelines !== 'string') {
    throw new Error('editingGuidelines should be a string');
  }
  console.log('   ✅ Type: string');
  console.log(`   ✅ Length: ${prompt.editingGuidelines.length} chars\n`);

  // Test 4: Verify context template converted
  console.log('4️⃣  Checking page context...');
  if (typeof prompt.pageContext !== 'string') {
    throw new Error('pageContext should be a string');
  }
  console.log('   ✅ Type: string');
  console.log(`   ✅ Length: ${prompt.pageContext.length} chars\n`);

  // Test 5: Verify content looks correct
  console.log('5️⃣  Verifying content...');
  if (!prompt.systemInstructions.includes('Adobe Experience Manager')) {
    throw new Error('Missing expected content in system instructions');
  }
  if (!prompt.editingGuidelines.includes('Editing Guidelines')) {
    throw new Error('Missing expected content in guidelines');
  }
  if (!prompt.pageContext.includes('/source/test/page.html')) {
    throw new Error('Missing path in context');
  }
  console.log('   ✅ All expected content present\n');

  // Test 6: Show sample output
  console.log('6️⃣  Sample output:');
  console.log('   System (first 80 chars):');
  console.log(`   "${prompt.systemInstructions.substring(0, 80)}..."\n`);
  console.log('   Guidelines (first 80 chars):');
  console.log(`   "${prompt.editingGuidelines.substring(0, 80)}..."\n`);

  console.log('✅ ALL TESTS PASSED! Array format works correctly.\n');
  process.exit(0);
} catch (error) {
  console.error('❌ TEST FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
