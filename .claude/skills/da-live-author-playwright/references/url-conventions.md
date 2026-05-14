# URL and path conventions

da.live has three URL surfaces that look similar but mean different things. Mixing them up is the #1 source of "the tool returned an error" or "preview never updated" problems.

## The three surfaces

| Surface | Pattern | What it's for |
|---|---|---|
| **Source path** | `/source/{owner}/{site}/{folder}/{slug}.html` | The "filesystem" path inside da.live — what `get_dalive_content`, `save_dalive_content`, `create_dalive_content` operate on. Always starts with `/source/`. The `.html` extension is part of the path. |
| **Edit URL** | `https://da.live/edit#/{owner}/{site}/{folder}/{slug}` | What a human types in their browser to open the page in da.live's editor. No `.html`. No `/source/` prefix. The path lives after the `#`. |
| **Preview URL** | `https://main--{site}--{owner}.aem.page/{folder}/{slug}` | Where the published page is served to the world. Note the double dashes and reversed-feeling order (`site--owner`, not `owner--site`). No `.html`. No `/source/`. |

The CMS-side path (`/source/...`) is canonical; the other two are projections.

## Cheat sheet for the DA.live MCP tools

| Tool | Path argument shape | Notes |
|---|---|---|
| `list_dalive_content` | `/source/{owner}/{site}/{folder}` | Folder path; lists immediate children. |
| `get_dalive_content` | `/source/{owner}/{site}/{folder}/{slug}.html` | Include the `.html`. |
| `create_dalive_content` | `/source/{owner}/{site}/{folder}/{slug}.html` + HTML body | Include the `.html`. Folder must exist (use `create_folder_dalive` first if needed). |
| `save_dalive_content` | `/source/{owner}/{site}/{folder}/{slug}.html` + HTML body | Same shape as create; this is the update form. |
| `create_folder_dalive` | `/source/{owner}/{site}/{folder}` | No trailing slash. |
| `preview_publish_dalive_content` | `/source/{owner}/{site}/{folder}/{slug}` (no `.html`) | ⚠️ **Different from the others** — drop the `.html`, but keep the full `/source/{owner}/{site}/` prefix. |

## The preview-publish gotcha

This is the single most common error. The published preview URL is `https://main--{site}--{owner}.aem.page/{folder}/{slug}` — short, no `/source/` prefix. People assume `preview_publish_dalive_content` wants that short form. **It doesn't.**

```
✅ preview_publish_dalive_content("/source/jackzhaojin/da-live-postal-2025-07/migration-batch-12-20/iot-temperature-controlled-delivery")
❌ preview_publish_dalive_content("/migration-batch-12-20/iot-temperature-controlled-delivery")
❌ preview_publish_dalive_content("/source/jackzhaojin/da-live-postal-2025-07/migration-batch-12-20/iot-temperature-controlled-delivery.html")
```

The function takes the **full source path without the trailing `.html`**. If you pass anything else, you'll either get an error or — worse — a silent no-op where the `.aem.page` URL never updates.

## Building URLs from owner / site / path

If you have `owner = "jackzhaojin"`, `site = "da-live-postal-2025-07"`, `folder = "migration-batch-2026-05"`, `slug = "annual-report"`:

```
Source path:  /source/jackzhaojin/da-live-postal-2025-07/migration-batch-2026-05/annual-report.html
Edit URL:     https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/migration-batch-2026-05/annual-report
Preview URL:  https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2026-05/annual-report
Publish arg:  /source/jackzhaojin/da-live-postal-2025-07/migration-batch-2026-05/annual-report
```

Notice in the preview URL: it's `main--{site}--{owner}`, not `main--{owner}--{site}`. Easy to flip.

## Special pages

| Page | Source path | Preview URL |
|---|---|---|
| Site root / home | `/source/{owner}/{site}/index.html` | `https://main--{site}--{owner}.aem.page/` |
| Block library index | `/source/{owner}/{site}/block-library/index.html` | `https://main--{site}--{owner}.aem.page/block-library/` |
| Agent memory page | `/source/{owner}/{site}/agent-memory.html` | (don't preview-publish — see `memory-page.md`) |

For folder index pages (any `index.html` inside a folder), the preview URL ends at the folder name without `/index` — e.g., `block-library/index.html` previews at `/block-library/`, not `/block-library/index`.

## When in doubt

Build the source path first (`/source/{owner}/{site}/...`). Derive the preview URL from it. Use the source path for every MCP call except `preview_publish_dalive_content`, where you strip the `.html` extension only. That mental model handles every case the skill encounters.
