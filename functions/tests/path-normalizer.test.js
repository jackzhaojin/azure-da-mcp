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
    name: 'Plain path without leading slash (with .html)',
    input: 'jackzhaojin/da-live-postal-2025-07/index.html',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'AEM URL with query parameters (auto-append .html)',
    input: 'https://main--da-live-postal-2025-07--jackzhaojin.aem.page/index-copy?nocache=1759721659714',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html'
  },
  {
    name: 'Edit URL with hash fragment',
    input: 'https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/index.html#section',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'Admin URL with query params and hash',
    input: 'https://admin.da.live/source/jackzhaojin/da-live-postal-2025-07/index.html?edit=true#top',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index.html'
  },
  {
    name: 'AEM URL without extension (auto-append .html)',
    input: 'https://main--da-live-postal-2025-07--jackzhaojin.aem.page/index-copy',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html'
  },
  {
    name: 'Edit URL without extension (auto-append .html)',
    input: 'https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/index-copy',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html'
  },
  {
    name: 'Plain path without extension (auto-append .html)',
    input: 'jackzhaojin/da-live-postal-2025-07/index-copy',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html'
  },
  {
    name: 'Path with .json extension (no auto-append)',
    input: 'jackzhaojin/da-live-postal-2025-07/data.json',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/data.json'
  },
  {
    name: 'Directory path ending with / (no auto-append)',
    input: 'jackzhaojin/da-live-postal-2025-07/',
    expected: '/source/jackzhaojin/da-live-postal-2025-07/'
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
