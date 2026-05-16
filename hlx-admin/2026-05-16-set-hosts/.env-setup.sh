#!/usr/bin/env bash
# Env for hlx-admin work — DA IMS token from ~/.aem/da-token.json
# Used as: Authorization: Bearer ${AUTH_TOKEN}  (NOT X-Auth-Token — that's the cookie-based hlx token)
# Token TTL is short; refresh with: npx github:adobe-rnd/da-auth-helper token

export BASE_URL="https://admin.hlx.page"
export ORG="jackzhaojin"
export SITE="da-live-postal-2025-07"
export REPO="da-live-postal-2025-07"
export REF="main"

# Pull token from cache (or empty if expired)
export AUTH_TOKEN="$(node -e "
  const fs = require('fs');
  const p = process.env.HOME + '/.aem/da-token.json';
  try {
    const t = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (t.expires_at > Date.now() + 60000) process.stdout.write(t.access_token);
  } catch {}
")"

if [ -z "$AUTH_TOKEN" ]; then
  echo "[env] DA token expired/missing — run: DA_TOKEN=\$(npx github:adobe-rnd/da-auth-helper token)" >&2
  echo "[env] then re-source this file" >&2
fi
