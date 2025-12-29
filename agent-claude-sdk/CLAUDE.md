# Claude Agent SDK Experiments

Learning and prototyping with the Claude Agent SDK through hands-on agent development.

## What This Is

Collection of TypeScript-based agents built with the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents) for exploring patterns, testing integrations, and understanding autonomous AI agents.

## Quick Context

**Purpose**: Learning and experimentation
**Language**: TypeScript
**Runtime**: Node.js 18+
**SDK**: `@anthropic-ai/claude-agent-sdk`
**Auth**: OAuth tokens OR API keys

## Directory Structure

```
agent-claude-sdk/
├── chat-cli/                  # Simple CLI chat agent
├── blog-pdf-generator/        # PDF generation from blog posts
├── cms-migration-evaluator/   # Earlier migration eval prototype
├── demos/                     # Third-party agent examples (gitignored)
│   ├── anthropics--claude-quickstarts/
│   └── anthropics--claude-agent-sdk-demos/
└── README.md                  # Overview and quick start
```

## Agents

### Custom-Built Agents

#### 1. chat-cli/
**Purpose**: Basic conversational agent with OAuth support
**Features**: Interactive CLI, streaming responses, token management
**Use Case**: Learning SDK fundamentals, testing authentication

**Quick Start**:
```bash
cd chat-cli
npm install
cp .env.example .env
# Add CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY
npm run dev
```

**Key Learnings**:
- OAuth token setup with `claude setup-token`
- Agent SDK session management
- Streaming vs. non-streaming responses
- TypeScript type safety with Agent SDK

#### 2. blog-pdf-generator/
**Purpose**: Generate PDFs from blog posts
**Features**: Web scraping, content extraction, PDF generation
**Use Case**: Document automation, content archiving

**Status**: Experimental

#### 3. cms-migration-evaluator/
**Purpose**: Earlier prototype of migration quality evaluation
**Status**: Superseded by `content-authoring-eval/` (Next.js app)
**Note**: Kept for reference and pattern exploration

### Third-Party Demos

Located in `demos/` (gitignored except directory):

#### anthropics--claude-quickstarts/
Official quickstart examples from Anthropic
**Source**: https://github.com/anthropics/claude-quickstarts

#### anthropics--claude-agent-sdk-demos/
Official Agent SDK demo implementations
**Source**: https://github.com/anthropics/claude-agent-sdk-demos

**Setup**:
```bash
cd demos
git clone https://github.com/anthropics/claude-quickstarts.git anthropics--claude-quickstarts
git clone https://github.com/anthropics/claude-agent-sdk-demos.git anthropics--claude-agent-sdk-demos
```

**Naming Convention**: `org--repo` for clarity

## Development Workflow

### Creating a New Agent

1. **Create directory**:
   ```bash
   mkdir my-new-agent
   cd my-new-agent
   ```

2. **Initialize TypeScript project**:
   ```bash
   npm init -y
   npm install @anthropic-ai/claude-agent-sdk
   npm install -D typescript @types/node tsx
   ```

3. **Setup environment**:
   ```bash
   cp ../chat-cli/.env.example .env
   # Add CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY
   ```

4. **Create agent entrypoint** (`src/index.ts`):
   ```typescript
   import { Agent } from '@anthropic-ai/claude-agent-sdk';

   const agent = new Agent({
     apiKey: process.env.ANTHROPIC_API_KEY,
     model: 'claude-sonnet-4-5-20250929',
   });

   // Your agent logic here
   ```

5. **Run and iterate**:
   ```bash
   npx tsx src/index.ts
   ```

### Testing Third-Party Demos

1. **Clone demo**:
   ```bash
   cd demos
   git clone https://github.com/org/repo.git org--repo
   ```

2. **Follow demo's README**:
   ```bash
   cd org--repo
   npm install
   # Configure as needed
   npm start
   ```

3. **Extract patterns**:
   - Study agent architecture
   - Test tool integrations
   - Document learnings in demo's directory

## Authentication

### Option 1: OAuth Token (Recommended for Learning)
**Prerequisites**: Claude Pro/Max subscription

**Setup**:
```bash
npm install -g @anthropic-ai/claude-cli
claude setup-token
```

**Location**: `~/.config/@anthropic-ai/claude/oauth_token`

**Usage**:
```typescript
import { getOAuthToken } from '@anthropic-ai/claude-agent-sdk';

const token = await getOAuthToken();
const agent = new Agent({ oauthToken: token });
```

### Option 2: API Key (For Production)
**Prerequisites**: Anthropic account

**Get Key**: https://console.anthropic.com/

**Usage**:
```typescript
const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## Common Patterns

### 1. Simple Agent (No Tools)
```typescript
const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
});

const response = await agent.sendMessage('Hello, Claude!');
console.log(response.text);
```

### 2. Agent with Tool Access
```typescript
const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
  tools: [
    {
      name: 'search',
      description: 'Search the web',
      parameters: { query: 'string' },
      handler: async (params) => {
        // Tool implementation
        return { results: [...] };
      },
    },
  ],
});
```

### 3. Streaming Responses
```typescript
for await (const chunk of agent.streamMessage('Write a story')) {
  process.stdout.write(chunk.text);
}
```

### 4. Multi-Turn Conversation
```typescript
const conversation = agent.startConversation();

await conversation.sendMessage('What is MCP?');
await conversation.sendMessage('How do I implement it?');

const history = conversation.getHistory();
```

## Integration with Other Subprojects

### content-authoring-eval/
**Relationship**: Uses Agent SDK for evaluation agents
**Pattern**: Tool access with `bypassPermissions` mode
**Learnings**: See `content-authoring-eval/src/lib/agents/*/agentic.ts`

### functions/
**Relationship**: Uses Anthropic SDK (not Agent SDK) with MCP
**Difference**:
- `functions/`: JSON-RPC MCP server for Claude Desktop
- `agent-claude-sdk/`: Direct Agent SDK usage for custom agents

**When to use which**:
- Agent SDK: Building autonomous agents with tool access
- Anthropic SDK + MCP: Building MCP servers for tool providers

## Python Demos

Some third-party demos use Python. Use `python3.12` (in PATH):

```bash
# NOT python3 (system Python 3.9.6)
python3.12 demo.py
```

**Location**: `/opt/homebrew/bin/python3.12`

## Common Issues

### OAuth Token Expired
**Symptom**: `401 Unauthorized`
**Fix**: Re-run `claude setup-token`

### Module Not Found
**Symptom**: `Cannot find module '@anthropic-ai/claude-agent-sdk'`
**Fix**: Run `npm install` in agent directory

### TypeScript Errors
**Symptom**: Type errors in `src/`
**Fix**: Check `tsconfig.json` and ensure types are installed

### Tool Execution Fails
**Symptom**: Agent tries to call tool but gets error
**Fix**: Verify tool handler implementation and parameter validation

## Learning Resources

### Official Documentation
- [Agent SDK Overview](https://docs.anthropic.com/en/docs/agents)
- [Agent SDK API Reference](https://docs.anthropic.com/en/docs/agents/api-reference)
- [Claude API Documentation](https://docs.anthropic.com/)

### Code Examples
- `chat-cli/` - Minimal working agent
- `demos/anthropics--claude-quickstarts/` - Official examples
- `content-authoring-eval/src/lib/agents/` - Production agent patterns

## Development Tips

### Quick Testing
1. Start with `chat-cli` to understand basics
2. Clone official demos for patterns
3. Build small prototypes (< 100 lines)
4. Graduate to full agents when pattern is clear

### Debugging
- Use `console.log` liberally
- Enable Agent SDK debug mode (if available)
- Test tools independently before integrating
- Use TypeScript for type safety

### Iteration Speed
- Use `tsx` for fast TypeScript execution (no compile step)
- Use nodemon for auto-restart on file changes
- Test with Haiku for fast iterations (cheap and fast)
- Use Sonnet for final validation

## Memory Management

**For Claude Code**: When working on agents:

1. Focus on one agent directory at a time
2. Read that agent's README or source files
3. Don't load unrelated agents
4. Don't load `functions/` or `content-authoring-eval/` unless comparing patterns
5. Use TodoWrite to track agent development tasks

**Context Priority**:
- High: Current agent's source files
- Medium: Agent SDK documentation (use WebFetch)
- Low: Other agents in this directory
- Minimal: Other subprojects

## Next Steps

1. Build more specialized agents (data analysis, code review)
2. Explore tool chaining patterns
3. Test multi-agent collaboration
4. Document patterns in individual agent READMEs
5. Contribute learnings back to demos

---

**Last Updated**: 2025-12-29
**SDK**: `@anthropic-ai/claude-agent-sdk`
**Purpose**: Learning and experimentation
**Status**: Active development
