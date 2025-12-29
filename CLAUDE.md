# Azure DA.live MCP - Monorepo

AI-powered content authoring, migration, and evaluation tools. This is a monorepo containing multiple independent projects related to da.live content management and AI-assisted workflows.

## Monorepo Structure

This repository contains 5 independent projects:

### 1. `functions/` - Azure Functions MCP Server
**Purpose**: Production MCP server for AI-assisted da.live content editing
**Tech**: Azure Functions v4, Node 20, Anthropic SDK, MCP SDK
**Status**: Production-ready
**Docs**: [functions/CLAUDE.md](./functions/CLAUDE.md)

**When to work here**:
- MCP server development (JSON-RPC 2.0)
- da.live API integration
- Claude API with MCP tools
- Azure Functions deployment

### 2. `content-authoring-eval/` - CMS Migration Evaluator
**Purpose**: AI-powered quality evaluation for webpage migrations
**Tech**: Next.js 14, Claude Agent SDK, Playwright MCP, Docker
**Status**: Production (Oracle Cloud VM)
**Docs**: [content-authoring-eval/CLAUDE.md](./content-authoring-eval/CLAUDE.md)

**When to work here**:
- Evaluation agent development (4 agents: Structure, Accessibility, Content, Visual)
- Deterministic analysis tools (Cheerio, axe-core, unpdf, Playwright)
- Agentic intelligence (Claude 4.5 with tool access)
- Batch evaluation features

### 3. `agent-claude-sdk/` - Agent SDK Experiments
**Purpose**: Learning and prototyping with Claude Agent SDK
**Tech**: TypeScript, Node.js, Claude Agent SDK
**Status**: Active experimentation
**Docs**: [agent-claude-sdk/CLAUDE.md](./agent-claude-sdk/CLAUDE.md)

**When to work here**:
- Agent SDK pattern exploration
- CLI chat agents
- PDF generation agents
- Third-party demo testing

### 4. `make-dot-com/` - Make.com Agent Prompts
**Purpose**: Versioned prompts for Make.com migration workflows
**Tech**: Markdown prompt files, Make.com platform
**Status**: Active versioning
**Docs**: [make-dot-com/CLAUDE.md](./make-dot-com/CLAUDE.md)

**When to work here**:
- Prompt engineering for content migration agents
- Make.com workflow configuration
- Progressive prompt versioning (MVP → MVP+Memory → MVP+BlockLibrary → Full)

**Important**: Prompts are NOT deployed via Git. They are copy-pasted into Make.com UI.

### 5. `bruno/` - API Testing Collections
**Purpose**: HTTP request collections for API testing
**Tech**: Bruno HTTP client
**Status**: Active use
**Docs**: [bruno/CLAUDE.md](./bruno/CLAUDE.md)

**When to work here**:
- Testing da.live Admin API
- Testing Azure Functions MCP endpoints
- API debugging and exploration

## Working in This Monorepo

### Important Instructions

1. **Each project is independent**: Separate dependencies, configs, and workflows
2. **Check which directory you're in**: Always `cd` to the right subproject first
3. **Use correct Node version**: `functions/` and `content-authoring-eval/` require Node 20
4. **Read subproject CLAUDE.md**: Each has specific context and instructions

### Common Workflows

**Azure Functions development**:
```bash
cd functions
nvm use 20
npm start
```

**Content authoring eval development**:
```bash
cd content-authoring-eval
npm run dev
```

**Agent SDK prototyping**:
```bash
cd agent-claude-sdk/chat-cli
npm run dev
```

**Make.com prompt updates**:
```bash
cd make-dot-com/v1-content-migration
# Edit prompt markdown files
# Copy to Make.com UI manually
```

**API testing**:
```bash
cd bruno
# Open collections in Bruno app
```

### Navigation Tips

When the user asks about:
- **"MCP server"** or **"Azure Functions"** → `functions/`
- **"evaluation"** or **"migration quality"** → `content-authoring-eval/`
- **"Agent SDK"** or **"experiments"** → `agent-claude-sdk/`
- **"Make.com"** or **"prompts"** → `make-dot-com/`
- **"API testing"** or **"Bruno"** → `bruno/`

### Files That Should NOT Be Committed

- `functions/.env` - Contains secrets (ANTHROPIC_API_KEY, DALIVE_BEARER_TOKEN)
- `content-authoring-eval/.env.local` - Contains CLAUDE_CODE_OAUTH_TOKEN
- `content-authoring-eval/.env.docker` - Contains production secrets
- `agent-claude-sdk/*/.env` - OAuth tokens and API keys
- `node_modules/` - Package dependencies (gitignored)
- `.DS_Store` - macOS metadata (gitignored)

## Architecture Patterns

### MCP Integration Patterns

**functions/** uses MCP SDK Server:
- JSON-RPC 2.0 over HTTP
- Session management with Bearer tokens
- Tool implementations in McpTools.js
- stdio-to-HTTP bridge for Claude Desktop

**content-authoring-eval/** uses Agent SDK with MCP tools:
- Playwright MCP for browser automation
- Bash, Read, Write tools for file operations
- `bypassPermissions` mode for autonomous tool use

### Testing Philosophy

**Real tests only**: No mocks, no stubs across all projects.

- `functions/`: E2E tests with real Anthropic + da.live APIs
- `content-authoring-eval/`: Manual testing via web UI + curl
- `agent-claude-sdk/`: Ad-hoc testing per agent
- `make-dot-com/`: Manual testing in Make.com workflows

### Authentication Patterns

All projects support:
1. **OAuth Token** (Claude Pro/Max)
   - Setup: `npm install -g @anthropic-ai/claude-cli && claude setup-token`
   - Stored in: `~/.config/@anthropic-ai/claude/oauth_token`
2. **API Key** (Developers)
   - Get from: https://console.anthropic.com/
   - Add to project `.env` files

## Common Issues

### Node Version Errors
**Symptom**: `Error: Incompatible Node.js version`
**Fix**: Use Node 20 for functions/ and content-authoring-eval/
```bash
nvm use 20
```

### Missing Dependencies
**Symptom**: `Cannot find module ...`
**Fix**: Install dependencies in the correct subproject
```bash
cd <subproject>
npm install
```

### Wrong Directory
**Symptom**: Commands don't work, files not found
**Fix**: Always `cd` to the subproject directory first

### Environment Variables Missing
**Symptom**: API errors, authentication failures
**Fix**: Copy `.env.example` to `.env` and add secrets
```bash
cp .env.example .env
# Edit .env with your keys
```

## Development Tips

1. **Use subproject documentation**: Each has detailed CLAUDE.md or README.md
2. **Check git status**: `git status` shows which subproject has changes
3. **Independent testing**: Test each subproject separately
4. **Shared resources**: `specs/` and `ai-docs/` contain cross-project docs

## Documentation Map

### Root Level (Monorepo Overview)
- `README.md` - User-facing monorepo overview (references child README.md files)
- `CLAUDE.md` - This file (AI context, references child CLAUDE.md files)

### functions/ (Azure Functions MCP Server)
- `functions/CLAUDE.md` - Complete developer guide for MCP server

### content-authoring-eval/ (Evaluation App)
- `content-authoring-eval/README.md` - User guide for eval app
- `content-authoring-eval/CLAUDE.md` - AI context for eval agents
- `content-authoring-eval/DEPLOYMENT.md` - Docker deployment guide

### agent-claude-sdk/ (Experiments)
- `agent-claude-sdk/README.md` - Overview of all agents
- `agent-claude-sdk/CLAUDE.md` - AI context for SDK experiments
- `agent-claude-sdk/*/README.md` - Per-agent documentation

### make-dot-com/ (Prompts)
- `make-dot-com/README.md` - Root overview of prompt versioning
- `make-dot-com/CLAUDE.md` - AI context for prompt engineering
- `make-dot-com/v1-content-migration/README.md` - Prompt usage guide
- `make-dot-com/v1-content-migration/AGENT-LOG.md` - Development history

### bruno/ (API Testing)
- `bruno/README.md` - Bruno collections guide
- `bruno/CLAUDE.md` - AI context for API testing

## Memory Management

**For Claude Code**: This monorepo contains multiple independent projects. When working on a task:

1. Identify which subproject the task belongs to
2. Read that subproject's CLAUDE.md for specific context
3. Work within that subproject directory
4. Don't load unnecessary context from other subprojects
5. Use TodoWrite to track tasks within a subproject

**Context prioritization**:
- High: Subproject-specific CLAUDE.md
- Medium: Subproject README.md, source files
- Low: Other subprojects' documentation
- Minimal: Specs and ai-docs (reference only)

## Related Documentation

- `specs/` - Feature specifications and planning docs (historical)
- `ai-docs/` - Implementation learnings and reality checks (historical)

---

**Last Updated**: 2025-12-29
**Primary Maintainer**: jackjin
**Repository**: Personal monorepo for AI content authoring tools
