# Operation: replace a block on an existing da.live page

Swap one block for another — either same type with different content ("replace the hero text"), or a different type ("turn this columns block into a cards block"). This is the most error-prone surgical edit because it touches both content and structure.

## Inputs you should have from the confirmation gate

- `owner`, `site`
- Target page URL
- Block library index URL (you'll need it for the new block's shape if the type changes)
- **Source block** — which existing block to replace (class + index, or visual position)
- **Target block** — what to put in its place. Either:
  - Same class, new content (the simpler case).
  - Different class, mapped content (the trickier case — the new block may have different column expectations than the old one).
- New block content — provided by the user, derived from another source, or assembled from the old block's content if same-class.

## Steps

1. **Fetch the current page** — `get_dalive_content`. Always fresh.
2. **Locate the source block.** Same logic as `remove-block.md` — if ambiguous, ask.
3. **Show the user the diff plan.** Two-block preview:
   ```
   Removing: <div class="columns"> — "Plan A | Plan B | Plan C"
   Adding:   <div class="cards"> — 3 cards, one per plan
   ```
   This catches "wait that's a different block" before publish.
4. **Fetch the new block's example** from the library (if the type changed). Read its row/column shape per `references/block-library.md`.
5. **Build the replacement HTML** using the new block's shape contract. If the source and target block types have different shapes (e.g., `columns` is row-of-columns; `cards` is rows-of-3-columns), think carefully about how the content maps:
   - Don't drop content silently. If the old block had 4 columns and the new block expects 3, decide explicitly: drop one (which one?), combine two, or refuse and surface the mismatch.
   - Don't invent content. If the new block needs a column the old one didn't have (e.g., new `cards` needs images, old `columns` had only text), use a placeholder and flag as a gap — don't fabricate.
6. **Splice** — remove the old block's `<div>...</div>` and insert the new block's HTML in its place. Don't touch the rest of the page.
7. **Save** — `save_dalive_content`.
8. **Preview-publish** — `preview_publish_dalive_content` with the full path, no `.html`.
9. **Validate** — `browser_navigate` + `browser_snapshot`. Check:
   - Old block is gone.
   - New block rendered correctly (not raw HTML).
   - Content fidelity preserved (compare snapshot text against the user's input).
   - No surrounding content shifted in unexpected ways.
10. **Refine** up to 3 times. Most common issue: column-count mismatch for the new block type (verify against the library example).

## Special cases

- **Same-class replace** (just changing content): simpler — copy the shape from the existing block instead of fetching the library example.
- **Replacing metadata block** — unusual. Almost always the user means `update-metadata.md` instead. Confirm.
- **Replacing a block with default content** ("remove the hero and just have a heading there"): technically not a block-to-block replace; treat as `remove-block` + insert plain `<h1>` etc. into the gap.

## Why this operation is the trickiest

Replacing same-class is roughly as safe as add-block. Replacing cross-class is the hard case because the two blocks may have different content "schemas". Doing it right requires:

- Knowing both blocks' shapes (read the library for both).
- Knowing the source block's actual content (read the page, parse the block).
- Making explicit, surfaced decisions about how to bridge the gap between the two schemas.

When in doubt, do `remove-block` then `add-block` in sequence — same outcome, but each step has clearer guardrails and is easier to undo.

## Final report

Use the standard shape from SKILL.md. Highlight:

- Page edited (preview URL).
- Source block (class, position, content snippet).
- Target block (class, position, content snippet).
- Mapping decisions if cross-class (what content stayed, what was dropped/added/placeholdered).
- Validation result.
