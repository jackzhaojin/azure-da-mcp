# Operation: create a single da.live page from a source

The end-to-end "I have a PDF / URL / file and I want it as a da.live page" flow. Most migration-shaped requests land here.

## Inputs you should have from the confirmation gate

- `owner`, `site`
- Block library index URL (verified to exist if possible)
- Memory page URL (optional)
- Sample/reference page URL (optional)
- Target folder (e.g. `migration-batch-2026-05-trial-run-1`)
- Source location (attachment / URL / local path)
- Page slug (proposed by you, confirmed by user)

If any of the above is missing, stop and ask. Don't proceed on assumptions.

## Phase 1 — Context loading

In this order:

1. **Memory page** (if user opted in) — see `references/memory-page.md`. Read it; note any rules relevant to this source type or operation.
2. **Block library** — see `references/block-library.md`. Fetch the index, parse the list of available blocks.
3. **Sample/reference page** (optional) — if the library is sparse, fetch the sample page and study its block usage as a "what a clean page looks like on this site" anchor.
4. **Source content** — see `references/source-ingestion.md`. Read or navigate to the source; capture headings, body, lists, images, links, tables, CTAs, metadata (title, description, author/date).

## Phase 2 — Plan the block mapping

Before writing any HTML, sketch the source → block mapping. Out loud (in chat) is fine — it lets the user redirect if your mapping is off.

Shape:

```
Source section → da.live block → confidence
-----------------------------------------------
Top hero image + title → hero → 95%
Body paragraphs → default content → 100%
Three-up product highlights → cards → 80%
"Get a demo" CTA → cta → 90%
Pricing comparison widget → ??? (no library match) → flag as gap
```

For each block you plan to use, **fetch the block's example page from the library** (see `references/block-library.md`) so you copy its shape exactly. You can fetch them in parallel.

## Phase 3 — Generate the HTML

Using `references/eds-html-structure.md` and the block examples you just studied, generate the complete page HTML. Follow the rules in that reference:

- Block as `<div class="...">` with row/column nested `<div>`s.
- Default content is bare semantic HTML.
- Images wrapped in `<picture>`.
- Always include a `metadata` block at the end.
- No invented class names, no inline styles, no `<section>`.

Preserve source content verbatim — see the fidelity rules in `references/source-ingestion.md`.

If `examples/sample-page.html` (sibling to the operations/ folder) helps anchor the shape, open it.

## Phase 4 — Create + preview-publish

```
create_dalive_content("/source/{owner}/{site}/{target_folder}/{page_slug}.html", html)
```

If the target folder doesn't exist, create it first:

```
create_folder_dalive("/source/{owner}/{site}/{target_folder}")
```

Then preview-publish — **with the full source path, no `.html`** (see `references/url-conventions.md`, this is the #1 mistake):

```
preview_publish_dalive_content("/source/{owner}/{site}/{target_folder}/{page_slug}")
```

Wait for the publish call to return success before validation.

## Phase 5 — Validate + refine

Follow `references/validation-loop.md`. Briefly:

1. `browser_navigate("https://main--{site}--{owner}.aem.page/{target_folder}/{page_slug}")`
2. `browser_snapshot()` — verify content is present and blocks rendered correctly.
3. Optional `browser_take_screenshot()` for visual confidence.
4. PASS → go to Phase 6.
5. REFINE → fix the specific issue (re-fetch via `get_dalive_content`, edit, `save_dalive_content`, re-`preview_publish_dalive_content`), then re-validate. Max 3 loops total.
6. FAIL → exit to Phase 6 with the failure mode documented.

## Phase 6 — Report + (optional) memory

Use the final report shape from SKILL.md. Score honestly via the rubric in `references/validation-loop.md`. List gaps.

If a memory page is enabled and you learned something generalizable, append an entry per `references/memory-page.md` (save, don't preview-publish the memory page).

## Common pitfalls

- **Trying to publish before saving.** `preview_publish_dalive_content` publishes whatever was last saved; if you haven't saved your latest HTML yet, the preview will be stale.
- **Skipping the block library "to save time".** Without library context, your block class names and structures are guesses. Cheaper to fetch 2–3 block pages than to refine 3 times.
- **Filling in image data you don't have.** If the source has images but you don't have the actual `/media/...` URL, leave a placeholder and flag it as a gap. Don't invent a URL.
- **Editorial rewriting.** This skill is structural. Verbatim content; structural changes only. See fidelity rules in `references/source-ingestion.md`.
