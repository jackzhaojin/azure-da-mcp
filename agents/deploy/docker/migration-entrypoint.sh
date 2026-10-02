#!/bin/bash
set -e

# Generate .claude.json from env at runtime (same recipe as eval-entrypoint.sh) -
# the Claude Code CLI that the sdk backend's Agent SDK spawns needs the
# oauthAccount stanza to use CLAUDE_CODE_OAUTH_TOKEN headlessly, and we never
# bake creds into the image. Without these vars an sdk migration fails at the
# CLI's auth check (the task fails with the CLI error); opencode/dryrun are
# unaffected, so only warn.
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
  echo "generated .claude.json for $CLAUDE_EMAIL - sdk (Claude) migration backend enabled"
else
  echo "WARN: CLAUDE_ACCOUNT_UUID/CLAUDE_EMAIL/CLAUDE_ORG_UUID unset - the sdk (Claude) migration backend will not authenticate"
fi

exec "$@"
