#!/bin/bash
set -e

# Generate .claude.json from environment variables at runtime
# This prevents baking OAuth credentials into the Docker image

CLAUDE_CONFIG_FILE="/home/appuser/.claude.json"

# Check if required environment variables are set
if [ -z "$CLAUDE_ACCOUNT_UUID" ] || [ -z "$CLAUDE_EMAIL" ] || [ -z "$CLAUDE_ORG_UUID" ]; then
  echo "ERROR: Missing required Claude configuration environment variables"
  echo "Required: CLAUDE_ACCOUNT_UUID, CLAUDE_EMAIL, CLAUDE_ORG_UUID"
  exit 1
fi

# Create .claude directory if it doesn't exist
mkdir -p /home/appuser/.claude

# Generate .claude.json from environment variables
cat > "$CLAUDE_CONFIG_FILE" <<EOF
{
  "oauthAccount": {
    "accountUuid": "$CLAUDE_ACCOUNT_UUID",
    "emailAddress": "$CLAUDE_EMAIL",
    "organizationUuid": "$CLAUDE_ORG_UUID"
  },
  "mcpServers": {}
}
EOF

echo "✅ Generated .claude.json with account: $CLAUDE_EMAIL"

# Execute the main command (Next.js server)
exec "$@"
