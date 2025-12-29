# EDS Content Migration Agent Prompts

AI agent prompts for migrating PDFs/webpages to da.live EDS pages via Make.com workflows.

## What This Is

This directory contains **markdown prompt files** that are copy-pasted into Make.com's AI agent configuration UI. These are NOT code files - they're natural language instructions for AI agents.

## Quick Context

**Platform**: Make.com (workflow automation)
**Purpose**: Content migration from PDF/webpages to da.live EDS
**Deployment**: Manual copy-paste into Make.com UI
**Version Control**: Git (this repo)

## Prompt Files

All prompts follow a progressive feature rollout:

| File | Features | Use Case | Status |
|------|----------|----------|--------|
| `agent-init-prompt-mvp.md` | Basic workflow | Initial testing | Stable |
| `agent-init-prompt-mvp-memory.md` | MVP + learning | Quality improvement | Stable |
| `agent-init-prompt-mvp-blocklibrary.md` | MVP + standardized blocks | Consistency | Stable |
| `agent-init-prompt-full.md` | All features + refinement | Production | Production-ready |

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
- Avoids previous mistakes

### +BlockLibrary (Standardized Blocks)
- Uses predefined block patterns
- Ensures consistency across migrations
- Reduces agent decision-making
- Faster migration process

### Full (Production-Ready)
- All above features
- Multi-pass refinement loops
- Confidence scoring
- Quality validation
- Error handling

## Make.com Integration

### Workflow Structure
```
[HTTP: Download PDF] → [Upsert Context] → [AI Agent]
        ↓                   ↓                  ↓
    (if PDF)        Store in context    Run migration prompt
```

### Required Variables

When configuring in Make.com, set these variables:

| Variable | Example | Purpose |
|----------|---------|---------|
| `{{5.sourceType}}` | `pdf` or `webpage` | Content source type |
| `{{5.sourceLocation}}` | `https://example.com/doc.pdf` | Source URL |
| `{{5.folderPostfix}}` | `trial-run-3` | Run identifier |

### Agent Configuration

**In Make.com AI Agent module:**
1. Copy prompt content from markdown file
2. Paste into agent instructions
3. Enable required MCP tools:
   - Playwright (for webpage scraping)
   - DA Live (for content creation)
4. Set timeout: 300 seconds (5 minutes)
5. Upload PDF to context (if sourceType=pdf)

### Output Path Pattern

All prompts generate pages at:
```
/source/jackzhaojin/da-live-postal-2025-07/migration-batch-12-20-{folderPostfix}/page-name.html
```

## Development Workflow

### 1. Edit Prompt Locally
```bash
cd make-dot-com/v1-content-migration
# Edit prompt file in your editor
```

### 2. Test in Make.com
1. Open Make.com workflow
2. Copy updated prompt
3. Paste into AI Agent configuration
4. Run test migration
5. Validate output

### 3. Iterate Based on Results
- Check generated da.live pages
- Review agent logs in Make.com
- Update prompt to fix issues
- Commit changes to Git

### 4. Version Control
```bash
git add agent-init-prompt-*.md
git commit -m "feat: Improve block detection for image galleries"
git push
```

## Prompt Engineering Tips

### Structure Your Prompts

1. **Context**: What the agent is doing
2. **Variables**: Available inputs (sourceType, sourceLocation, etc.)
3. **Workflow**: Step-by-step instructions
4. **Output Format**: Expected result structure
5. **Validation**: Quality checks
6. **Error Handling**: What to do when things fail

### Best Practices

- Use clear, imperative language ("Analyze the source", not "You should analyze")
- Break complex tasks into numbered steps
- Provide examples of desired output
- Include validation criteria
- Reference available MCP tools explicitly
- Test with both PDFs and webpages

### Common Issues

**Agent doesn't use MCP tools**:
- Explicitly mention tool names in prompt
- Show example tool usage
- Make tool calling a required step

**Inconsistent output structure**:
- Provide JSON schema or template
- Show complete example output
- Use strict validation criteria

**Agent times out**:
- Reduce refinement loops
- Simplify analysis steps
- Use progressive prompts (MVP first)

## Testing Strategy

### Phase 1: MVP Testing
1. Start with `agent-init-prompt-mvp.md`
2. Test with simple PDFs (2-3 pages)
3. Test with simple webpages (single article)
4. Validate basic block structure

### Phase 2: Feature Testing
1. Add Memory system (`-mvp-memory.md`)
2. Test with 5+ migrations
3. Verify learning behavior
4. Check quality improvement

### Phase 3: Production Testing
1. Use Full prompt (`-full.md`)
2. Test with complex PDFs (10+ pages)
3. Test with complex webpages (multi-section)
4. Validate refinement loops
5. Check confidence scoring

## Debugging

### Make.com Agent Logs
- View in Make.com execution history
- Check agent's reasoning
- Identify tool call failures
- Review output validation

### Common Failures

**PDF not accessible**:
- Check sourceLocation URL
- Verify PDF is publicly accessible
- Test direct download in browser

**MCP tool errors**:
- Check Playwright connection
- Verify DA Live API token
- Review tool call parameters

**Output not created**:
- Check da.live path structure
- Verify org/project exists
- Review agent's final tool calls

## Documentation

- **`README.md`** - Root overview of prompt versioning (this directory)
- **`CLAUDE.md`** - This file (detailed context for AI)
- **`v1-content-migration/README.md`** - Usage guide for v1 prompts
- **`v1-content-migration/AGENT-LOG.md`** - Development history (Opus + Claude Code logs)

## Related Projects

- `functions/` - Azure Functions MCP server (infrastructure)
- `content-authoring-eval/` - Migration quality evaluation (validation)
- `bruno/` - API testing collections (da.live API exploration)

## Memory Management

**For Claude Code**: When working on these prompts:

1. Read the specific prompt file you're editing (in v1-content-migration/)
2. Reference v1-content-migration/AGENT-LOG.md for context on past decisions
3. Test changes in Make.com before committing
4. Don't load unrelated subprojects (functions/, content-authoring-eval/)
5. Focus on prompt engineering, not code implementation

## Next Steps

1. Test prompts with diverse content sources
2. Gather metrics on migration quality
3. Iterate on block detection algorithms
4. Build evaluation framework (see content-authoring-eval/)
5. Document learnings in v1-content-migration/AGENT-LOG.md

---

**Last Updated**: 2025-12-29
**Platform**: Make.com
**Deployment**: Manual (copy-paste)
**Version Control**: Git
