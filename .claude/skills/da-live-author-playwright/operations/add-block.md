# Operation: add a block to an existing da.live page

Surgical: insert a new block into a page without touching the rest of its content. Used when a user says "add a hero to this page", "insert a CTA at the bottom", "I need a columns block after the second paragraph", etc.

## Inputs you should have from the confirmation gate

- `owner`, `site`
- Target page URL (the existing page to edit), e.g. `/source/{owner}/{site}/some-page.html`
- Block library index URL (you'll need to consult it for the block's shape)
- Block to add — type/class name and any required content
- Insert position — one of:
  - **Top of `<main>`** (above everything else)
  - **Bottom of `<main>`** (below everything else — most common)
  - **After block at index N** (e.g., "after the second columns block")
  - **Before block with class X** (e.g., "before the metadata block" — usually the right answer if the user says "at the bottom")
  - **Replacing a specific anchor** like "right before the metadata block" (always confirm)

If position is ambiguous, ask. "At the bottom" most often means "above the metadata block but below the rest of the content" — confirm before acting.

## Steps

1. **Fetch the current page** — `get_dalive_content("/source/{owner}/{site}/{path}.html")`. Don't act on a cached copy; pages may have been edited by humans.
2. **Fetch the block example** from the library — `get_dalive_content("/source/{owner}/{site}/block-library/{block-name}.html")`. Read its row/column shape (see `references/block-library.md`).
3. **Build the new block HTML** — using the library example's shape and the user-supplied content. Wrap images in `<picture>`, follow the patterns in `references/eds-html-structure.md`.
4. **Locate the insertion point** in the current page's HTML:
   - "Top of main" → first child position inside `<main>`.
   - "Bottom of main" → ambiguous; usually means just above the `metadata` block. Confirm if you didn't already.
   - "After block at index N" → find the Nth top-level `<div>` inside `<main>` and insert after it.
   - "Before block with class X" → find the first `<div class="X">` inside `<main>` and insert before it.
5. **Splice** the new block HTML into the page HTML.
6. **Save** — `save_dalive_content("/source/{owner}/{site}/{path}.html", updatedHtml)`.
7. **Preview-publish** — `preview_publish_dalive_content("/source/{owner}/{site}/{path}")` (no `.html`). See `references/url-conventions.md`.
8. **Validate** — navigate to the preview URL and snapshot. Check:
   - The new block appears in the rendered output.
   - It rendered as a styled component (not raw HTML).
   - Surrounding content is unchanged.
9. **Refine** up to 3 times if the block didn't render correctly. Most common issue: wrong row/column count for the block — re-check the library example.

## Things to be careful about

- **Don't reformat the rest of the page.** Resist any temptation to "tidy up" unrelated content. The user asked to add one block; touching anything else means the diff is now your call to defend.
- **Don't move the metadata block.** It belongs at the bottom of `<main>`. Inserting "at the bottom" should mean *before* metadata, not after — otherwise the metadata block ends up rendered as a visible block instead of becoming `<meta>` tags.
- **Watch for duplicate IDs / anchors.** If the new block introduces an `id` (rare in da.live HTML — blocks usually rely on class), make sure it doesn't collide.

## Final report

Use the standard report shape from SKILL.md. Highlight:

- The page that was edited (with preview URL).
- The block that was added (class name, position).
- Validation result.
- Anything you noticed about the rest of the page that wasn't part of the task (mention as observations, not changes).
