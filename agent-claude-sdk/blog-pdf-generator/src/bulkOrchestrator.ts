/**
 * Blog PDF Generator - Phase 4: Bulk Orchestration
 *
 * Orchestrates bulk PDF generation from Phase 3 generated specs
 * - Deterministic PDF generation (uses Phase 2 agentDeterministic)
 * - Concurrency control with p-queue
 * - Real-time progress tracking
 * - Error handling and results aggregation
 */

import PQueue from 'p-queue';
import { generateBlogPdf, BlogPdfSpec, PdfGenerationResult } from './agentDeterministic.js';
import path from 'path';
import fs from 'fs/promises';

export interface BulkGenerationConfig {
  specsDirectory: string;
  outputDirectory: string;
  concurrency?: number; // Default: 5
  verbose?: boolean; // Default: true
}

export interface BulkGenerationResult {
  total: number;
  successful: number;
  failed: number;
  duration: number; // milliseconds
  results: Array<{
    id: string;
    status: 'success' | 'failed';
    pdfPath?: string;
    error?: string;
    duration?: number;
  }>;
}

interface SpecFile {
  filepath: string;
  spec: BlogPdfSpec;
}

/**
 * Load all JSON specs from a directory
 */
async function loadSpecs(specsDirectory: string): Promise<SpecFile[]> {
  const files = await fs.readdir(specsDirectory);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const specs: SpecFile[] = [];
  for (const file of jsonFiles) {
    const filepath = path.join(specsDirectory, file);
    const content = await fs.readFile(filepath, 'utf-8');
    const spec = JSON.parse(content) as BlogPdfSpec;
    specs.push({ filepath, spec });
  }

  return specs;
}

/**
 * Process a single spec and generate PDF
 */
async function processSpec(
  specFile: SpecFile,
  outputDirectory: string,
  verbose: boolean
): Promise<{
  id: string;
  status: 'success' | 'failed';
  pdfPath?: string;
  error?: string;
  duration: number;
}> {
  const startTime = Date.now();
  const { spec } = specFile;

  try {
    if (verbose) {
      console.log(`  → Processing: ${spec.id}`);
    }

    const result = await generateBlogPdf(spec, outputDirectory);
    const duration = Date.now() - startTime;

    if (result.success && result.pdfPath) {
      if (verbose) {
        console.log(`  ✅ Success: ${spec.id} (${(duration / 1000).toFixed(2)}s)`);
      }
      return {
        id: spec.id,
        status: 'success',
        pdfPath: result.pdfPath,
        duration,
      };
    } else {
      if (verbose) {
        console.log(`  ❌ Failed: ${spec.id} - ${result.error || 'Unknown error'}`);
      }
      return {
        id: spec.id,
        status: 'failed',
        error: result.error || 'PDF generation failed',
        duration,
      };
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (verbose) {
      console.log(`  ❌ Failed: ${spec.id} - ${error.message}`);
    }
    return {
      id: spec.id,
      status: 'failed',
      error: error.message || 'Unknown error',
      duration,
    };
  }
}

/**
 * Generate PDFs in bulk from a directory of JSON specs
 */
export async function generateBulkPdfs(
  config: BulkGenerationConfig
): Promise<BulkGenerationResult> {
  const {
    specsDirectory,
    outputDirectory,
    concurrency = 5,
    verbose = true,
  } = config;

  const startTime = Date.now();

  // Load all specs
  if (verbose) {
    console.log(`\n📂 Loading specs from: ${specsDirectory}`);
  }
  const specs = await loadSpecs(specsDirectory);

  if (specs.length === 0) {
    throw new Error(`No JSON specs found in ${specsDirectory}`);
  }

  if (verbose) {
    console.log(`📊 Found ${specs.length} spec(s)\n`);
    console.log(`⚙️  Concurrency: ${concurrency} worker(s)`);
    console.log(`📁 Output directory: ${outputDirectory}\n`);
  }

  // Ensure output directory exists
  await fs.mkdir(outputDirectory, { recursive: true });

  // Create queue with concurrency limit
  const queue = new PQueue({ concurrency });

  // Track results
  const results: BulkGenerationResult['results'] = [];
  let completed = 0;

  // Process each spec
  const tasks = specs.map((specFile) =>
    queue.add(async () => {
      const result = await processSpec(specFile, outputDirectory, verbose);
      results.push(result);
      completed++;

      if (verbose) {
        console.log(`📈 Progress: ${completed}/${specs.length} completed`);
      }

      return result;
    })
  );

  // Wait for all tasks to complete
  if (verbose) {
    console.log(`\n🚀 Starting bulk generation...\n`);
  }
  await Promise.all(tasks);

  const duration = Date.now() - startTime;
  const successful = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  if (verbose) {
    console.log(`\n✨ Bulk generation complete!`);
    console.log(`   Total: ${specs.length}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   Average: ${(duration / specs.length / 1000).toFixed(2)}s per PDF\n`);
  }

  return {
    total: specs.length,
    successful,
    failed,
    duration,
    results,
  };
}

/**
 * Generate a results report and save to JSON
 */
export async function saveResultsReport(
  result: BulkGenerationResult,
  outputPath: string
): Promise<void> {
  const report = {
    summary: {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      successRate: `${((result.successful / result.total) * 100).toFixed(1)}%`,
      totalDuration: `${(result.duration / 1000).toFixed(2)}s`,
      averageDuration: `${(result.duration / result.total / 1000).toFixed(2)}s`,
    },
    results: result.results.map((r) => ({
      id: r.id,
      status: r.status,
      pdfPath: r.pdfPath,
      error: r.error,
      duration: r.duration ? `${(r.duration / 1000).toFixed(2)}s` : undefined,
    })),
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📝 Results report saved to: ${outputPath}`);
}
