---
applyTo: "make-dot-com/**"
---

# Make.com Agent Prompts Instructions

## Overview

This directory contains **markdown prompt files** that are copy-pasted into Make.com's AI agent configuration UI.

**Platform**: Make.com (workflow automation)
**Purpose**: Content migration from PDF/webpages to da.live EDS
**Deployment**: Manual copy-paste (NOT Git/Azure deployment)

## Important

**These are NOT code files** - they're natural language instructions for AI agents running on Make.com.

## Prompt Files

Progressive feature rollout:

| File | Features | Use Case |
|------|----------|----------|
| `agent-init-prompt-mvp.md` | Basic workflow | Initial testing |
| `agent-init-prompt-mvp-memory.md` | MVP + learning | Quality improvement |
| `agent-init-prompt-mvp-blocklibrary.md` | MVP + standardized blocks | Consistency |
| `agent-init-prompt-full.md` | All features + refinement | Production |

## Feature Breakdown

### MVP (Basic Workflow)
- Source analysis (PDF or webpage)
- Sample page generation
- Block-based content authoring
- Basic validation

### +Memory (Learning System)
- Learns from past migration runs
- Improves quality over time
- References successful patterns

### +BlockLibrary (Standardized Blocks)
- Uses predefined block patterns
- Ensures consistency across migrations

### Full (Production-Ready)
- All above features
- Multi-pass refinement loops
- Confidence scoring
- Quality validation

## Make.com Integration

**Workflow Structure:**
```
[HTTP: Download PDF] → [Upsert Context] → [AI Agent]
```

**Required Variables in Make.com:**
| Variable | Example | Purpose |
|----------|---------|---------|
| `{{5.sourceType}}` | `pdf` or `webpage` | Content source type |
| `{{5.sourceLocation}}` | `https://example.com/doc.pdf` | Source URL |
| `{{5.folderPostfix}}` | `trial-run-3` | Run identifier |

**Agent Configuration in Make.com:**
1. Copy prompt content from markdown file
2. Paste into agent instructions
3. Enable MCP tools: Playwright, DA Live
4. Set timeout: 300 seconds (5 minutes)
5. Upload PDF to context (if sourceType=pdf)

## Development Workflow

**1. Edit Prompt Locally:**
```bash
cd make-dot-com/v1-content-migration
# Edit prompt file in your editor
```

**2. Test in Make.com:**
1. Open Make.com workflow
2. Paste updated prompt
3. Run test scenario
4. Review output

**3. Version Control:**
- Commit changes to Git
- Copy to Make.com UI (deployment is manual)

## Output Path Pattern

All prompts generate pages at:
```
/source/jackzhaojin/da-live-postal-2025-07/migration-batch-12-20-{folderPostfix}/page-name.html
```

## Code Suggestions

**When editing prompts:**
- ✅ Write clear, natural language instructions
- ✅ Use structured sections (## Sections)
- ✅ Include examples and edge cases
- ❌ Don't suggest TypeScript/JavaScript code
- ❌ Don't add code blocks unless demonstrating output format

**Prompt Structure Best Practices:**
```markdown
## Role
You are an expert content migration agent...

## Available Tools
- Playwright MCP (webpage scraping)
- DA Live MCP (content creation)

## Workflow
1. Analyze source...
2. Extract content...
3. Create da.live page...

## Output Format
- Save to: /source/{path}
- Use EDS blocks
```

## Files to Never Modify

- Make.com workflow configuration (not in this repo)
- Production prompts without testing in staging first
