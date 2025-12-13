# Claude Agent SDK Examples

A collection of TypeScript-based agents built with the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents), demonstrating various use cases and integration patterns.

## Overview

This repository contains custom-built agents and third-party demo agents for testing and learning. All agents are implemented in TypeScript and support both OAuth token and API key authentication.

## Directory Structure

```
agent-claude-sdk/
├── chat-cli/           # Simple CLI chat interface
├── demos/              # Third-party demo agents for local testing
└── README.md          # This file
```

## Agents

### Custom Agents

#### chat-cli
A simple command-line chat interface demonstrating the Claude Agent SDK with OAuth token authentication.

**Features:**
- Interactive CLI chat with Claude
- OAuth token support (Claude Pro/Max)
- API key authentication fallback
- Streaming responses
- TypeScript implementation

**Use case:** Basic conversational AI, testing OAuth authentication, learning the Agent SDK fundamentals.

[View README](./chat-cli/README.md)

### Demo Agents

The `demos/` directory contains third-party agent examples cloned from GitHub for local testing and experimentation.

**Setup:**
- The directory uses a gitignore pattern: everything in `demos/` is ignored except the directory itself
- Demo repos are checked out initially with the naming convention `org--repo` for clarity
- Each demo is a standalone Git repository

**Currently available:**
- `anthropics--claude-quickstarts/` - Official Claude quickstart examples from Anthropic
- `anthropics--claude-agent-sdk-demos/` - Official Agent SDK demo implementations

**To add more examples:**
```bash
cd demos
git clone https://github.com/org/repo.git org--repo
```

**Python demos:** Some demos require Python execution. Use `python3.12` directly (already in PATH):
```bash
python3.12 script.py  # Not python3 (which points to system Python 3.9.6)
```

## Getting Started

### Prerequisites
- Node.js 18 or higher
- Claude Pro/Max subscription (for OAuth) OR Anthropic API key

### Quick Start

Each agent has its own setup instructions. Navigate to the agent directory and follow its README:

```bash
# Example: Run the chat-cli agent
cd chat-cli
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### Authentication Options

All agents support two authentication methods:

1. **OAuth Token** (Claude Pro/Max subscribers)
   ```bash
   npm install -g @anthropic-ai/claude-cli
   claude setup-token
   ```

2. **API Key** (Developers)
   - Get your key from [console.anthropic.com](https://console.anthropic.com/)
   - Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-api03-...`

## Project Goals

1. **Learn by Building** - Hands-on experience with the Claude Agent SDK
2. **Test Patterns** - Experiment with different agent architectures
3. **Evaluate Demos** - Try third-party examples and understand their approaches
4. **Build Reusable Components** - Create utilities and patterns that work across agents

## Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js 18+
- **SDK:** [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **Authentication:** OAuth tokens or API keys

## Learn More

- [Claude Agent SDK Documentation](https://docs.anthropic.com/en/docs/agents)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Claude Agent SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)
- [Claude Quickstarts](https://github.com/anthropics/claude-quickstarts/)

## Contributing

This is a personal learning and experimentation repository. Each agent is self-contained with its own dependencies and configuration.

## License

MIT
