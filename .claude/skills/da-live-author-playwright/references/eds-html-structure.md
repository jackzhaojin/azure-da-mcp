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

## The metadata block

Every page should end with a `metadata` block. The renderer turns it into `<meta>` tags in the published `<head>`:

```html
<div class="metadata">
  <div><div>title</div><div>Customer Experience Digital Postal</div></div>
  <div><div>description</div><div>How postal services modernize CX with digital touchpoints.</div></div>
  <div><div>image</div><div><picture><img src="/media/og-image.jpg"/></picture></div></div>
</div>
```

Each row is a key/value pair: column 1 is the meta key (`title`, `description`, `image`, `keywords`, etc.); column 2 is the value. Lowercase keys.

## Images

Always wrap images in `<picture>`:

```html
<picture><img src="/media/your-image.jpg" alt="describe the image"/></picture>
```

Image paths in da.live are typically `/media/...` — a CDN convention. If you don't have a real image URL yet (common when migrating from a PDF), leave the `src` as a placeholder path (`/media/placeholder.jpg`) and flag it as a gap in the final report rather than hallucinating a URL.

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

    <div class="metadata">
      <div><div>title</div><div>Title for SEO</div></div>
      <div><div>description</div><div>One-line description.</div></div>
    </div>
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
