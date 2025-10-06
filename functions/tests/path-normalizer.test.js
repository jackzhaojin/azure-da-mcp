import { normalizePath, isValidNormalizedPath } from '../src/modules/PathNormalizer.js';

console.log('🧪 Testing PathNormalizer\n');

const testCases = [
  {
    name: 'Already normalized path',
    input: '/source/jackzhaojin/da-live-postal-2025-07/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'Admin URL',
    input: 'https://admin.da.live/source/jackzhaojin/da-live-postal-2025-07/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'Edit URL',
    input: 'https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'AEM page URL',
    input: 'https://main--da-live-postal-2025-07--jackzhaojin.aem.page/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'AEM live URL',
    input: 'https://main--da-live-postal-2025-07--jackzhaojin.aem.live/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'AEM root URL (homepage)',
    input: 'https://main--da-live-postal-2025-07--jackzhaojin.aem.page',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/'
  },
  {
    name: 'Plain path with leading slash',
    input: '/jackzhaojin/da-live-postal-2025-07/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'Plain path without leading slash',
    input: 'jackzhaojin/da-live-postal-2025-07/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  }
];

let passed = 0;
let failed = 0;

testCases.forEach(({ name, input, expected }) => {
  try {
    const result = normalizePath(input);
    const isValid = isValidNormalizedPath(result);

    if (result === expected && isValid) {
      console.log(`✅ ${name}`);
      console.log(`   Input:    ${input}`);
      console.log(`   Expected: ${expected}`);
      console.log(`   Result:   ${result}\n`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   Input:    ${input}`);
      console.log(`   Expected: ${expected}`);
      console.log(`   Result:   ${result}`);
      console.log(`   Valid:    ${isValid}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Input:    ${input}`);
    console.log(`   Error:    ${error.message}\n`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('✅ All PathNormalizer tests passed!');
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
