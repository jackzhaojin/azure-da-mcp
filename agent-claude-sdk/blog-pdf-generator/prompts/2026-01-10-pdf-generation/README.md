# Adobe Summit 2026 PDF Generation - Execution Configuration

**Version**: 2026-01-10
**Purpose**: Generate AI-powered blog PDFs for Adobe Summit 2026 with automated Azure deployment

---

## 📁 Directory Contents

### Configuration Files
- **`adobe-summit-2026-config.json`**
  - Theme, topics, and generation settings
  - Template distribution and media settings
  - Output and deployment configuration

- **`adobe-summit-2026-pdf-execution.md`**
  - AI prompt template for PDF content generation
  - Instructs Agent SDK to read config and generate specs
  - Defines quality standards and output requirements

### Execution Files
- **`run-timestamped.sh`**
  - Main execution script
  - Auto-detects project root
  - Creates timestamped output directories
  - Runs spec generation → PDF generation → Azure deployment
  - Handles errors and retries

- **`run-adobe-summit-2026.md`**
  - Template spec file for manual execution
  - Shows complete workflow configuration

### Generated Files
- **`run-pdf-generation-YYYY-MM-DD-HHMMSS.md`**
  - Timestamped run logs from each execution
  - Preserved for versioning and reproducibility

---

## 🚀 Quick Start

### Prerequisites

1. **Navigate to project root**:
   ```bash
   cd /Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-pdf-generator
   ```

2. **Verify environment**:
   ```bash
   # Check .env file exists with API key
   cat .env | grep ANTHROPIC_API_KEY

   # Install dependencies if needed
   npm install

   # Build TypeScript
   npm run build
   ```

3. **Azure login** (for deployment):
   ```bash
   az login
   ```

### Run Generation

**Option 1: From project root**
```bash
./prompts/2026-01-10-pdf-generation/run-timestamped.sh
```

**Option 2: Run from anywhere**
```bash
/Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-pdf-generator/prompts/2026-01-10-pdf-generation/run-timestamped.sh
```

The script will:
1. Auto-detect project root
2. Verify package.json exists
3. Generate timestamp (YYYY-MM-DD-HHMMSS)
4. Run spec generation (10 BlogPdfSpec JSON files)
5. Generate PDFs from specs
6. Create index.html with PDF gallery
7. Deploy to Azure `contentsource` container
8. Save to `output/pdf-run-YYYY-MM-DD-HHMMSS/`

---

## 📊 Output Structure

```
output/pdf-run-YYYY-MM-DD-HHMMSS/
├── index.html                              # PDF gallery with local + Azure links
├── specs/                                  # Generated BlogPdfSpec JSONs
│   ├── blog-01-*.json
│   ├── blog-02-*.json
│   └── ...
├── pdfs/                                   # Generated PDFs
│   ├── ai-powered-package-tracking-2025.pdf
│   ├── blockchain-supply-chain-transparency.pdf
│   └── ...
├── assets/                                 # Optimized images
│   └── ...
└── bulk-generation-report.json             # Generation metadata
```

**Azure Structure** (`contentsource` container):
```
contentsource/
├── index.html                              # Root index listing all runs
└── pdf-run-YYYY-MM-DD-HHMMSS/              # Run folder
    ├── index.html                          # Run-specific PDF gallery
    ├── specs/
    ├── pdfs/
    ├── assets/
    └── bulk-generation-report.json
```

---

## ⚙️ Configuration

### Modify Topics

Edit `adobe-summit-2026-config.json`:

```json
{
  "theme": "Adobe Summit 2026",
  "topics": [
    "Edge Delivery Services",
    "GenAI in Digital Experience",
    "Your Custom Topic Here"
  ]
}
```

### Change PDF Count

Edit config `generationSettings.count`:
```json
{
  "generationSettings": {
    "count": 10
  }
}
```

### Configure Deployment

Edit config `deployment` section:
```json
{
  "deployment": {
    "enabled": true,
    "storageAccount": "dalivemcprg94e3",
    "resourceGroup": "da-live-mcp-rg",
    "container": "contentsource"
  }
}
```

---

## 📈 Performance

**Typical Generation Time**: 6-10 minutes for 10 PDFs

**Breakdown**:
- Spec generation (AI): ~60-120s
- PDF generation (bulk): ~120-240s
- Index generation: ~5s
- Azure deployment: ~10-30s (depends on file size)
- Total: ~6-10 minutes

---

## 🐛 Troubleshooting

### Error: "package.json not found"
**Solution**: Script must run from project root. The script auto-detects this, but verify you're in the correct directory.

### Error: "Missing API key"
**Solution**: Create `.env` file in project root with:
```
ANTHROPIC_API_KEY=your_key_here
```

### Error: "Cannot find module"
**Solution**: Install dependencies:
```bash
npm install
npm run build
```

### Azure deployment fails
**Solution**: Ensure you're logged in:
```bash
az login
az account show
```

### PDFs not appearing in Azure
**Solution**: Check blob list:
```bash
az storage blob list \
  --account-name dalivemcprg94e3 \
  --container-name contentsource \
  --auth-mode login \
  --query "[].name" -o table
```

---

## 📝 Manual Execution

For more control over the workflow:

```bash
cd /Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-pdf-generator

# Step 1: Generate specs
npm run generate:specs prompts/2026-01-10-pdf-generation/adobe-summit-2026-config.json

# Step 2: Generate PDFs
npm run generate:bulk output/specs --output output/pdf-run-2026-01-10-150000

# Step 3: Deploy to Azure (when implemented)
# (Will be integrated into bulk CLI with --deploy flag)
```

---

## 🔗 Related Files

- **Main README**: `../../README.md` (project documentation)
- **Release 2.0 Plan**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/blog-pdf-generator/release-2.0-plan.md`

---

## 📌 Notes

- All paths are relative to project root
- Timestamped run logs are preserved for versioning
- Output directories are timestamped to avoid conflicts
- Each run is completely independent and reproducible
- PDFs are uploaded to Azure `contentsource` container
