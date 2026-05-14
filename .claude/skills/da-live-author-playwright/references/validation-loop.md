# Validation loop + confidence scoring

Load this after a `preview_publish_dalive_content` call on any operation that wrote to da.live. The goal: verify the rendered output looks right, refine if not, and report honestly.

## Why visual validation matters

da.live's HTML rules are precise but unforgiving — a block with one wrong nested `<div>` will *save* fine, *publish* fine, and then render as raw markup or empty whitespace in the browser. The only reliable check is to load the published URL and look at what's actually on screen. Static HTML inspection isn't enough.

## The loop, in shape

```
[preview_publish] → [Playwright navigate + snapshot]
                         ↓
                   PASS ──────► report
                   REFINE → fix HTML → save → preview-publish → loop
                   FAIL ──────► report failure honestly
```

**Hard cap: 3 refinement iterations.** If after 3 passes the page still has the same kind of issue, stop. Either the source content has an irreducible mismatch with the available blocks, or the block library has a bug, or your block mapping was wrong. None of those are fixable by another loop — they need a human.

## Validation steps

After preview-publish completes:

### 1. Navigate to the preview URL

```
browser_navigate("https://main--{site}--{owner}.aem.page/{path}")
```

Wait for the page to load. The preview can lag a few seconds after publish; if you get a 404, wait briefly and retry once before declaring failure.

### 2. Snapshot the rendered structure

```
browser_snapshot()
```

The snapshot gives you the semantic accessibility tree. Use it to verify:

- All expected headings are present and in the right level.
- All body content is present (do a coarse "did the text show up?" check).
- Each block emitted in the HTML actually rendered as a styled component (vs. a raw `<div>` dump).
- Images have rendered (or, if placeholders, are flagged).
- Layout is at least sane (no element collapsing onto another in a way that obscures content).

### 3. Optional screenshot

```
browser_take_screenshot()
```

Use a screenshot when:
- The snapshot looks fine but you want visual confirmation.
- You suspect a block is misaligned, overflowing, or has a styling bug.
- You'll be asking the user to confirm "does this look right?"

Don't screenshot every iteration — it costs tokens and isn't usually needed.

### 4. Score the result

Choose one of three outcomes:

**✅ PASS** — all critical content is present, blocks render correctly, layout is sane. Go to reporting.

**⚠️ NEEDS REFINEMENT** — something specific is wrong (a block didn't hydrate, content is missing, an image broke). Fix and loop. Examples of fixable issues:
- Block class typo (`heroo` instead of `hero`).
- Wrong column count for a block (e.g., `cards` needs 3 columns and you gave 2).
- Missing `<picture>` wrapper around an `<img>`.
- Default content got accidentally wrapped in a misnamed block.

**❌ FAIL** — irreducible problem. Examples:
- Source content has a structure with no matching block, and human guidance is needed.
- Page is fully broken in a way Playwright can't even snapshot.
- Refinement attempts haven't converged after 3 loops.

## Refinement mechanics

If the outcome is REFINE:

1. **Identify the specific issue.** Be precise — "the hero is broken" isn't actionable; "the hero's image and title are in the same row instead of stacked" is.
2. **Fetch current state.** `get_dalive_content` on the page to see what was saved.
3. **Compare to the block library example** for the problematic block. The fix is usually a row/column structure mismatch.
4. **Edit and save.** `save_dalive_content` with the corrected HTML.
5. **Preview-publish.** `preview_publish_dalive_content` — remember the full `/source/{owner}/{site}/...` path.
6. **Re-validate** from step 1 above. Increment your loop counter.

## Confidence scoring rubric

End every operation with a numeric confidence score (0–100%). Use this weighted rubric:

| Factor | Weight | Score (0–100) basis |
|---|---|---|
| Content completeness | 30% | All source content represented? 100 = all, 0 = mostly missing |
| Block mapping accuracy | 25% | Right blocks used for each section? 100 = perfect, 50 = some uncertain choices, 0 = mostly guesswork |
| Validation pass status | 25% | 100 = passed cleanly, 50 = passed with minor visual oddities, 0 = failed |
| Refinement iterations | 10% | 100 = 0 used, 66 = 1, 33 = 2, 0 = 3 (or hit the cap) |
| Gaps / uncertainties | 10% | 100 = none, 50 = minor, 0 = major (e.g., custom widgets couldn't be mapped) |

Bands:
- **90–100%** — high confidence, ready for production with minimal review.
- **70–89%** — medium confidence, human should skim before promoting.
- **50–69%** — low confidence, significant manual work likely needed.
- **<50%** — failed; recommend manual migration or pause for guidance.

Be honest. Inflated scores erode the skill's value over time — users start ignoring them, and the score stops working as a signal.

## Gap documentation

In the final report, list any gaps you noticed. A gap is anything that:
- Couldn't be cleanly mapped to a library block.
- Required a placeholder (e.g., image you couldn't transfer).
- Lost styling/formatting that the source had.
- Was ambiguous in the source and you had to guess.

Use this shape:

```
**Gaps:**
- **<short name>** — <one-line description>
  - Source: <what was in the source>
  - Decision: <what you did about it>
  - Recommended follow-up: <what a human should do>
```

If there are zero gaps, write "Gaps: none." rather than omitting the section — that confirms you considered it.
