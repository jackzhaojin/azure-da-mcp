/**
 * Deploy to Azure
 * Uploads PDF run folder to Azure Blob Storage using az CLI
 * Each run goes to a timestamped subfolder, root index.html lists all runs
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export interface DeployToAzureInput {
  sourceDir: string;
  storageAccount: string;
  resourceGroup: string;
  containerName?: string; // Default: 'contentsource'
}

export interface DeployToAzureResult {
  success: boolean;
  url?: string;
  runFolder?: string;
  error?: string;
}

export async function deployToAzure(
  input: DeployToAzureInput
): Promise<DeployToAzureResult> {
  const containerName = input.containerName || 'contentsource';

  try {
    // Verify az CLI is available
    try {
      execSync('az --version', { stdio: 'ignore' });
    } catch (error) {
      return {
        success: false,
        error: 'Azure CLI (az) is not installed or not in PATH',
      };
    }

    // Verify user is logged in
    try {
      execSync('az account show', { stdio: 'ignore' });
    } catch (error) {
      return {
        success: false,
        error: 'Not logged in to Azure CLI. Run: az login',
      };
    }

    // Extract timestamp from sourceDir (e.g., "output/pdf-run-2026-01-10-154252" → "pdf-run-2026-01-10-154252")
    const timestamp = path.basename(input.sourceDir);

    // Create temp directory with timestamped subfolder structure
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'azure-deploy-pdf-'));
    const tempSubDir = path.join(tempDir, timestamp);
    await fs.mkdir(tempSubDir, { recursive: true });

    // Copy all files to temp subdirectory
    console.log(`Preparing files for upload to ${containerName}/${timestamp}/...`);
    await copyDirectory(input.sourceDir, tempSubDir);

    // Upload entire temp directory (which now has the timestamped subfolder)
    console.log(`Uploading files...`);
    execSync(
      `az storage blob upload-batch \
        --account-name ${input.storageAccount} \
        --source "${tempDir}" \
        --destination '${containerName}' \
        --auth-mode login \
        --overwrite`,
      { stdio: 'inherit' }
    );

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true });

    // List all run folders in container to generate root index
    console.log('Listing all runs...');
    const listCmd = `az storage blob list \
      --account-name ${input.storageAccount} \
      --container-name '${containerName}' \
      --auth-mode login \
      --query "[?contains(name, 'index.html')].{name:name, size:properties.contentLength, modified:properties.lastModified}" \
      --output json`;

    const blobList = execSync(listCmd, { encoding: 'utf-8' }).trim();
    const blobs = JSON.parse(blobList);

    // Extract unique run folders from blob names
    const runs: Array<{folder: string, modified: string}> = [];
    for (const blob of blobs) {
      // Match patterns like "pdf-run-2026-01-10-154252/index.html" or "pdf-2025-12-18/index.html"
      const match = blob.name.match(/^(pdf-run-\d{4}-\d{2}-\d{2}-\d{6}|pdf-\d{4}-\d{2}-\d{2})\/index\.html$/);
      if (match) {
        runs.push({
          folder: match[1],
          modified: blob.modified
        });
      }
    }

    // Sort runs in descending order (newest first)
    runs.sort((a, b) => b.modified.localeCompare(a.modified));

    // Get metadata for each run (count PDFs, calculate total size)
    const runMetadata = await Promise.all(runs.map(async (run) => {
      const pdfListCmd = `az storage blob list \
        --account-name ${input.storageAccount} \
        --container-name '${containerName}' \
        --prefix '${run.folder}/' \
        --auth-mode login \
        --query "[?ends_with(name, '.pdf')].{name:name, size:properties.contentLength}" \
        --output json`;

      const pdfBlobs = JSON.parse(execSync(pdfListCmd, { encoding: 'utf-8' }).trim());
      const pdfCount = pdfBlobs.length;
      const totalSize = pdfBlobs.reduce((sum: number, blob: any) => sum + blob.size, 0);

      return {
        folder: run.folder,
        modified: run.modified,
        pdfCount,
        totalSize,
        pdfs: pdfBlobs.map((b: any) => ({
          name: path.basename(b.name),
          size: b.size
        }))
      };
    }));

    // Generate root index.html
    const rootIndexHtml = generateRootIndex(runMetadata, input.storageAccount, containerName);

    // Write root index to temp file
    const tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'azure-root-'));
    const tempIndexPath = path.join(tempRootDir, 'index.html');
    await fs.writeFile(tempIndexPath, rootIndexHtml, 'utf-8');

    // Upload root index.html
    console.log('Updating root index.html...');
    execSync(
      `az storage blob upload \
        --account-name ${input.storageAccount} \
        --container-name '${containerName}' \
        --name index.html \
        --file "${tempIndexPath}" \
        --content-type "text/html" \
        --auth-mode login \
        --overwrite`,
      { stdio: 'inherit' }
    );

    // Clean up temp file
    await fs.rm(tempRootDir, { recursive: true });

    // Construct deployed URL
    const baseUrl = `https://${input.storageAccount}.blob.core.windows.net/${containerName}`;
    const url = `${baseUrl}/${timestamp}/index.html`;

    return {
      success: true,
      url,
      runFolder: timestamp,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deployment failed',
    };
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files, .DS_Store, and temp directories
    if (entry.name.startsWith('.')) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

interface RunMetadata {
  folder: string;
  modified: string;
  pdfCount: number;
  totalSize: number;
  pdfs: Array<{ name: string; size: number }>;
}

function generateRootIndex(runs: RunMetadata[], storageAccount: string, containerName: string): string {
  const runCards = runs
    .map((run) => {
      const pdfLinks = run.pdfs.map(pdf => {
        const azureUrl = `https://${storageAccount}.blob.core.windows.net/${containerName}/${run.folder}/pdfs/${pdf.name}`;
        const sizeInMB = (pdf.size / (1024 * 1024)).toFixed(2);
        return `
          <div class="pdf-item">
            <span class="pdf-name">${pdf.name}</span>
            <span class="pdf-size">${sizeInMB} MB</span>
            <a href="${azureUrl}" class="download-btn" download>Download</a>
          </div>`;
      }).join('\n');

      const totalSizeInMB = (run.totalSize / (1024 * 1024)).toFixed(2);
      const formattedDate = new Date(run.modified).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      return `
    <div class="run-card">
      <div class="run-header">
        <h3>📂 ${run.folder}</h3>
        <span class="run-date">${formattedDate}</span>
      </div>
      <div class="run-stats">
        <span class="stat">${run.pdfCount} PDFs</span>
        <span class="stat">${totalSizeInMB} MB</span>
      </div>
      <div class="pdf-list">
        ${pdfLinks}
      </div>
      <a href="/${containerName}/${run.folder}/index.html" class="view-index-btn">View Run Index</a>
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog PDF Generator - All Runs</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 2.5rem;
      color: #1a1a1a;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: #666;
      font-size: 1.1rem;
      margin-bottom: 2rem;
    }
    .summary {
      background: #f5f5f5;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      display: flex;
      gap: 2rem;
    }
    .summary-stat {
      flex: 1;
    }
    .summary-label {
      font-size: 0.875rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .summary-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #667eea;
      margin-top: 0.25rem;
    }
    .run-card {
      border: 1px solid #eee;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      transition: all 0.2s;
    }
    .run-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .run-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .run-header h3 {
      color: #1a1a1a;
      font-size: 1.25rem;
    }
    .run-date {
      color: #999;
      font-size: 0.875rem;
    }
    .run-stats {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1rem;
    }
    .stat {
      padding: 0.5rem 1rem;
      background: #f5f5f5;
      border-radius: 6px;
      font-size: 0.875rem;
      color: #666;
    }
    .pdf-list {
      margin: 1rem 0;
      border-top: 1px solid #eee;
      padding-top: 1rem;
    }
    .pdf-item {
      display: flex;
      align-items: center;
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.5rem;
      background: #f9f9f9;
    }
    .pdf-name {
      flex: 1;
      font-size: 0.9rem;
      color: #333;
    }
    .pdf-size {
      color: #999;
      font-size: 0.85rem;
      margin-right: 1rem;
    }
    .download-btn {
      background: #667eea;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .download-btn:hover {
      background: #5568d3;
    }
    .view-index-btn {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: #764ba2;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-size: 0.9rem;
      transition: background 0.2s;
    }
    .view-index-btn:hover {
      background: #653a8a;
    }
    footer {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #eee;
      text-align: center;
      color: #999;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Blog PDF Generator</h1>
    <p class="subtitle">All Generated PDF Runs</p>

    <div class="summary">
      <div class="summary-stat">
        <div class="summary-label">Total Runs</div>
        <div class="summary-value">${runs.length}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Latest Run</div>
        <div class="summary-value">${runs[0] ? new Date(runs[0].modified).toLocaleDateString() : 'N/A'}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Total PDFs</div>
        <div class="summary-value">${runs.reduce((sum, r) => sum + r.pdfCount, 0)}</div>
      </div>
    </div>

    <h2 style="margin-bottom: 1rem; color: #1a1a1a;">Available Runs</h2>
    ${runCards}

    <footer>
      Generated by Blog PDF Generator • Storage: ${storageAccount} / ${containerName}
    </footer>
  </div>
</body>
</html>`;
}
