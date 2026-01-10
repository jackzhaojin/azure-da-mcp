#!/bin/bash

# Adobe Summit 2026 PDF Generation - Timestamped Execution
#
# EXECUTION REQUIREMENTS:
# -----------------------
# This script MUST be run from the blog-pdf-generator project root:
#   cd /path/to/blog-pdf-generator
#   ./prompts/2026-01-10-pdf-generation/run-timestamped.sh
#
# OR run it directly and it will auto-detect the correct directory:
#   /path/to/prompts/2026-01-10-pdf-generation/run-timestamped.sh
#
# PREREQUISITES:
# - npm dependencies installed (npm install)
# - .env file with ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN
# - TypeScript built (npm run build)
# - Azure CLI installed and logged in (az login) for deployment

set -e  # Exit on error

# Detect script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📁 Project Root: $PROJECT_ROOT"
echo "📁 Script Dir: $SCRIPT_DIR"

# Change to project root for execution
cd "$PROJECT_ROOT"

# Verify we're in the right place
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Are you in the correct directory?"
  exit 1
fi

# Generate timestamp (format: YYYY-MM-DD-HHMMSS)
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
echo ""
echo "🕐 Timestamp: $TIMESTAMP"

# Define paths relative to project root
CONFIG_PATH="./prompts/2026-01-10-pdf-generation/adobe-summit-2026-config.json"
SPECS_DIR="./output/specs"
OUTPUT_DIR="./output/pdf-run-${TIMESTAMP}"
RUN_LOG="./prompts/2026-01-10-pdf-generation/run-pdf-generation-${TIMESTAMP}.md"

echo ""
echo "============================================================"
echo "  Adobe Summit 2026 PDF Generation Pipeline"
echo "============================================================"
echo ""

# Step 1: Generate Specs
echo "📝 Step 1: Generating BlogPdfSpec JSON files..."
echo "   Config: $CONFIG_PATH"
echo "   Output: $SPECS_DIR"
echo ""

npm run generate:specs "$CONFIG_PATH"

STEP1_EXIT=$?
if [ $STEP1_EXIT -ne 0 ]; then
  echo ""
  echo "❌ Spec generation failed with exit code: $STEP1_EXIT"
  exit $STEP1_EXIT
fi

# Count generated specs
SPEC_COUNT=$(find "$SPECS_DIR" -name "*.json" -type f | wc -l | tr -d ' ')
echo ""
echo "✅ Generated $SPEC_COUNT spec files"

# Step 2: Generate PDFs with deployment
echo ""
echo "📄 Step 2: Generating PDFs from specs..."
echo "   Input: $SPECS_DIR"
echo "   Output: $OUTPUT_DIR"
echo "   Deploy: Yes (to Azure contentsource)"
echo ""

npm run generate:bulk "$SPECS_DIR" -- --output "$OUTPUT_DIR" --deploy

STEP2_EXIT=$?
if [ $STEP2_EXIT -ne 0 ]; then
  echo ""
  echo "❌ PDF generation/deployment failed with exit code: $STEP2_EXIT"
  exit $STEP2_EXIT
fi

# Create run log
echo ""
echo "📋 Creating run log..."
cat > "$RUN_LOG" <<EOF
# Adobe Summit 2026 PDF Generation - Run ${TIMESTAMP}

**Timestamp**: ${TIMESTAMP}
**Status**: ✅ Success
**Output**: ${OUTPUT_DIR}

## Execution Summary

- **Specs Generated**: ${SPEC_COUNT}
- **PDFs Generated**: (see bulk-generation-report.json)
- **Deployed to Azure**: Yes (contentsource/pdf-run-${TIMESTAMP})

## Files

- **Local Output**: \`${OUTPUT_DIR}\`
- **Azure URL**: \`https://dalivemcprg94e3.blob.core.windows.net/contentsource/pdf-run-${TIMESTAMP}/index.html\`
- **Config**: \`${CONFIG_PATH}\`
- **This Log**: \`${RUN_LOG}\`

## Next Steps

1. View local index: \`open ${OUTPUT_DIR}/index.html\`
2. View Azure index: Open Azure URL above
3. Download PDFs from either local or Azure links
4. Review generation report: \`${OUTPUT_DIR}/bulk-generation-report.json\`
EOF

echo ""
echo "============================================================"
echo "✅ Adobe Summit 2026 PDF Generation Complete!"
echo "============================================================"
echo ""
echo "   📁 Local Output: $OUTPUT_DIR"
echo "   ☁️  Azure Folder: pdf-run-${TIMESTAMP}"
echo "   📋 Run Log: $RUN_LOG"
echo ""
echo "🌐 View Results:"
echo "   Local: open $OUTPUT_DIR/index.html"
echo "   Azure: https://dalivemcprg94e3.blob.core.windows.net/contentsource/pdf-run-${TIMESTAMP}/index.html"
echo ""
