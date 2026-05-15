# EDS / da.live HTML structure

Load this before generating or modifying any da.live HTML. The rendering engine reads HTML with strict structural conventions — if you stray from them, your blocks render as raw `<div>`/`<table>` debris instead of styled components.

## The big idea: blocks are `<div>`s with class names

A da.live page is plain HTML inside a `<main>`. Within `<main>`, content is either:

- **Default content** — bare semantic HTML (`<h1>…<h6>`, `<p>`, `<ul>`, `<ol>`, `<a>`, `<picture>`) directly under `<main>` (or wrapped in a bare `<div>` with no class). This renders with site default typography.
- **Blocks** — a `<div class="block-name">` containing nested `<div>`s that define the block's rows and columns. The class name *is* the block selector. The renderer dispatches to the block's JS/CSS based on that class.

Anything outside `<main>` (in `<header>` or `<footer>`) is typically nav/footer chrome and rarely needs editing for a content authoring task.

## Block structure rules

Each block follows a row/column-by-div pattern. The renderer reads this as a table:

```html
<div class="hero">
  <!-- Row 1 -->
  <div>
    <!-- Col 1 of row 1 -->
    <div><picture><img src="/media/hero.jpg" alt="hero image"/></picture></div>
  </div>
  <!-- Row 2 -->
  <div>
    <!-- Col 1 of row 2 -->
    <div><h1>Page title</h1><p>Subtitle text</p></div>
  </div>
</div>
```

Key rules:

- The outermost `<div class="...">` names the block.
- Each direct child `<div>` is one **row**.
- Each child of a row `<div>` is one **column** (still a `<div>`).
- Block content goes inside those column `<div>`s as normal HTML.

Some blocks expect a fixed shape (e.g., `cards` often needs each row to be `[image, title, description]` — 3 columns). The *only* reliable way to know is to fetch the block's example page from the block library. See `block-library.md`.

## The metadata block — a `<table>`, not a `<div>` block

Most blocks in EDS / da.live are authored as block-divs (`<div class="block-name">…`), but **the metadata block is the exception** — it's a plain `<table>` whose first cell is the literal word `Metadata`. Both the canonical EDS docs ([aem.live/developer/block-collection/metadata](https://www.aem.live/developer/block-collection/metadata), [aem.live/docs/metadata](https://www.aem.live/docs/metadata)) and the observed behavior of da.live's save endpoint confirm this:

- The EDS publish pipeline scans for a `<table>` whose first cell is `Metadata`. That's what turns it into `<meta>` tags in `<head>`.
- The metadata block does **not** appear verbatim in `<body>` on the published page.
- A `<div class="metadata">` with **bare text in cells** is **not** recognized — the save endpoint strips the class and flattens the structure, and can even cascade-damage adjacent blocks. Burned us once; we now know.

### Canonical authoring form (what to write)

```html
<table>
  <tr><td>Metadata</td><td></td></tr>
  <tr><td>title</td><td>Customer Experience Digital Postal</td></tr>
  <tr><td>description</td><td>How postal services modernize CX with digital touchpoints.</td></tr>
  <tr><td>image</td><td><picture><img src="/media/og-image.jpg" alt="og image"/></picture></td></tr>
  <tr><td>keywords</td><td>postal, customer experience, digital</td></tr>
  <tr><td>author</td><td>Elena Kowalski</td></tr>
  <tr><td>publication-date</td><td>2026-01-09</td></tr>
</table>
```

Rules:

- Row 1 is the block-name header — literally `Metadata` (case-insensitive in practice; capitalized by convention).
- Each subsequent row is key/value. Column 1 is the meta key (`title`, `description`, `image`, `keywords`, `author`, `publication-date`, `og:type`, etc., lowercase). Column 2 is the value.
- Values are usually plain text; for `image` (and similar fields) the value is HTML — typically `<picture><img src="…" alt="…"/></picture>`.
- One metadata table per page. Placement doesn't matter to the pipeline, but **convention is to place it as the last element inside `<main>`**.

### Canonical storage form (what you'll see on a GET)

da.live normalizes the `<table>` you save into a `<div class="metadata">` block for storage. So a subsequent `get_dalive_content` on the same page returns this shape, *not* the table you sent:

```html
<div class="metadata">
  <div>
    <div><p>title</p></div>
    <div><p>Customer Experience Digital Postal</p></div>
  </div>
  <div>
    <div><p>description</p></div>
    <div><p>How postal services modernize CX…</p></div>
  </div>
  <div>
    <div><p>image</p></div>
    <div><picture><img src="…" alt="…"/></picture></div>
  </div>
  …
</div>
```

Each row is a 2-column `<div>…<div>…</div></div>`, and **each text cell wraps its content in `<p>`**. Those `<p>` wrappers are load-bearing: a `<div class="metadata">` with bare text inside cell divs is not a recognized block.

### Two-form rule, one sentence

You can write a metadata block as either a `<table>` (preferred — simpler, matches EDS canonical authoring) or a `<div class="metadata">` with `<p>`-wrapped cells; both round-trip cleanly. What you must **not** write is `<div class="metadata">` with bare text in cell divs — that's not a recognized block shape and the save will silently strip and flatten it.

### Validating

Don't preview-publish and look for the metadata table in `<body>` — it won't be there. Validate by reading `document.title` and the `<meta>` tags from `<head>` (see `validation-loop.md`).

## Images

Always wrap images in `<picture>`:

```html
<picture><img src="/media/your-image.jpg" alt="describe the image"/></picture>
```

The `src` attribute can take **two valid shapes**, and EDS handles both automatically — there is no separate upload step you need to take:

1. **Local media path** — `/media/...`. Already on the site's CDN; served as-is.
2. **External absolute URL** — any publicly reachable image, e.g. `https://images.unsplash.com/photo-…` or `https://cdn.example.com/headshots/jane.jpg`. On preview-publish, EDS fetches the image, copies it into the site's local media bus (you'll see filenames like `media_1c05794….jpg` once published), generates responsive optimized variants (`?width=…&format=webply&optimize=…`), and the rendered `<img>` at `.aem.page` ends up pointing at the local copy. The author HTML you save keeps the original external URL — the rewrite is invisible to the source.

**Implication for migration**: if the source page (a webpage you're scraping, or any source that has working `https://…` image URLs) already provides reachable image URLs, **paste them straight into the da.live HTML.** Do not:
- Download the image yourself and try to re-host it somewhere
- Substitute a placeholder when a real URL is available
- Add a "TODO upload image" step to the report

EDS does the ingestion at publish time as long as the URL is publicly reachable from the internet. Verified behavior: pages migrated with external image URLs render with local optimized media after `preview_publish_dalive_content`.

**When placeholders are still right**: only when *no* URL exists for the image — typically images embedded inline in a PDF where you can only see the pixels, not a hostable URL. In that case, use `/media/placeholder.jpg` and flag it as a gap in the final report. Don't hallucinate URLs that don't exist.

`alt` text should be derived from the source — caption, surrounding heading, or descriptive context. Don't ship empty alt unless the image is purely decorative.

## Headings, paragraphs, lists

Inside default content or block columns, use plain semantic HTML:

```html
<h1>Title</h1>
<h2>Subhead</h2>
<p>Body text. <a href="/somewhere">A link</a>.</p>
<ul>
  <li>Bullet one</li>
  <li>Bullet two</li>
</ul>
```

One H1 per page, conventionally. Don't nest headings into block columns unless the block expects it (heroes, callouts, and section breaks often do).

## Tables (the special case)

Native HTML `<table>` is unusual in da.live — most "tabular" things are modeled as `cards`, `columns`, or similar blocks. If the source genuinely has a data table, render it semantically as `<table><thead><tbody>…` and confirm with the user whether they want it kept as-is or restructured into a block.

## Page skeleton

A complete minimal page:

```html
<html>
<body>
  <header></header>
  <main>
    <div class="hero">
      <div><div><picture><img src="/media/hero.jpg" alt="hero"/></picture></div></div>
      <div><div><h1>Title</h1><p>Subtitle</p></div></div>
    </div>

    <div>
      <h2>Section heading</h2>
      <p>Default-content paragraph that doesn't need a block.</p>
    </div>

    <div class="columns">
      <div>
        <div><p>Column 1</p></div>
        <div><p>Column 2</p></div>
      </div>
    </div>

    <table>
      <tr><td>Metadata</td><td></td></tr>
      <tr><td>title</td><td>Title for SEO</td></tr>
      <tr><td>description</td><td>One-line description.</td></tr>
    </table>
  </main>
  <footer></footer>
</body>
</html>
```

`examples/sample-page.html` (sibling to this references/ folder) has a fully-fleshed reference page if you want a longer anchor.

## Things to avoid

- **Inline `style="..."` attributes.** Styling is the block's job, not the content's. If a block looks wrong, fix the block CSS in the codebase, not the page HTML.
- **`<section>` wrappers.** da.live uses `<div>`-only block syntax; the parser doesn't recognize `<section>` as a block container.
- **Class names you invented.** If a class isn't in the block library and isn't `metadata`, the renderer treats it as default content and the styling won't apply. Stick to library blocks; record uncovered patterns as gaps.
- **Empty blocks.** A `<div class="hero"></div>` will render as empty whitespace. If you'd otherwise emit an empty block, drop it.

## Why this matters

The block-as-div convention exists because the EDS renderer is content-first and CSS-driven — it doesn't transform JSX or run server-side templating. The HTML you save *is* the page, modulo block hydration. That makes the structure load-bearing: small deviations are silently wrong rather than loudly broken, which is why visual validation (see `validation-loop.md`) is the only reliable check.
