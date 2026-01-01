# Azure DA.live MCP - Monorepo

Monorepo for AI-powered content authoring, migration, and editing tools built on da.live, Claude, and Model Context Protocol (MCP).

## Subprojects

### 1. `functions/` - Azure Functions MCP Server
**Status**: Production-ready
**Purpose**: HTTP MCP server for AI-assisted content editing on da.live

AI-powered content editing backend built with Azure Functions and Claude. Provides MCP tools (`get_dalive_content`, `save_dalive_content`) for autonomous content editing workflows.

**Quick Start**:
```bash
cd functions
npm install
nvm use 20
npm start
```

**Documentation**: [functions/CLAUDE.md](./functions/CLAUDE.md)

**Key Features**:
- MCP server endpoints (`/api/mcp`, `/api/mcp-streamable`)
- Claude Desktop integration via stdio bridge
- Multi-LLM support (Claude, Gemini, Azure OpenAI)
- Real API testing (no mocks)

---

### 2. `content-authoring-eval/` - CMS Migration Evaluator
**Status**: Production (Docker deployed to Oracle Cloud)
**Purpose**: AI-powered quality evaluation for CMS migrations

Next.js web app with 4 specialized AI agents (Structure, Accessibility, Content Fidelity, Visual) to evaluate webpage migrations. Combines deterministic analysis (Cheerio, axe-core, unpdf, Playwright) with agentic intelligence (Claude 4.5 SDK).

**Quick Start**:
```bash
cd content-authoring-eval
npm install
npm run dev   # http://localhost:3000
```

**Documentation**: [content-authoring-eval/README.md](./content-authoring-eval/README.md)

**Key Features**:
- 4 evaluation agents with tool access (Playwright MCP, Bash, Read/Write)
- Batch evaluation with progress tracking
- Docker deployment with GitHub Actions CI/CD
- Deterministic + agentic hybrid analysis

---

### 3. `agent-claude-sdk/` - Agent SDK Experiments
**Status**: Active development
**Purpose**: Learning and prototyping with Claude Agent SDK

Collection of TypeScript-based agents for testing patterns and exploring the Claude Agent SDK. Includes custom-built agents and third-party demos.

**Quick Start**:
```bash
cd agent-claude-sdk/chat-cli
npm install
cp .env.example .env
npm run dev
```

**Documentation**: [agent-claude-sdk/README.md](./agent-claude-sdk/README.md)

**Contains**:
- `chat-cli/` - Simple CLI chat interface with OAuth support
- `blog-pdf-generator/` - PDF generation from blog posts
- `cms-migration-evaluator/` - Earlier eval prototype
- `demos/` - Third-party agent examples

---

### 4. `make-dot-com/` - Make.com Agent Prompts
**Status**: Active versioning
**Purpose**: Versioned agent prompts for Make.com workflows

Progressive prompt files for EDS content migration agents deployed on Make.com. Not deployed via Git/Azure - prompts are copy-pasted into Make.com's agent configuration UI.

**Quick Start**:
```bash
cd make-dot-com/v1-content-migration
# Use agent-init-prompt-mvp.md for initial testing
```

**Documentation**: [make-dot-com/README.md](./make-dot-com/README.md)

**Prompt Files**:
- `agent-init-prompt-mvp.md` - Basic migration workflow
- `agent-init-prompt-mvp-memory.md` - MVP + learning from past runs
- `agent-init-prompt-mvp-blocklibrary.md` - MVP + standardized blocks
- `agent-init-prompt-full.md` - Production with all features

---

### 5. `bruno/` - API Testing Collections
**Status**: Active use
**Purpose**: Bruno HTTP client collections for API testing

HTTP request collections for testing da.live Admin API and Azure Functions endpoints. Alternative to Postman/Insomnia.

**Quick Start**:
```bash
cd bruno/local-functions
# Open in Bruno desktop app
```

**Documentation**: [bruno/README.md](./bruno/README.md)

**Collections**:
- `da-live-content/` - da.live Admin API endpoints
- `local-functions/` - Azure Functions MCP endpoints

---

## Repository Structure

```
azure-da-mcp/
├── functions/                 # Azure Functions MCP Server (Node 20)
├── content-authoring-eval/    # Next.js evaluation app (Node 20, Docker)
├── agent-claude-sdk/          # Agent SDK experiments (TypeScript)
├── make-dot-com/              # Make.com agent prompts (Markdown)
├── bruno/                     # API testing collections (Bruno)
├── specs/                     # Feature specs and planning docs
├── ai-docs/                   # Implementation insights and learnings
├── RELEASES.md                # Release strategy and versioning guide
└── README.md                  # This file
```

## Releases & Versioning

This monorepo uses **lockstep versioning** with a shared SemVer version across all projects:

- **Current Version**: `v1.0.0`
- **Active Release Branch**: `release/1.0`
- **Versioning Strategy**: Lockstep (single version for entire repo)
- **Deployment**: Automated via GitHub Actions on version changes

**Release workflow**:
1. Create release branch: `release/<MAJOR>.<MINOR>`
2. Stabilize with bug fixes only
3. Bump version in `package.json` files
4. Tag release: `v<MAJOR>.<MINOR>.<PATCH>`
5. Automated deployment triggers on tag push

For complete release procedures, branching model, and hotfix workflows, see **[RELEASES.md](./RELEASES.md)**.

## Common Dependencies

- **Node.js**: 20.x LTS (functions, content-authoring-eval)
- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk` (content-authoring-eval, agent-claude-sdk)
- **Anthropic SDK**: `@anthropic-ai/sdk` (functions)
- **MCP SDK**: `@modelcontextprotocol/sdk` (functions)
- **Docker**: For production deployment (content-authoring-eval)

## Authentication

All projects support Claude API authentication via:
1. **OAuth Token** (Claude Pro/Max subscribers)
   ```bash
   npm install -g @anthropic-ai/claude-cli
   claude setup-token
   ```
2. **API Key** (Developers)
   - Get from [console.anthropic.com](https://console.anthropic.com/)
   - Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-api03-...`

## Development Workflows

### Azure Functions Development
```bash
cd functions
nvm use 20
npm start
# Server: http://localhost:7071
```

### Content Authoring Eval Development
```bash
cd content-authoring-eval
npm run dev
# Server: http://localhost:3000
```

### Agent SDK Prototyping
```bash
cd agent-claude-sdk/chat-cli
npm run dev
```

### Make.com Prompt Updates
```bash
cd make-dot-com/v1-content-migration
# Edit prompt files, copy to Make.com UI
```

### API Testing
```bash
cd bruno
# Open collections in Bruno desktop app
```

## Testing Philosophy

**Real tests only**: No mocks, no stubs. If it doesn't test actual behavior with real APIs, we don't do it.

- `functions/`: E2E tests with real Anthropic + da.live APIs
- `content-authoring-eval/`: Manual testing via web UI + curl
- `agent-claude-sdk/`: Ad-hoc testing per agent
- `make-dot-com/`: Manual testing in Make.com workflows

## Documentation Standards

Each subproject follows a consistent documentation pattern:

### README.md (User-facing)
- Quick start guide
- Installation instructions
- Usage examples
- Feature overview
- Links to detailed docs

### CLAUDE.md (AI context)
- Project-specific instructions for Claude Code
- Architecture decisions
- Common issues and solutions
- Development workflows
- Memory-optimized for AI consumption

## Related Resources

- [Claude Agent SDK Documentation](https://docs.anthropic.com/en/docs/agents)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [da.live Admin API](https://admin.da.live/)

## Contributing

This is a personal monorepo for AI content authoring experimentation. Each subproject is independent with its own dependencies and configuration.

## License

MIT

---

**Last Updated**: 2025-12-29
**Primary Tools**: Claude Code, Agent SDK, Azure Functions, Next.js, MCP
