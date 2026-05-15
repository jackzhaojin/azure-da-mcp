# Authentication for the DA.live MCP server

Reference page. Load this when a tool call returns 401, when you need to understand how bearer tokens flow between the host and the server, or when you need to explain to the user why their token expired and what to do.

## What the server expects

The DA.live MCP server (the Azure Function at `…/api/mcp-streamable`) is intentionally a **per-request pass-through** to Adobe's da.live admin API. It does not store, mint, refresh, or validate tokens of its own. Every `tools/call` request must carry a valid Adobe IMS bearer token, and that token is forwarded verbatim to `admin.da.live` (and to `admin.hlx.page` for preview-publish). If no bearer is present, the server returns `401`. If da.live rejects the bearer, the server surfaces that rejection unchanged.

This is by design. Storing a long-lived token on the server would mean every caller acts as the same identity, and any unauthenticated caller would inherit that identity — a real production hole this server intentionally avoids. Per-request bearers mean the server has no privileged identity; each call is scoped to whoever holds the token.

## The two delivery channels

The server accepts the bearer through two channels, in this precedence:

1. **`Authorization: Bearer <token>` HTTP header** — the standard channel. Real header always wins.
2. **`bearerToken` field inside the tool call's `arguments` object** — fallback for hosts that can't set custom HTTP headers on remote MCP requests. The server reads this, uses it as the upstream bearer, and **strips the field before passing arguments to the tool implementation** — so it never appears in tool error output or downstream logs.

(A third path exists in code — a server-side env var `DALIVE_BEARER_TOKEN` — but that's a local-development convenience and is intentionally unset on the deployed function. Don't rely on it.)

## When each channel applies

The host you're running in decides which channel works:

| Host | Channel | Notes |
|---|---|---|
| Claude Desktop (via stdio bridge) | Header | Bridge sets `Authorization` from local config. Today the bridge still reads `DALIVE_BEARER_TOKEN` env var; future versions may call the helper directly. |
| Claude Code (CLI) | Header | Custom-header flag on `claude mcp add`. |
| curl / Bruno / Postman | Header | Standard HTTP. |
| ChatGPT custom actions | Header | OpenAPI auth header config. |
| **Claude.ai custom connectors** | **Arg field** | Claude.ai's connector UI exposes no custom-header config — only `OAuth Client ID/Secret` (DCR bypass, not relevant here). The `bearerToken`-in-args channel is the only viable path. |
| **Make.com MCP modules** | **Arg field** | Similarly sticky — MCP server config doesn't expose per-request headers. |
| n8n | Header | HTTP node lets you set headers. |

You usually don't need to detect this yourself. The user's project knowledge / system prompt will give you the instruction: "always include `bearerToken: \"eyJ...\"` in every tool call." When you see that instruction, follow it. When you don't, just call tools normally and trust the host's transport.

**Defensive practice**: if a `bearerToken` value is available to you, passing it in args is safe — the server prefers the real header when both are present, so it'll just be ignored when not needed. There is no downside to including it.

## Where the token comes from

Tokens are issued by Adobe IMS for the public `darkalley` client, via a one-step OAuth implicit flow. The canonical way to obtain one is the `da-auth-helper` CLI:

```bash
# One-shot: prints a fresh token to stdout, caches it at ~/.aem/da-token.json
TOKEN=$(npx github:adobe-rnd/da-auth-helper token)
```

The command opens the user's default browser, they log into Adobe with their IMS account, the browser redirects to `localhost:9898/callback`, and the token is captured. Subsequent runs return the cached value until expiry. The cache file is JSON:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_at": 1778946367069
}
```

Each token is valid for **~24 hours** (some skill docs say 1h — the actual `expires_in` claim is 86400000ms = 24h). It carries the full DA scope set: `aem.frontend.all`, `ab.manage`, `AdobeID`, `gnav`, `openid`, `org.read`, `read_organizations`, `session`, `additional_info.ownerOrg`, `additional_info.projectedProductContext`, `account_cluster.read`. That's sufficient for every DA.live MCP tool: list, get, save, create, create-folder, preview-publish.

Tokens have no `aud` (audience) claim, so the same value works against any DA.live MCP deployment — local, staging, prod. They're not bound to a specific resource server.

## What 401 means and what to do

When a DA.live MCP tool call returns one of these errors:

- `Authentication failed for da.live API`
- `Invalid session: No session or Bearer token provided.`
- `401 Unauthorized: Invalid or expired Bearer token`
- `Authentication failed for admin.hlx.page preview` (preview-publish path)

…something on the bearer pipeline is broken. Most likely cause is **token expiry** (the user authenticated >24h ago).

**The right response**: stop the operation cleanly, do not retry blindly, and tell the user explicitly:

> The DA.live bearer token has expired (or never reached the server). Please run `npx github:adobe-rnd/da-auth-helper token` on your machine and update wherever the token is stored — for Claude.ai custom connectors, that's the project knowledge text containing `bearerToken: "..."`. Once updated, I can resume.

**Do not try to refresh the token yourself.** The helper requires a local browser session on the user's machine, which the skill can't drive from inside a host. Even if you tried to call `getValidToken()` directly, that needs `localhost:9898` to be free on the user's machine and a real browser — neither available from inside the skill.

## 403 vs 401

If the server returns the error wrapped as 403 (or da.live returns 403), that means **the token is valid but the authenticated user lacks permissions on `{owner}/{site}`**. That's a different problem — confirm the working context with the user; they may not have access to the org/repo they're asking you to work in.

## Quick triage table

| Symptom | Likely cause | Fix |
|---|---|---|
| Very first tool call returns 401 | No bearer reaching the server | Host isn't on the channel you expect. If using arg channel, double-check project knowledge contains the token text and the instruction to pass it. If using header channel, check the host's MCP config. |
| Tool calls worked, then started 401-ing mid-session | Token expired (~24h cycle) | Ask user to re-run the helper and update the stored token. |
| `bearerToken` field shows up in user-visible tool error message | Skill or server bug — the field should be stripped | Surface as a bug. The server is supposed to remove the field before logging tool args. |
| Preview-publish returns 401 but list/get worked | Hit `admin.hlx.page` which is separate from `admin.da.live` | Same fix — token is shared between both APIs, expiry hits both at once. |
| 403 instead of 401 | Authenticated but lacks permissions | Re-confirm `owner` / `site` with user; verify their access to the repo. |
| Tool call says "succeeded" but `.aem.page` URL never updates | Probably ran `save_dalive_content` but skipped `preview_publish_dalive_content`. Not actually an auth problem. | See `references/validation-loop.md` and the universal rule "Validate after publish, not after save." |

## What you should never do

- **Don't paste the token into chat output.** It's sensitive, and most hosts log conversation context. The user already has it in project knowledge — they don't need you to echo it back.
- **Don't guess the token's structure or invent values for testing.** Bad JWTs return 401 just like expired ones; you'll think you've broken the bearer channel when you've actually only broken the token.
- **Don't retry past one or two 401s.** Each retry burns time and tokens. Surface the issue and wait for the user.
- **Don't suggest setting `DALIVE_BEARER_TOKEN` in any server-side environment variable as a workaround.** That re-opens the anonymous-fallback security hole the deployment was specifically designed to avoid.
