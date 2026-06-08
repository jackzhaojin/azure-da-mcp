# Agent SDK reference POCs (reference-only)

Copied verbatim (2026-06-02) from `continuous-agent/references/poc/claude/` as working
references for the Conversion Factory Phase 1 agentic layer. **Reference material — not
wired into this repo's runtime.** The real entry point lands at the marked seam in
`agent-runtime/sdk-entry.js` per the Phase 1 plan.

All three authenticate the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) with an
**OAuth token in `CLAUDE_CODE_OAUTH_TOKEN`** (run `claude setup-token`), not an API key —
this is how Jack runs the Agent SDK.

| Folder | What it demonstrates | Maps to plan role | Verified |
|---|---|---|---|
| `chat-cli/` | Minimal OAuth `query({ prompt, options })` over the message stream | baseline SDK call | ✅ returns a result |
| `agent-sdk-skills-poc/` | Loading `.claude/skills/*/SKILL.md` via `settingSources` + `allowedTools` | skills-first core | ✅ lists bundled `poc-test-skill`, `project-analyzer` |
| `agent-sdk-subagents-poc/` | Subagent dispatch from `.claude/agents/` via the Task tool | Coordinator → spokes | ✅ loads `task-researcher`, `code-validator` |

### Credentials

The OAuth token lives in **one** gitignored file, `agent-runtime/.env` (template:
`agent-runtime/.env.example`). Both are listed in `agent-runtime/.gitignore`, so no secret
is ever committed. The POCs use `dotenv` (which only reads a POC-local `.env`), so load the
shared file into the environment before running:

```bash
cd agent-runtime/reference/<poc>
npm install
set -a; . ../../.env; set +a          # loads CLAUDE_CODE_OAUTH_TOKEN (no secret printed)
npm run dev                            # interactive readline chat
```

Note: `chat-cli`'s default model (`claude-opus-4-5`) is stale — override with
`export MODEL=claude-haiku-4-5-20251001` (or any current model) before `npm run dev`.

This whole tree is excluded from the served site via the `agent-runtime` entry in the root
`.hlxignore`, but the source **is** tracked in git (only `.env*`, `node_modules/`, `dist/`
are ignored).
