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

## Context Usage Analysis

Understanding token consumption for the full prompt with all context loaded.

### Component Breakdown

| Component | Characters | Tokens (est.) |
|-----------|------------|---------------|
| **Prompt file** (`agent-init-prompt-full.md`) | ~16K | ~4K |
| **1 HTML page** (typical migrated page) | ~6K | ~1.5K |
| **8 HTML pages** | ~48K | ~12K |
| **Block library index** | ~2-4K | ~0.5-1K |
| **Memory page** (10-20 entries) | ~5-10K | ~1.5-2.5K |

### Full Load Scenarios

| Scenario | Characters | Tokens (est.) |
|----------|------------|---------------|
| Prompt only | ~16K | ~4K |
| Prompt + block library + memory | ~25-30K | ~6-8K |
| **Full load (prompt + library + memory + 8 pages)** | **~75-80K** | **~18-20K** |

### Model Compatibility

| Model | Max Tokens | Full Load Usage |
|-------|------------|-----------------|
| Claude 3.5 Sonnet | 200K | ~10% |
| Claude 3 Opus | 200K | ~10% |
| GPT-4 Turbo | 128K | ~15% |

### Key Takeaways

- **8 pages is very manageable** - only ~20K tokens out of 200K available
- **The prompt itself is the largest component** at ~16K characters (~4K tokens)
- **50+ pages could fit** before hitting context limits
- Larger pages (10-15K each) would still allow 10-15 pages comfortably

## Documentation

- **`AGENT-LOG.md`** - Complete development history (Opus + Claude Code sessions)
- **`README.md`** - This quick reference

---

**Need Help?** Check AGENT-LOG.md for detailed development history and troubleshooting.
