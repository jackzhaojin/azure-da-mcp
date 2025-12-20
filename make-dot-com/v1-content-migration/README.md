# EDS Content Migration Agent Prompts

Progressive agent prompt files for migrating content (PDFs/webpages) to da.live EDS pages via Make.com.

## Quick Start

**⭐ Start Here:** Use `agent-init-prompt-mvp.md` for initial testing

**Testing Path:**
```
MVP → MVP+Memory → MVP+BlockLibrary → Full (Production)
```

## Prompt Files

| File | Features | Use Case |
|------|----------|----------|
| **`agent-init-prompt-mvp.md`** | Basic migration workflow | Initial testing & debugging |
| **`agent-init-prompt-mvp-memory.md`** | MVP + learns from past runs | Improving quality over time |
| **`agent-init-prompt-mvp-blocklibrary.md`** | MVP + standardized blocks | Consistent block usage |
| **`agent-init-prompt-full.md`** 🚀 | All features + refinement | Production deployment |

## Feature Comparison

| Feature | MVP | +Memory | +Block Lib | Full |
|---------|:---:|:-------:|:----------:|:----:|
| Source analysis | ✅ | ✅ | ✅ | ✅ |
| Sample page | ✅ | ✅ | ❌ | ❌ |
| Block library | ❌ | ❌ | ✅ | ✅ |
| Memory system | ❌ | ✅ | ❌ | ✅ |
| Refinement loops | ❌ | ❌ | ❌ | ✅ |
| Confidence scoring | ❌ | ❌ | ❌ | ✅ |

## Make.com Setup

**Workflow:**
```
[HTTP: Download PDF] → [Upsert Context] → [AI Agent]
                        (if PDF)
```

**Variables:**
- `{{5.sourceType}}` - `pdf` or `webpage`
- `{{5.sourceLocation}}` - Source URL
- `{{5.folderPostfix}}` - Run identifier (e.g., `trial-run-3`)

**Configuration:**
- Copy prompt content to Make.com agent
- Enable Playwright + DA Live MCP tools
- Set timeout: 300 seconds
- Upload PDF to context (if sourceType=pdf)

## Output Path

```
/source/jackzhaojin/da-live-postal-2025-07/migration-batch-12-20-trial-run-3/page-name.html
```

## Documentation

- **`AGENT-LOG.md`** - Complete development history (Opus + Claude Code sessions)
- **`README.md`** - This quick reference

---

**Need Help?** Check AGENT-LOG.md for detailed development history and troubleshooting.
