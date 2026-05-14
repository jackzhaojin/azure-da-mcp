# Operation: update page metadata

Edit only the `metadata` block on an existing page — title, description, image, keywords, etc. The rendered page body doesn't change; the published `<head>` does. Common asks: "fix the page title", "update the SEO description", "add an og:image".

## Inputs you should have from the confirmation gate

- `owner`, `site`
- Target page URL — `/source/{owner}/{site}/some-page.html`
- Metadata changes — a set of key/value updates. Each is one of:
  - **Set** (or replace) — `title = "New title"`
  - **Add** — a key that didn't exist before, e.g. `og:type = "article"`
  - **Remove** — drop a key entirely

If the user gave you a vague ask like "update the metadata", ask which fields. Don't rewrite all of them.

## Steps

1. **Fetch the current page** — `get_dalive_content("/source/{owner}/{site}/{path}.html")`.
2. **Locate the metadata block.** What you'll see on a GET is the canonical storage form: `<div class="metadata">…</div>`, conventionally near the bottom of `<main>`. (Confusingly, the canonical *authoring/input* form is a `<table>` — but da.live normalizes that to the div form on save, so a GET always returns the div form. See `references/eds-html-structure.md` for the full rule.) If no metadata block exists, the page has no metadata — adding one is fine, but tell the user that's what you're doing.
3. **Parse the existing rows.** Each row is `<div><div><p>key</p></div><div><p>value</p></div></div>` (or for image-like values, the second cell contains `<picture><img/></picture>` instead of `<p>`). Build a key → value map.
4. **Apply changes.** For each change in the user's input:
   - **Set**: replace the value in the existing row, or append a new row if the key wasn't present.
   - **Add**: same as set on a new key.
   - **Remove**: drop the row entirely.
5. **Reconstruct the metadata block as a `<table>`** — simpler to build than the div form, and da.live will normalize it to the canonical storage form on save. Per `references/eds-html-structure.md`:
   ```html
   <table>
     <tr><td>Metadata</td><td></td></tr>
     <tr><td>title</td><td>...</td></tr>
     <tr><td>description</td><td>...</td></tr>
     <tr><td>image</td><td><picture><img src="..." alt="..."/></picture></td></tr>
     <!-- etc. -->
   </table>
   ```
   (You can also write the div form directly — `<div class="metadata"><div><div><p>key</p></div><div><p>value</p></div></div>…</div>` — both round-trip. Just **never** write bare text in cell divs without `<p>` wrappers; that breaks block recognition.)
6. **Splice** the new metadata block into the page in place of the old one (or as a new last child of `<main>` if there wasn't one).
7. **Save** — `save_dalive_content`.
8. **Preview-publish** — `preview_publish_dalive_content("/source/{owner}/{site}/{path}")` (no `.html`). Required — the `.aem.page` URL only reflects published content.
9. **Validate.** Special validation for metadata, since the changes don't appear in the page body:
   - `browser_navigate(previewUrl)` then `browser_evaluate("document.title")` for the title.
   - `browser_evaluate("document.querySelector('meta[name=description]')?.content")` for description.
   - For og:image etc., query the corresponding `<meta property="...">` tag.
   - Confirm each updated key produced the expected `<meta>` tag (or document title) in the published `<head>`.

   If `browser_evaluate` is unavailable in the host, fall back to `browser_snapshot` and look for the title/description in the accessibility tree.

## Things to be careful about

- **Don't reformat unchanged keys.** Preserve the existing order and surrounding content; only change what the user asked to change.
- **Preserve casing.** Standard metadata keys are lowercase (`title`, `description`, `keywords`). OpenGraph keys use colon-separated lowercase (`og:title`, `og:image`). Don't capitalize.
- **Values can contain HTML** — particularly `image`, which is typically `<picture><img src="/media/..."/></picture>`. If the user gave you a plain URL for an image, wrap it correctly.
- **Don't preview-publish only the metadata page.** The whole page must be preview-published — metadata is part of it.

## When there's no metadata block yet

Some older or hand-authored pages may lack one. Tell the user, then add a metadata block as the last child of `<main>`. The page's existing `<title>` and `<meta>` (if any) will be replaced by whatever the metadata block produces on next publish.

## Final report

Use the standard shape from SKILL.md. Highlight:

- Page edited (preview URL).
- Metadata changes (before/after for each touched key).
- Validation result with the actual `<head>` values you confirmed.
