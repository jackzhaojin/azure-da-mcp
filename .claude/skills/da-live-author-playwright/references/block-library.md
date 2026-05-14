# Block library discovery

Each da.live site has its own block library — a set of pages that demonstrate every block the renderer is configured to handle, with the exact HTML each block expects. Treat it as the **source of truth** for block structure on that site. Two sites may have different blocks, or the same-named block with different column counts.

## Where it lives

| Surface | Path |
|---|---|
| da.live source (what you fetch via MCP) | `/source/{owner}/{site}/block-library/index.html` |
| Rendered preview | `https://main--{site}--{owner}.aem.page/block-library/` |
| Edit UI (for humans) | `https://da.live/edit#/{owner}/{site}/block-library/index` |

The index page links to per-block example pages, also under `/source/{owner}/{site}/block-library/...`.

## How to use it

### Step 1 — fetch the index

```
get_dalive_content("/source/{owner}/{site}/block-library/index.html")
```

If it 404s, ask the user how to proceed:

- They might point you at a different index path.
- They might say "this site has no library, just use the sample page as reference" — in which case rely on `sample-page.html` patterns and ask for an existing-page URL to mimic.
- They might want you to *create* a library — that's a separate task, not this skill's job.

### Step 2 — extract the list of blocks

The index is usually a simple list of links:

```html
<body>
<main>
  <h1>Block Library</h1>
  <ul>
    <li><a href="/block-library/hero">Hero Block</a></li>
    <li><a href="/block-library/columns">Columns Block</a></li>
    <li><a href="/block-library/cards">Cards Block</a></li>
    <li><a href="/block-library/cta">Call To Action</a></li>
  </ul>
</main>
</body>
```

Parse out:
- The block's **class name** (from the link slug — `/block-library/hero` → class `hero`).
- The block's **display name** (the link text — useful for talking to the user, not for the HTML).

Build a quick mental table of `class → meaning` to use during block mapping.

### Step 3 — fetch specific block pages as needed

Don't fetch every block page eagerly — that wastes context. Fetch a block's example page when you actually plan to use it:

```
get_dalive_content("/source/{owner}/{site}/block-library/hero.html")
```

Read the resulting HTML to learn the block's **shape contract**: how many rows, how many columns per row, what kind of content goes in each cell. Mimic that shape exactly when you emit the block.

For complex pages, fetching 2–3 blocks is plenty. For simple pages (just hero + a few paragraphs), the index alone is often enough.

### Step 4 — record gaps

When the source has content for which no library block fits, note it as a **gap** rather than inventing a new block class. Example: source has a "pricing toggle" widget but the library has no `pricing` block. Options:

- Render it as default content (lossy but safe).
- Approximate with the closest block (e.g., `columns` with rows of plan name + price + features).
- Flag it for human follow-up.

Whichever you pick, document it in the final report's "Gaps" section so a human knows what was lost.

## Pitfalls

- **Slug ≠ class name guaranteed.** Usually the URL slug matches the block's CSS class, but verify by reading the example page. If the example shows `<div class="hero-banner">` while the URL was `/hero`, use `hero-banner` in your HTML.
- **Block variants via additional classes.** Some blocks support modifiers: `<div class="hero dark">`, `<div class="columns reverse">`. The library example will demonstrate these — copy them, don't invent.
- **Library drift.** The library is just another set of pages — it can be outdated relative to the codebase. If a block from the library renders wrong even when you copy it exactly, that's a bug in the library, not in your output. Flag it.

## Why this matters

A block-based EDS site is essentially a small DSL of HTML "components" that the renderer hydrates. The library is the DSL's documentation. Bypassing the library and writing HTML from intuition is like writing JSX without knowing which props a component accepts — it'll sometimes work and sometimes silently render the wrong thing. Reading the library is cheap; debugging a wrong block in production is not.
