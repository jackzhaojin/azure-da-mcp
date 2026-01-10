/**
 * Generate Index HTML
 * Creates a gallery page listing all PDFs in the run with local and Azure links
 */

import path from 'path';
import fs from 'fs/promises';

export interface PdfMetadata {
  filename: string;
  title: string;
  author?: string;
  date?: string;
  tags?: string[];
  filePath: string;
  fileSize: number;
}

export interface GenerateIndexInput {
  pdfs: PdfMetadata[];
  outputPath: string;
  runTimestamp: string;
  storageAccount?: string;
  containerName?: string;
  deployed?: boolean;
}

export interface GenerateIndexResult {
  success: boolean;
  indexPath?: string;
  error?: string;
}

export async function generateIndex(
  input: GenerateIndexInput
): Promise<GenerateIndexResult> {
  try {
    const html = createIndexHtml(input);
    await fs.writeFile(input.outputPath, html, 'utf-8');

    return {
      success: true,
      indexPath: input.outputPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate index',
    };
  }
}

function createIndexHtml(input: GenerateIndexInput): string {
  const { pdfs, runTimestamp, storageAccount, containerName, deployed } = input;

  const pdfCards = pdfs
    .map((pdf) => {
      const localPath = `./pdfs/${pdf.filename}`;
      const azureUrl = deployed && storageAccount && containerName
        ? `https://${storageAccount}.blob.core.windows.net/${containerName}/${runTimestamp}/pdfs/${pdf.filename}`
        : null;

      const sizeInMB = (pdf.fileSize / (1024 * 1024)).toFixed(2);
      const tags = pdf.tags?.slice(0, 3).join(', ') || 'N/A';

      return `
    <div class="pdf-card">
      <div class="pdf-icon">📄</div>
      <div class="pdf-info">
        <h3 class="pdf-title">${pdf.title}</h3>
        <div class="pdf-meta">
          <span class="meta-item">👤 ${pdf.author || 'Unknown'}</span>
          <span class="meta-item">📅 ${pdf.date || 'N/A'}</span>
          <span class="meta-item">💾 ${sizeInMB} MB</span>
        </div>
        <div class="pdf-tags">${tags}</div>
      </div>
      <div class="pdf-actions">
        <a href="${localPath}" class="btn btn-primary" download>
          📥 Download Local
        </a>
        ${azureUrl ? `
        <a href="${azureUrl}" class="btn btn-secondary" target="_blank">
          ☁️ View in Azure
        </a>
        <div class="azure-url">
          <span class="url-label">Azure URL:</span>
          <input type="text" class="url-input" value="${azureUrl}" readonly onclick="this.select()">
        </div>
        ` : ''}
      </div>
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDF Gallery - ${runTimestamp}</title>
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
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    header {
      margin-bottom: 3rem;
      border-bottom: 2px solid #f0f0f0;
      padding-bottom: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      color: #1a1a1a;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: #666;
      font-size: 1.1rem;
    }
    .summary {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      display: flex;
      gap: 2rem;
    }
    .summary-stat {
      flex: 1;
      text-align: center;
    }
    .summary-label {
      font-size: 0.875rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .summary-value {
      font-size: 2rem;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-top: 0.5rem;
    }
    .pdf-grid {
      display: grid;
      gap: 2rem;
    }
    .pdf-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 1.5rem;
      padding: 2rem;
      border: 2px solid #f0f0f0;
      border-radius: 12px;
      transition: all 0.3s;
      align-items: start;
    }
    .pdf-card:hover {
      border-color: #667eea;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.15);
      transform: translateY(-2px);
    }
    .pdf-icon {
      font-size: 3rem;
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-radius: 12px;
    }
    .pdf-info {
      flex: 1;
    }
    .pdf-title {
      font-size: 1.5rem;
      color: #1a1a1a;
      margin-bottom: 1rem;
      line-height: 1.3;
    }
    .pdf-meta {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .meta-item {
      font-size: 0.9rem;
      color: #666;
    }
    .pdf-tags {
      font-size: 0.85rem;
      color: #999;
      font-style: italic;
    }
    .pdf-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 200px;
    }
    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      text-align: center;
      transition: all 0.2s;
      font-size: 0.9rem;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover {
      background: #5568d3;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    .btn-secondary {
      background: #764ba2;
      color: white;
    }
    .btn-secondary:hover {
      background: #653a8a;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(118, 75, 162, 0.3);
    }
    .azure-url {
      margin-top: 0.5rem;
      padding: 0.75rem;
      background: #f9f9f9;
      border-radius: 6px;
    }
    .url-label {
      display: block;
      font-size: 0.75rem;
      color: #999;
      margin-bottom: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .url-input {
      width: 100%;
      font-size: 0.75rem;
      font-family: 'Courier New', monospace;
      padding: 0.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: white;
      color: #666;
    }
    .url-input:focus {
      outline: none;
      border-color: #667eea;
    }
    footer {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 2px solid #f0f0f0;
      text-align: center;
      color: #999;
      font-size: 0.875rem;
    }
    .deployment-status {
      margin-top: 0.5rem;
      padding: 0.75rem 1rem;
      background: ${deployed ? '#4ade8015' : '#fbbf2415'};
      border-left: 3px solid ${deployed ? '#4ade80' : '#fbbf24'};
      border-radius: 6px;
      color: #666;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📚 PDF Gallery</h1>
      <p class="subtitle">Run: ${runTimestamp}</p>
      ${deployed ? `
      <div class="deployment-status">
        ☁️ <strong>Deployed to Azure</strong> • Storage: ${storageAccount} • Container: ${containerName}
      </div>
      ` : `
      <div class="deployment-status">
        💾 <strong>Local Only</strong> • Not deployed to Azure
      </div>
      `}
    </header>

    <div class="summary">
      <div class="summary-stat">
        <div class="summary-label">Total PDFs</div>
        <div class="summary-value">${pdfs.length}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Total Size</div>
        <div class="summary-value">${(pdfs.reduce((sum, p) => sum + p.fileSize, 0) / (1024 * 1024)).toFixed(1)} MB</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Status</div>
        <div class="summary-value">${deployed ? '☁️' : '💾'}</div>
      </div>
    </div>

    <div class="pdf-grid">
      ${pdfCards}
    </div>

    <footer>
      Generated by Blog PDF Generator • ${new Date().toLocaleString()}
    </footer>
  </div>
</body>
</html>`;
}
