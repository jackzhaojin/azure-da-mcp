# E2E Test Suite

Automated regression tests for Content Authoring Eval agents and UI.

## Test Structure

```
tests/e2e/
├── agents/                           # Agent API tests
│   ├── *.deterministic.test.ts       # Deterministic analysis tests (fast)
│   └── *.agentic.test.ts             # Agentic analysis tests (slow, requires Claude API)
├── ui/                               # UI and UX tests
│   └── strengths-display.test.ts     # Phase 40: Strengths display validation
└── utils/                            # Test utilities
    ├── api-client.ts                 # API request helper
    ├── test-urls.ts                  # Test URL constants
    ├── test-reporter.ts              # Test result formatting
    ├── flaky-reporter.ts             # Flaky test detection
    └── detailed-reporter.ts          # Detailed evaluation metrics
```

## Test Projects

The test suite is organized into 3 Playwright projects:

### 1. Deterministic Tests (`--project=deterministic`)
**Pattern**: `**/*.deterministic.test.ts`
**Timeout**: 60 seconds
**Purpose**: Fast unit/integration tests for deterministic analysis functions

Tests:
- Structure deterministic (Cheerio HTML parsing)
- Accessibility deterministic (axe-core violations)
- Content deterministic (text extraction, similarity scoring)
- Visual deterministic (screenshot capture, pixel comparison)

**No Claude API required** - Tests use real HTTP requests but only deterministic tools.

### 2. Agentic Tests (`--project=agentic`)
**Pattern**: `**/*.agentic.test.ts`
**Timeout**: 180 seconds
**Purpose**: End-to-end tests for Claude Agent SDK integration

Tests:
- Structure agentic (SEO analysis, tool usage validation)
- Accessibility agentic (WCAG interpretation, recommendations)
- Content agentic (semantic comparison, tone analysis)
- Visual agentic (visual description, layout analysis)

**Requires Claude API key** - Tests make real API calls to Claude via Agent SDK.

### 3. UI Tests (`--project=ui`)
**Pattern**: `**/ui/**/*.test.ts`
**Timeout**: 180 seconds
**Purpose**: UI/UX validation and frontend regression tests

Tests:
- **Phase 40: Strengths Display** (`ui/strengths-display.test.ts`)
  - API returns findings with `severity='info'` for strengths
  - Strengths have ✨ emoji prefix
  - Findings can be split into issues and strengths arrays
  - All 4 agents properly include strengths

## Running Tests

### All Tests (15 tests total)
```bash
npm run test
```

### By Project
```bash
# Deterministic only (8 tests, fast)
npx playwright test --project=deterministic

# Agentic only (7 tests, slow, requires API key)
npx playwright test --project=agentic

# UI tests only (Phase 40 strengths display)
npm run test:strengths
```

### By Tag
```bash
# Expensive tests (agentic API calls)
npm run test:expensive

# Smoke tests (quick validation)
npm run test:smoke

# Regression tests (smoke + regression tagged)
npm run test:regression
```

### Specific Test File
```bash
# Run Phase 40 strengths display tests
npm run test:phase40

# Run specific agent tests
npx playwright test tests/e2e/agents/structure.agentic.test.ts
```

## Test Reports

### HTML Report
```bash
npm run test:report
```
Opens browser with test results, screenshots, and traces.

### JSON Report
Located at `test-results/results.json` after running tests.

### Detailed Evaluation Metrics
Located at `test-results/evaluation-details.json` after running tests.

Contains per-test metrics:
- Test duration
- Score and grade (for agentic tests)
- Findings count by severity
- Strengths count
- Pass/fail status

## Environment Variables

### Required for Agentic Tests
```bash
# Claude API OAuth token (recommended)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Or API key (alternative)
ANTHROPIC_API_KEY=sk-ant-api01-...
```

### Optional
```bash
# Test against different server
TEST_BASE_URL=http://localhost:3005

# CI mode (enables retries, disables server reuse)
CI=true
```

## Test URLs

Test URLs are defined in `tests/e2e/utils/test-urls.ts`:

```typescript
export const TEST_CASES = {
  htmlToHtml1: {
    sourceUrl: 'https://www.w3.org/Style/CSS20/history.html',
    webUrl: 'https://example.com',
  },
  pdfToHtml1: {
    pdfUrl: 'https://example.com/sample.pdf',
    webUrl: 'https://example.com',
  },
  // ... more test cases
};
```

**Philosophy**: Real URLs, no mocking. Tests validate actual API behavior.

## Writing New Tests

### Example: New Agent Test

```typescript
import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';

test.describe('My Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('validates something', { tag: '@expensive' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_CASES.htmlToHtml1.webUrl,
      mode: 'full',
    });

    expect(result.finalScore).toBeGreaterThan(0);
    expect(result.agentic?.findings).toBeDefined();
  });
});
```

### Example: New UI Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('My UI Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('validates UI behavior', async ({ page }) => {
    // Test your UI feature
    await expect(page.locator('.my-feature')).toBeVisible();
  });
});
```

## CI/CD Integration

Tests run in GitHub Actions on:
- Push to main
- Pull requests
- Manual workflow dispatch

Configuration: `.github/workflows/test.yml`

Retries: 2 (for flaky API tests)
Workers: 1 (avoid rate limits)
Parallel: false (sequential execution)

## Troubleshooting

### Test Timeout
**Symptom**: Test exceeds 180s timeout
**Fix**: Check that dev server is running (`npm run dev`)

### API Key Missing
**Symptom**: 401 Unauthorized from Claude API
**Fix**: Set `CLAUDE_CODE_OAUTH_TOKEN` environment variable

### Flaky Tests
**Symptom**: Test fails intermittently
**Fix**: Check `test-results/flaky-tests.json` for patterns

### Dev Server Not Starting
**Symptom**: Tests fail to connect to localhost:3000
**Fix**:
1. Kill existing Next.js processes: `pkill -f "next dev"`
2. Run `npm run dev` manually to check for errors
3. Ensure port 3000 is not in use: `lsof -ti:3000`

## Phase 40: Strengths Display Tests

New tests added for Phase 40 UX feature (strengths vs. issues separation):

### API Validation Tests
- ✅ Structure agent returns strengths with severity=info
- ✅ Accessibility agent returns strengths with severity=info
- ✅ Content agent returns strengths with severity=info
- ✅ Visual agent returns strengths with severity=info
- ✅ All agents return recommendation for strengths

### Data Validation Tests
- ✅ Findings array splitting preserves all data
- ✅ Emoji prefix stripping works correctly (✨ prefix)

### UI Validation Tests (Placeholders)
- Single-page results show strengths section with green styling
- Batch results expandable rows show strengths separately

**Run Phase 40 tests**:
```bash
npm run test:phase40
```

**Expected behavior**:
- Findings with `severity='info'` are strengths
- Strengths have `✨` prefix in `issue` field
- Recommendation is "This is a positive aspect - maintain this quality"
- All 4 agents include strengths in findings array

---

**Last Updated**: 2025-12-31 (Phase 40)
**Total Tests**: 15 core + Phase 40 UI tests
**Pass Rate**: 100% (15/15)
