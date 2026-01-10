#!/bin/bash

# Adobe Summit 2026 Blog Generation - Timestamped Execution
# This script runs the generator with a timestamped output directory

set -e  # Exit on error (but we'll handle retries)

# Generate timestamp (format: YYYY-MM-DD-HHMMSS)
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
echo "🕐 Timestamp: $TIMESTAMP"

# Create timestamped spec file
SPEC_FILE="run-adobe-summit-2026-${TIMESTAMP}.md"
OUTPUT_DIR="./output/${TIMESTAMP}"

echo "📝 Creating spec file: $SPEC_FILE"
cat > "$SPEC_FILE" <<EOF
# Adobe Summit 2026 Blog Generation - Run ${TIMESTAMP}

## Design System
path: /Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-static-site-generator/prompts/2026-01-10-claude-design/adobe-summit-blog-design-system.md
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
EOF

echo ""
echo "🚀 Starting blog generation..."
echo "   Output: $OUTPUT_DIR"
echo ""

# Run the generator
npm run generate "$SPEC_FILE"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ Generation successful!"
  echo "   Output directory: $OUTPUT_DIR"
  echo "   Spec file: $SPEC_FILE"
  echo ""
  echo "To view locally, open: $OUTPUT_DIR/index.html"
else
  echo ""
  echo "❌ Generation failed with exit code: $EXIT_CODE"
  echo "   Check logs above for errors"
  exit $EXIT_CODE
fi
