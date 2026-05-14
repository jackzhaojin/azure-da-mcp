# Operation: bulk-create multiple da.live pages

Use this when the user wants to create several pages at once (e.g., a folder of PDFs, a list of webpage URLs, a Markdown manifest of pages to migrate). Internally it's the single-page flow run N times, but with shared setup and consistent reporting.

## Inputs you should have from the confirmation gate

- `owner`, `site`
- Block library index URL
- Memory page URL (optional)
- Target folder (one folder for the whole batch)
- A list of sources — each with: source location, page slug (proposed), optional per-page title override

If the user gave you a list of files in a directory or a list of URLs without slugs, propose slugs derived from the source content/filenames and confirm them all before starting. Slugs are part of the URL forever; mistakes are expensive.

## Pre-batch setup (run once)

Do these once before the loop, since they're the same for every page:

1. **Read memory** — `references/memory-page.md`. Note rules to apply across all pages in the batch.
2. **Fetch block library index** — `references/block-library.md`. Parse the available blocks.
3. **Fetch likely block examples** — for blocks you anticipate using on most pages (hero, columns, default content). Cache them in your working memory so you don't re-fetch per page.
4. **Create the target folder** — `create_folder_dalive("/source/{owner}/{site}/{target_folder}")`. Idempotent; safe to call even if it exists.

## Per-page loop

For each source in the list:

1. **Ingest the source** (`references/source-ingestion.md`).
2. **Plan block mapping** (briefly — leverage the block knowledge from setup).
3. **Generate HTML** (`references/eds-html-structure.md`).
4. **Create the page** — `create_dalive_content("/source/{owner}/{site}/{target_folder}/{slug}.html", html)`.
5. **Preview-publish** — `preview_publish_dalive_content("/source/{owner}/{site}/{target_folder}/{slug}")` (no `.html`).
6. **Validate** — `browser_navigate` + `browser_snapshot` per `references/validation-loop.md`. **Cap refinement at 1 iteration per page in bulk mode** (vs. 3 in single-page mode) — the goal is throughput. If a page can't be fixed in one refinement pass, mark it as needing human review and move on.
7. **Track results** — per-page: status (pass/partial/fail), confidence, gaps. Keep a running tally.

## Order considerations

- Process pages **sequentially**, not in parallel. Even if MCP tools could handle parallelism, each call updates da.live state and parallel writes can race. Sequential is safer and barely slower for typical batch sizes (5–20 pages).
- **Cache block-library knowledge** across pages — don't re-fetch the same block example for every page.

## When a page fails

A failure in one page should not stop the batch. Mark it, log the reason, and continue. The final report tells the user which pages need attention.

If many pages fail with the **same reason** (e.g., the block library lacks something they all need), pause and surface that pattern to the user rather than grinding through identical failures.

## Final report

For bulk operations, the report has a per-page breakdown plus a summary header. Example:

```
## Bulk operation: create pages from <N> sources

**Owner / Site:** {owner} / {site}
**Target folder:** /source/{owner}/{site}/{target_folder}
**Pages attempted:** N
**Pages succeeded:** X
**Pages partial:** Y
**Pages failed:** Z
**Average confidence:** XX%

### Per-page detail

| Slug | Status | Confidence | Notes |
|---|---|---|---|
| slug-one | ✅ | 92% | clean |
| slug-two | ⚠️ | 71% | image gap; placeholder used |
| slug-three | ❌ | 30% | source unreadable; manual migration needed |
| ... | ... | ... | ... |

### Cross-batch gaps

- <patterns you noticed across multiple pages, e.g. "All pages had a pricing widget unmappable to library blocks">

### Recommended follow-ups

- <list of slugs needing manual attention>
```

## Memory update for bulk runs

If you noticed a **pattern across multiple pages** (e.g., "this site's hero block consistently needed the `dark` modifier on dark-image pages"), that's exactly the kind of lesson worth saving to the memory page. Per-page idiosyncrasies usually aren't — they don't generalize.
