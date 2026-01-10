#!/bin/bash

# Adobe Summit 2026 Blog Generation - Timestamped Execution
#
# EXECUTION REQUIREMENTS:
# -----------------------
# This script MUST be run from the blog-static-site-generator project root:
#   cd /path/to/blog-static-site-generator
#   ./prompts/2026-01-10-claude-design/run-timestamped.sh
#
# OR run it directly and it will auto-detect the correct directory:
#   /path/to/prompts/2026-01-10-claude-design/run-timestamped.sh
#
# PREREQUISITES:
# - npm dependencies installed (npm install)
# - .env file with ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN
# - TypeScript built (npm run build)

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
DESIGN_SYSTEM_PATH="./prompts/2026-01-10-claude-design/adobe-summit-blog-design-system.md"
SPEC_FILE="./prompts/2026-01-10-claude-design/run-adobe-summit-2026-${TIMESTAMP}.md"
OUTPUT_DIR="./output/${TIMESTAMP}"

echo "📝 Creating spec file: $SPEC_FILE"

cat > "$SPEC_FILE" <<EOF
# Adobe Summit 2026 Blog Generation - Run ${TIMESTAMP}

## Design System
path: ${DESIGN_SYSTEM_PATH}
format: consolidated

## Content
count: 10
theme: Adobe Summit 2026
topics:
  - Edge Delivery Services
  - GenAI in Digital Experience
  - Content Velocity & Authoring
  - DA.Live Authoring Platform
  - Adobe Experience Manager
  - Personalization & Analytics
  - Developer Experience
  - Marketing Innovation
  - Customer Success Stories
  - Future of Digital Experience

## Output
directory: ${OUTPUT_DIR}
includeLandingPage: true
siteTitle: Adobe Summit 2026 Blog
siteDescription: Insights, innovations, and announcements from Adobe Summit 2026

## Deployment
storageAccount: dalivemcprg94e3
resourceGroup: RESOURCE_GROUP_NAME
EOF

echo ""
echo "🚀 Starting blog generation..."
echo "   Design System: $DESIGN_SYSTEM_PATH"
echo "   Output: $OUTPUT_DIR"
echo "   Spec: $SPEC_FILE"
echo ""

# Run the generator
npm run generate "$SPEC_FILE"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "============================================================"
  echo "✅ Generation successful!"
  echo "============================================================"
  echo ""
  echo "   📁 Output directory: $OUTPUT_DIR"
  echo "   📄 Spec file: $SPEC_FILE"
  echo ""
  echo "🌐 To view locally:"
  echo "   open $OUTPUT_DIR/index.html"
  echo ""
  echo "☁️  To deploy to Azure:"
  echo "   1. Set RESOURCE_GROUP_NAME in the spec file"
  echo "   2. Run: az login"
  echo "   3. Re-run this script"
  echo ""
else
  echo ""
  echo "============================================================"
  echo "❌ Generation failed with exit code: $EXIT_CODE"
  echo "============================================================"
  echo ""
  echo "💡 Troubleshooting:"
  echo "   - Check if .env file exists with ANTHROPIC_API_KEY"
  echo "   - Verify dependencies installed: npm install"
  echo "   - Build TypeScript: npm run build"
  echo "   - Check error logs above"
  echo ""
  exit $EXIT_CODE
fi
