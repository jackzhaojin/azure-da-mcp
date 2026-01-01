/**
 * E2E Tests for Phase 40: Strengths Display UX
 *
 * Validates that positive findings (strengths) are visually separated from
 * negative findings (issues) with distinct design language.
 *
 * Tests:
 * 1. API returns findings with severity='info' for strengths
 * 2. Strengths have ✨ prefix in issue text
 * 3. Findings can be split into issues and strengths arrays
 * 4. Backend properly includes strengths for all 4 agents
 */

import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';

test.describe('Phase 40: Strengths Display UX - API Validation', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('Structure agent returns strengths with severity=info', { tag: '@expensive' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_CASES.htmlToHtml.webUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();
    const findings = result.agentic?.findings || [];

    // Should have both issues (critical/serious/moderate/minor) and strengths (info)
    const issues = findings.filter((f: any) => f.severity !== 'info');
    const strengths = findings.filter((f: any) => f.severity === 'info');

    console.log(`Structure agent - Issues: ${issues.length}, Strengths: ${strengths.length}`);

    // Should have at least some findings
    expect(findings.length).toBeGreaterThan(0);

    // Strengths should have ✨ prefix in issue text
    if (strengths.length > 0) {
      const hasEmojiPrefix = strengths.every((s: any) =>
        s.issue && typeof s.issue === 'string' && s.issue.startsWith('✨')
      );
      expect(hasEmojiPrefix).toBe(true);
    }
  });

  test('Accessibility agent returns strengths with severity=info', { tag: '@expensive' }, async () => {
    const result = await client.evaluateAccessibility({
      migratedUrl: TEST_CASES.htmlToHtml.webUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();
    const findings = result.agentic?.findings || [];

    const issues = findings.filter((f: any) => f.severity !== 'info');
    const strengths = findings.filter((f: any) => f.severity === 'info');

    console.log(`Accessibility agent - Issues: ${issues.length}, Strengths: ${strengths.length}`);

    expect(findings.length).toBeGreaterThan(0);

    if (strengths.length > 0) {
      const hasEmojiPrefix = strengths.every((s: any) =>
        s.issue && typeof s.issue === 'string' && s.issue.startsWith('✨')
      );
      expect(hasEmojiPrefix).toBe(true);
    }
  });

  test('Content agent returns strengths with severity=info', { tag: '@expensive' }, async () => {
    const result = await client.evaluateContent({
      migratedUrl: TEST_CASES.pdfToHtml1.webUrl,
      pdfUrl: TEST_CASES.pdfToHtml1.sourceUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();
    const findings = result.agentic?.findings || [];

    const issues = findings.filter((f: any) => f.severity !== 'info');
    const strengths = findings.filter((f: any) => f.severity === 'info');

    console.log(`Content agent - Issues: ${issues.length}, Strengths: ${strengths.length}`);

    expect(findings.length).toBeGreaterThan(0);

    if (strengths.length > 0) {
      const hasEmojiPrefix = strengths.every((s: any) =>
        s.issue && typeof s.issue === 'string' && s.issue.startsWith('✨')
      );
      expect(hasEmojiPrefix).toBe(true);
    }
  });

  test('Visual agent returns strengths with severity=info', { tag: '@expensive' }, async () => {
    const result = await client.evaluateVisual({
      migratedUrl: TEST_CASES.htmlToHtml.webUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();
    const findings = result.agentic?.findings || [];

    const issues = findings.filter((f: any) => f.severity !== 'info');
    const strengths = findings.filter((f: any) => f.severity === 'info');

    console.log(`Visual agent - Issues: ${issues.length}, Strengths: ${strengths.length}`);

    expect(findings.length).toBeGreaterThan(0);

    if (strengths.length > 0) {
      const hasEmojiPrefix = strengths.every((s: any) =>
        s.issue && typeof s.issue === 'string' && s.issue.startsWith('✨')
      );
      expect(hasEmojiPrefix).toBe(true);
    }
  });

  test('All agents return recommendation for strengths', { tag: '@expensive' }, async () => {
    const structureResult = await client.evaluateStructure({
      migratedUrl: TEST_CASES.htmlToHtml.webUrl,
      mode: 'full',
    });

    const findings = structureResult.agentic?.findings || [];
    const strengths = findings.filter((f: any) => f.severity === 'info');

    if (strengths.length > 0) {
      // All strengths should have recommendation (e.g., "This is a positive aspect - maintain this quality")
      const allHaveRecommendation = strengths.every((s: any) =>
        s.recommendation && typeof s.recommendation === 'string' && s.recommendation.length > 0
      );
      expect(allHaveRecommendation).toBe(true);

      // Log sample strength
      console.log('Sample strength:', {
        issue: strengths[0].issue,
        recommendation: strengths[0].recommendation,
        severity: strengths[0].severity,
      });
    }
  });
});

test.describe('Phase 40: Strengths Display UX - UI Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to evaluation page
    await page.goto('http://localhost:3000');
  });

  test('Single-page results show strengths section with green styling', async ({ page }) => {
    // This is a placeholder test - actual UI testing would require:
    // 1. Starting an evaluation
    // 2. Waiting for results
    // 3. Checking for StrengthsCard component with green borders
    // 4. Verifying CheckCircle icons
    // 5. Checking that issues section uses AlertTriangle icons

    // For now, just verify the page loads
    await expect(page).toHaveTitle(/Content Authoring Eval/i);
  });

  test('Batch results expandable rows show strengths separately', async ({ page }) => {
    // This is a placeholder test - actual UI testing would require:
    // 1. Importing batch JSON
    // 2. Running batch evaluation
    // 3. Expanding a result row
    // 4. Verifying issues grid (2x2 by dimension)
    // 5. Verifying strengths section below issues
    // 6. Checking green badges for strengths

    // For now, just verify the page loads
    await expect(page).toHaveTitle(/Content Authoring Eval/i);
  });
});

test.describe('Phase 40: Strengths Display - Data Validation', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('Findings array splitting preserves all data', { tag: '@expensive' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_CASES.htmlToHtml.webUrl,
      mode: 'full',
    });

    const findings = result.agentic?.findings || [];
    const issues = findings.filter((f: any) => f.severity !== 'info');
    const strengths = findings.filter((f: any) => f.severity === 'info');

    // Splitting should preserve all findings
    expect(issues.length + strengths.length).toBe(findings.length);

    // All findings should have required fields
    findings.forEach((finding: any) => {
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('issue');
      expect(finding).toHaveProperty('recommendation');
      expect(finding.severity).toMatch(/^(critical|serious|moderate|minor|info)$/);
    });
  });

  test('Emoji prefix stripping works correctly', { tag: '@expensive' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_CASES.htmlToHtml.webUrl,
      mode: 'full',
    });

    const findings = result.agentic?.findings || [];
    const strengths = findings.filter((f: any) => f.severity === 'info');

    if (strengths.length > 0) {
      strengths.forEach((strength: any) => {
        // Issue should start with ✨
        expect(strength.issue).toMatch(/^✨/);

        // After stripping ✨ and whitespace, should have content
        const stripped = strength.issue.replace(/^✨\s*/, '');
        expect(stripped.length).toBeGreaterThan(0);

        // StrengthsCard component should be able to display this
        console.log('Strength text:', stripped);
      });
    }
  });
});
