# Make.com Agent Prompts

Versioned agent prompt files for content migration workflows deployed on Make.com.

## Overview

This directory contains markdown prompt files used in Make.com AI agent workflows. These prompts are NOT deployed via Git or CI/CD - they are manually copy-pasted into the Make.com agent configuration UI.

## Purpose

Version control for Make.com agent prompts that orchestrate:
- PDF/webpage content analysis
- EDS (Edge Delivery Services) page generation
- Content migration from legacy CMS to da.live
- AI-assisted block-based content authoring

## Structure

```
make-dot-com/
└── v1-content-migration/    # Content migration agent prompts
    ├── agent-init-prompt-mvp.md              # Basic migration workflow
    ├── agent-init-prompt-mvp-memory.md       # MVP + learning system
    ├── agent-init-prompt-mvp-blocklibrary.md # MVP + standardized blocks
    ├── agent-init-prompt-full.md             # Production with all features
    ├── AGENT-LOG.md                          # Development history
    └── README.md                             # Usage guide
```

## Workflow

### 1. Edit Prompts Locally
```bash
cd v1-content-migration
# Edit prompt markdown files in your editor
```

### 2. Copy to Make.com
1. Open Make.com workflow
2. Navigate to AI Agent module
3. Copy prompt content from markdown file
4. Paste into agent configuration
5. Save and test

### 3. Version Control
```bash
git add v1-content-migration/
git commit -m "feat: Update migration prompt with better block detection"
git push
```

## Projects

### v1-content-migration
Progressive prompt files for migrating PDFs/webpages to da.live EDS pages.

**Documentation**: [v1-content-migration/README.md](./v1-content-migration/README.md)

**Prompt Progression**:
- **MVP** → Basic migration workflow
- **MVP+Memory** → Learns from past migrations
- **MVP+BlockLibrary** → Uses standardized block patterns
- **Full** → Production-ready with refinement loops

## Why Not Deploy via Git?

Make.com workflows are configured through their web UI, not via API or Git integration. This directory serves as:
1. **Version control** - Track prompt changes over time
2. **Collaboration** - Share prompts with team members
3. **Rollback** - Revert to previous prompt versions
4. **Documentation** - Explain prompt evolution and learnings

## Usage Notes

### Testing Prompts
1. Start with MVP version for initial testing
2. Gradually enable features (Memory, BlockLibrary)
3. Deploy Full version for production

### Make.com Configuration
- **Timeout**: Set to 300 seconds (prompts can be long-running)
- **MCP Tools**: Enable Playwright + DA Live MCP tools
- **Variables**:
  - `sourceType` - `pdf` or `webpage`
  - `sourceLocation` - Source URL
  - `folderPostfix` - Run identifier

### Output Validation
All prompts generate da.live pages at:
```
/source/jackzhaojin/da-live-postal-2025-07/migration-batch-{date}-{run}/page-name.html
```

## Development History

See `v1-content-migration/AGENT-LOG.md` for complete development history, including:
- Opus + Claude Code conversation logs
- Prompt iteration notes
- Learnings and improvements

## Related Documentation

- [Make.com Documentation](https://www.make.com/en/help/apps/ai)
- [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents)
- [da.live Admin API](https://admin.da.live/)

---

**Last Updated**: 2025-12-29
**Platform**: Make.com
**Purpose**: Version control for agent prompts
