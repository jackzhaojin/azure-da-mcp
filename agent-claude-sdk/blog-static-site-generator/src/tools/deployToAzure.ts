/**
 * Deploy to Azure
 * Uploads static site to Azure Blob Storage using az CLI
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
  containerName?: string; // Default: '$web'
}

export interface DeployToAzureResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function deployToAzure(
  input: DeployToAzureInput
): Promise<DeployToAzureResult> {
  const containerName = input.containerName || '$web';

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

    // Enable static website on storage account
    console.log('Enabling static website...');
    execSync(
      `az storage blob service-properties update \
        --account-name ${input.storageAccount} \
        --static-website \
        --index-document index.html \
        --404-document index.html \
        --auth-mode login`,
      { stdio: 'inherit' }
    );

    // Extract timestamp from sourceDir (e.g., "output/2026-01-10-154252" → "2026-01-10-154252")
    const timestamp = path.basename(input.sourceDir);

    // Create temp directory with timestamped subfolder structure
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'azure-deploy-'));
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

    // List all run folders in $web to generate root index
    console.log('Listing all runs...');
    const listCmd = `az storage blob list \
      --account-name ${input.storageAccount} \
      --container-name '${containerName}' \
      --auth-mode login \
      --query "[?contains(name, 'index.html')].name" \
      --output tsv`;

    const blobList = execSync(listCmd, { encoding: 'utf-8' }).trim();
    const runs: string[] = [];

    // Extract unique run folders from blob names like "2026-01-10-154252/index.html"
    for (const blobName of blobList.split('\n')) {
      const match = blobName.match(/^(\d{4}-\d{2}-\d{2}-\d{6})\/index\.html$/);
      if (match) {
        runs.push(match[1]);
      }
    }

    // Sort runs in descending order (newest first)
    runs.sort().reverse();

    // Generate root index.html
    const rootIndexHtml = generateRootIndex(runs, input.storageAccount);

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

    // Get deployed URL
    const urlCmd = `az storage account show \
      --name ${input.storageAccount} \
      --resource-group ${input.resourceGroup} \
      --query "primaryEndpoints.web" \
      --output tsv`;

    const baseUrl = execSync(urlCmd, { encoding: 'utf-8' }).trim();
    const url = `${baseUrl}${timestamp}/`;

    return {
      success: true,
      url,
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

function generateRootIndex(runs: string[], storageAccount: string): string {
  const runLinks = runs
    .map(
      (run) => `
    <li>
      <a href="/${run}/">
        <strong>${run}</strong>
      </a>
      <span class="date">${formatTimestamp(run)}</span>
    </li>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adobe Summit 2026 Blog - All Runs</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Adobe Clean', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 900px;
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
    .stats {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      display: flex;
      gap: 2rem;
    }
    .stat {
      flex: 1;
    }
    .stat-label {
      font-size: 0.875rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #667eea;
    }
    ul {
      list-style: none;
    }
    li {
      border-bottom: 1px solid #eee;
      padding: 1rem 0;
    }
    li:last-child {
      border-bottom: none;
    }
    a {
      text-decoration: none;
      color: #667eea;
      font-size: 1.125rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s;
      padding: 0.5rem;
      border-radius: 8px;
    }
    a:hover {
      background: #f5f5f5;
      transform: translateX(8px);
    }
    .date {
      color: #999;
      font-size: 0.875rem;
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
    <h1>Adobe Summit 2026 Blog</h1>
    <p class="subtitle">All Generated Runs</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total Runs</div>
        <div class="stat-value">${runs.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Latest Run</div>
        <div class="stat-value">${runs[0] ? formatTimestamp(runs[0]) : 'N/A'}</div>
      </div>
    </div>

    <h2 style="margin-bottom: 1rem; color: #1a1a1a;">Available Runs</h2>
    <ul>
      ${runLinks}
    </ul>

    <footer>
      Generated by Blog Static Site Generator • Storage: ${storageAccount}
    </footer>
  </div>
</body>
</html>`;
}

function formatTimestamp(timestamp: string): string {
  // Convert "2026-01-10-154252" to "Jan 10, 2026 3:42 PM"
  const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!match) return timestamp;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
