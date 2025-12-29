---
applyTo: "agent-claude-sdk/**"
---

# Agent SDK Experiments Instructions

## Overview

This is a **collection of TypeScript agents** for learning and prototyping with the Claude Agent SDK.

**Tech Stack**: TypeScript, Node.js 18+, Claude Agent SDK
**Purpose**: Learning, experimentation, pattern exploration

## Directory Structure

```
agent-claude-sdk/
├── chat-cli/                  # Simple CLI chat agent
├── blog-pdf-generator/        # PDF generation from blog posts
├── cms-migration-evaluator/   # Earlier migration eval prototype
└── demos/                     # Third-party agent examples (gitignored)
```

## Agents

### chat-cli/
**Purpose**: Basic conversational agent with OAuth support
**Entry**: `src/index.ts`

```bash
cd chat-cli
npm install
cp .env.example .env
npm run dev
```

### blog-pdf-generator/
**Purpose**: Generate PDFs from blog posts
**Status**: Experimental

### demos/
**Purpose**: Third-party agent examples for learning
**Note**: Directory exists but contents are gitignored

Clone demos:
```bash
cd demos
git clone https://github.com/anthropics/claude-quickstarts.git anthropics--claude-quickstarts
```

## Creating New Agents

```bash
# 1. Create directory
mkdir my-new-agent
cd my-new-agent

# 2. Initialize TypeScript project
npm init -y
npm install @anthropic-ai/claude-agent-sdk
npm install -D typescript @types/node tsx

# 3. Setup environment
cp ../chat-cli/.env.example .env

# 4. Create agent (src/index.ts)
```

**Basic Agent Pattern:**
```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';

const agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5-20250929',
});

const result = await agent.run('Your prompt here');
console.log(result);
```

## Authentication

**OAuth Token** (Recommended for Claude Pro/Max):
```bash
npm install -g @anthropic-ai/claude-cli
claude setup-token
# Token stored in ~/.config/@anthropic-ai/claude/oauth_token
```

**API Key**:
```bash
# In .env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Authentication Priority** (in code):
1. Check `CLAUDE_CODE_OAUTH_TOKEN` first
2. Fall back to `ANTHROPIC_API_KEY`

## TypeScript Configuration

**Target**: ES2022 with ES modules
**Type**: `"type": "module"` in package.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

## Development Commands

```bash
npm run dev      # Development mode (tsx)
npm run build    # Production build
npm start        # Run compiled output
```

## SDK Usage Patterns

**Query Function** (simpler):
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = await query({
    prompt: 'Hello, Claude!',
    model: 'claude-sonnet-4-5-20250929',
});
```

**Agent Class** (more control):
```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';

const agent = new Agent({
    model: 'claude-sonnet-4-5-20250929',
    tools: ['bash', 'read', 'write'],
    bypassPermissions: true,
});

const result = await agent.run(prompt);
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Auth error | Token format wrong | Must start with `sk-ant-` |
| Token expired | OAuth token old | Run `claude setup-token` |
| Module errors | Wrong type setting | Ensure `"type": "module"` in package.json |
| Node version | Too old | Use Node 18+ |

## Files to Never Modify

- `.env` files - Contain secrets
- `demos/` content - Third-party code (just clone fresh)
