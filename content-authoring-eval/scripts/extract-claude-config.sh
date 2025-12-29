#!/bin/bash
# Extract Claude account info from local ~/.claude.json for Docker deployment
# This script helps you populate .env.docker with your account credentials

set -e

CLAUDE_CONFIG="$HOME/.claude.json"

if [ ! -f "$CLAUDE_CONFIG" ]; then
  echo "❌ Error: $CLAUDE_CONFIG not found"
  echo ""
  echo "Please run 'claude --version' first to initialize Claude Code CLI"
  exit 1
fi

echo "📋 Extracting Claude account info from $CLAUDE_CONFIG"
echo ""

# Extract account info using jq (or python as fallback)
if command -v jq &> /dev/null; then
  ACCOUNT_UUID=$(jq -r '.oauthAccount.accountUuid' "$CLAUDE_CONFIG")
  EMAIL=$(jq -r '.oauthAccount.emailAddress' "$CLAUDE_CONFIG")
  ORG_UUID=$(jq -r '.oauthAccount.organizationUuid' "$CLAUDE_CONFIG")
else
  # Fallback to python
  ACCOUNT_UUID=$(python3 -c "import json; print(json.load(open('$CLAUDE_CONFIG'))['oauthAccount']['accountUuid'])")
  EMAIL=$(python3 -c "import json; print(json.load(open('$CLAUDE_CONFIG'))['oauthAccount']['emailAddress'])")
  ORG_UUID=$(python3 -c "import json; print(json.load(open('$CLAUDE_CONFIG'))['oauthAccount']['organizationUuid'])")
fi

echo "Copy these values to your .env.docker file:"
echo ""
echo "CLAUDE_ACCOUNT_UUID=$ACCOUNT_UUID"
echo "CLAUDE_EMAIL=$EMAIL"
echo "CLAUDE_ORG_UUID=$ORG_UUID"
echo ""
echo "⚠️  You still need to add your CLAUDE_CODE_OAUTH_TOKEN from .env.local"
