#!/bin/bash
set -e

# Generate .claude.json from env at runtime (mirrors the v1 app's proven
# docker-entrypoint.sh) — the Claude Code CLI needs the oauthAccount stanza to
# use CLAUDE_CODE_OAUTH_TOKEN headlessly, and we never bake credentials into
# the image. Without these vars the agentic tier silently falls back to
# deterministic scoring, so only warn.
if [ -n "$CLAUDE_ACCOUNT_UUID" ] && [ -n "$CLAUDE_EMAIL" ] && [ -n "$CLAUDE_ORG_UUID" ]; then
  cat > "$HOME/.claude.json" <<EOF
{
  "oauthAccount": {
    "accountUuid": "$CLAUDE_ACCOUNT_UUID",
    "emailAddress": "$CLAUDE_EMAIL",
    "organizationUuid": "$CLAUDE_ORG_UUID"
  },
  "mcpServers": {}
}
EOF
  mkdir -p "$HOME/.claude"
  echo "generated .claude.json for $CLAUDE_EMAIL"
else
  echo "WARN: CLAUDE_ACCOUNT_UUID/CLAUDE_EMAIL/CLAUDE_ORG_UUID unset — agentic tier will fall back to deterministic"
fi

exec "$@"
