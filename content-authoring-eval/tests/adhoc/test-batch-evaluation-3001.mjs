#!/usr/bin/env node

/**
 * Test full batch evaluation on port 3001 with Playwright
 * Evaluates all 3 pages from demo-mixed-sources.json
 */

import { chromium } from 'playwright';

async function runBatchEvaluation() {
  console.log('🚀 Starting batch evaluation test on port 3001...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const batchId = 'demo-mixed-sources-2025-12-30';

    // Step 1: Trigger batch evaluation via API
    console.log('📍 Step 1: Triggering batch evaluation via API');
    console.log(`   Batch ID: ${batchId}`);
    console.log('   Pages: 3 (2 PDF sources, 1 HTML source)\n');

    // Use streaming endpoint to monitor progress
    const evaluationPromise = page.evaluate(async (batchId) => {
      const response = await fetch(`http://localhost:3001/api/evaluate/batch-stream?batchId=${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Batch evaluation failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const results = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'result') {
                results.push(data.result);
                console.log(`Completed: ${data.result.title}`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      return results;
    }, batchId);

    console.log('   ⏳ Evaluation in progress...\n');

    // Wait for evaluation to complete (with timeout)
    const timeout = 180000; // 3 minutes
    const results = await Promise.race([
      evaluationPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Evaluation timeout')), timeout)
      )
    ]);

    console.log('\n✅ Batch evaluation completed!\n');

    // Step 2: Display results
    console.log('=' .repeat(80));
    console.log('EVALUATION RESULTS');
    console.log('='.repeat(80));

    results.forEach((result, index) => {
      console.log(`\n📄 Page ${index + 1}: ${result.title || result.id}`);
      console.log('-'.repeat(80));

      console.log(`   Source Type: ${result.sourceType || 'unknown'}`);
      if (result.sourceUrl) {
        console.log(`   Source URL: ${result.sourceUrl.substring(0, 60)}...`);
      }
      console.log(`   Web URL: ${result.webUrl.substring(0, 60)}...`);
      console.log('');

      // Structure scores
      if (result.structure) {
        console.log(`   📐 STRUCTURE:`);
        console.log(`      Final Score: ${result.structure.finalScore || 'N/A'}`);
        console.log(`      Grade: ${result.structure.grade || 'N/A'}`);
        if (result.structure.deterministic?.score !== undefined) {
          console.log(`      Deterministic: ${result.structure.deterministic.score}`);
        }
        if (result.structure.agentic?.score !== undefined) {
          console.log(`      Agentic: ${result.structure.agentic.score}`);
        }
        if (result.structure.agentic?.findings?.length > 0) {
          console.log(`      Findings: ${result.structure.agentic.findings.length}`);
        }
        console.log('');
      }

      // Accessibility scores
      if (result.accessibility) {
        console.log(`   ♿ ACCESSIBILITY:`);
        console.log(`      Final Score: ${result.accessibility.finalScore || 'N/A'}`);
        console.log(`      Grade: ${result.accessibility.grade || 'N/A'}`);
        if (result.accessibility.deterministic?.violations) {
          const violations = result.accessibility.deterministic.violations.length;
          console.log(`      Violations: ${violations}`);
        }
        if (result.accessibility.agentic?.findings?.length > 0) {
          console.log(`      Findings: ${result.accessibility.agentic.findings.length}`);
        }
        console.log('');
      }

      // Content scores
      if (result.content) {
        console.log(`   📝 CONTENT:`);
        console.log(`      Final Score: ${result.content.finalScore || 'N/A'}`);
        console.log(`      Grade: ${result.content.grade || 'N/A'}`);
        if (result.content.agentic?.score !== undefined) {
          console.log(`      Agentic: ${result.content.agentic.score}`);
        }
        if (result.content.agentic?.findings?.length > 0) {
          console.log(`      Findings: ${result.content.agentic.findings.length}`);
        }
        console.log('');
      }

      // Visual scores
      if (result.visual) {
        console.log(`   👁️  VISUAL:`);
        console.log(`      Final Score: ${result.visual.finalScore || 'N/A'}`);
        console.log(`      Grade: ${result.visual.grade || 'N/A'}`);
        if (result.visual.agentic?.score !== undefined) {
          console.log(`      Agentic: ${result.visual.agentic.score}`);
        }
        if (result.visual.agentic?.findings?.length > 0) {
          console.log(`      Findings: ${result.visual.agentic.findings.length}`);
        }
        console.log('');
      }

      // Overall score
      if (result.overallScore !== undefined) {
        console.log(`   🎯 OVERALL SCORE: ${result.overallScore}`);
        console.log(`   📊 OVERALL GRADE: ${result.overallGrade || 'N/A'}`);
      }
    });

    console.log('\n' + '='.repeat(80));

    // Step 3: Summary statistics
    console.log('\n📊 SUMMARY STATISTICS\n');

    const avgStructure = results.reduce((sum, r) => sum + (r.structure?.finalScore || 0), 0) / results.length;
    const avgAccessibility = results.reduce((sum, r) => sum + (r.accessibility?.finalScore || 0), 0) / results.length;
    const avgContent = results.reduce((sum, r) => sum + (r.content?.finalScore || 0), 0) / results.length;
    const avgVisual = results.reduce((sum, r) => sum + (r.visual?.finalScore || 0), 0) / results.length;
    const avgOverall = results.reduce((sum, r) => sum + (r.overallScore || 0), 0) / results.length;

    console.log(`   Structure:     ${avgStructure.toFixed(1)}`);
    console.log(`   Accessibility: ${avgAccessibility.toFixed(1)}`);
    console.log(`   Content:       ${avgContent.toFixed(1)}`);
    console.log(`   Visual:        ${avgVisual.toFixed(1)}`);
    console.log(`   Overall:       ${avgOverall.toFixed(1)}`);

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
runBatchEvaluation().catch(console.error);
