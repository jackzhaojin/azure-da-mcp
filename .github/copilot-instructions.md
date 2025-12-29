# GitHub Copilot Instructions

## Repository Context

This is a **monorepo** containing 5 independent AI-powered content authoring and migration tools for da.live (Adobe EDS).

### What This Repository Contains

| Subproject | Purpose | Tech Stack | Status |
|------------|---------|------------|--------|
| `functions/` | Azure Functions MCP Server | Node 20, Azure Functions v4, MCP SDK | Production |
| `content-authoring-eval/` | CMS Migration Evaluator | Next.js 14, Claude Agent SDK, Docker | Production |
| `agent-claude-sdk/` | Agent SDK Experiments | TypeScript, Claude Agent SDK | Active |
| `make-dot-com/` | Make.com Agent Prompts | Markdown (copy-paste to Make.com) | Active |
| `bruno/` | API Testing Collections | Bruno HTTP client | Active |

### Key Architecture Principles

- **HTML-First**: Work directly with HTML (not JSON blocks)
- **Real Tests Only**: E2E tests with real APIs, no mocks or stubs
- **Independent Subprojects**: Each has separate dependencies, configs, and workflows
- **MCP-Native**: Let LLMs autonomously call tools

## Monorepo Structure

```
azure-da-mcp/
├── functions/                 # Azure Functions MCP Server (Node 20)
├── content-authoring-eval/    # Next.js evaluation app (Docker)
├── agent-claude-sdk/          # Agent SDK experiments (TypeScript)
├── make-dot-com/              # Make.com agent prompts (Markdown)
├── bruno/                     # API testing collections (Bruno)
├── specs/                     # Feature specs and planning docs
├── ai-docs/                   # Implementation insights and learnings
├── docker-compose.yml         # n8n workflow automation (optional)
└── README.md                  # Monorepo overview
```

## Subproject Navigation

**When user asks about:**
- "MCP server", "Azure Functions", "da.live API" → Work in `functions/`
- "evaluation", "migration quality", "agents" → Work in `content-authoring-eval/`
- "Agent SDK", "experiments", "prototyping" → Work in `agent-claude-sdk/`
- "Make.com", "prompts", "workflow" → Work in `make-dot-com/`
- "API testing", "Bruno", "HTTP requests" → Work in `bruno/`

**Always `cd` to the correct subproject directory first.**

## Common Development Commands

```bash
# Azure Functions development
cd functions && nvm use 20 && npm start

# Content Authoring Eval development
cd content-authoring-eval && npm run dev

# Agent SDK prototyping
cd agent-claude-sdk/chat-cli && npm run dev

# Make.com prompt updates (manual copy-paste to UI)
cd make-dot-com/v1-content-migration
```

## Testing Philosophy

**Real tests only across all subprojects:**
- `functions/`: E2E tests with real Anthropic + da.live APIs
- `content-authoring-eval/`: Manual testing via web UI + curl
- `agent-claude-sdk/`: Ad-hoc testing per agent
- `make-dot-com/`: Manual testing in Make.com workflows

## Authentication

All projects support Claude API authentication via:
1. **OAuth Token** (Claude Pro/Max): `claude setup-token`
2. **API Key** (Developers): `ANTHROPIC_API_KEY=sk-ant-api03-...`

## Files to Never Modify

- `functions/.env`, `content-authoring-eval/.env.local` - Contains secrets
- `host.json`, `package.json` - Already optimized
- `docker-compose.yml` - n8n configuration (separate from main projects)

---

**For subproject-specific guidance, see path-specific instructions in `.github/instructions/`**