# Operation: remove a block from an existing da.live page

Surgical deletion of one block. Used when the user says "remove the hero", "delete the second columns block", "get rid of the CTA at the bottom", etc.

## Inputs you should have from the confirmation gate

- `owner`, `site`
- Target page URL — `/source/{owner}/{site}/some-page.html`
- Block to remove — identified by one of:
  - **Class name + index** (e.g., "the first `hero` block", "the second `columns` block"). Index is 0-based among blocks of that class.
  - **Class name alone** when only one block of that class exists.
  - **Visual position** ("the third block from the top") — convert to a 0-based top-level child index inside `<main>`.

If the page has multiple blocks of the named class and the user didn't specify which, **ask**. Don't pick one.

## Steps

1. **Fetch the current page** — `get_dalive_content("/source/{owner}/{site}/{path}.html")`. Always re-read; don't assume cached state.
2. **Locate the target block.**
   - Parse the HTML and walk top-level children of `<main>`.
   - Apply the user's specifier (class + index, or just class, or position).
   - If you find zero matches or more matches than expected, **stop and confirm** with the user before deleting anything. A wrong delete is hard to undo.
3. **Show the user what you're about to remove** — quote the block's first heading / first 30-60 characters of text content. Two-line preview:
   ```
   Removing: <div class="hero"> — "The Future of Postal Delivery"
   Position: 0 (first block under <main>)
   ```
   This catches "wait, that's not the one I meant" before publish.
4. **Splice the block out.** Remove just that one `<div class="...">...</div>` and any trailing whitespace. Leave the rest of the page untouched.
5. **Save** — `save_dalive_content("/source/{owner}/{site}/{path}.html", updatedHtml)`.
6. **Preview-publish** — `preview_publish_dalive_content("/source/{owner}/{site}/{path}")` (no `.html`).
7. **Validate** — navigate to the preview URL. Verify:
   - The targeted block is gone.
   - No surrounding content moved unexpectedly.
   - The page still has its `metadata` block (if you accidentally removed that, the page is now SEO-broken).
8. **Refine** up to 3 times if validation surfaces issues. Most common: removed too much (took an adjacent block with it) or removed the wrong index.

## Special cases

- **Removing the only block of a critical type** (e.g., the only hero, the metadata block) — confirm twice. The user might not realize the consequence (no title image, or no SEO meta tags). If they confirm, proceed.
- **Removing the metadata block** — almost always a mistake. The page will publish with no `<meta>` tags. Push back: "Are you sure? The metadata block produces the page's `<meta>` tags; without it, the title/description disappear from search results." If they still want it gone, do it.
- **Removing default content** — default content isn't technically a "block" (no class), so this operation doesn't really apply. If the user wants to delete a paragraph, tell them this is an edit-content task rather than a remove-block task and ask how to proceed.

## Final report

Use the standard shape from SKILL.md. Highlight:

- Page edited (preview URL).
- Block removed (class, position, snippet of removed content).
- Validation result.
- Anything that looks visually different in the rendered page (e.g., spacing between adjacent blocks changing).
