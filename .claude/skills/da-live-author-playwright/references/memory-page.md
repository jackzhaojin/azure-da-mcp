# Optional: the agent memory page

Some da.live sites maintain a "memory page" — a da.live page that this skill reads at the start of an operation and appends to at the end, recording lessons learned. It's a low-tech alternative to a real memory backend, and it survives across sessions and across users (anyone authoring on that site benefits from past runs).

It's **optional**. If the user doesn't have one set up, skip every step in this document silently — don't manufacture one.

## Where it lives

| Surface | Path |
|---|---|
| da.live source | `/source/{owner}/{site}/agent-memory.html` |
| Preview (not published deliberately) | n/a — don't publish this page |

It's a content page like any other, but **never preview-publish it** — it's for agent consumption, not site visitors. Keeping it unpublished means it won't appear in the site's nav or search.

## Read at the start

If the user provided a memory page URL during the confirmation gate, fetch it before doing the operation:

```
get_dalive_content("/source/{owner}/{site}/agent-memory.html")
```

If it 404s, no memory exists yet — that's fine, proceed without it. Don't error.

Scan the memory entries for:
- **Rules that apply to the current operation.** E.g., "Always check the cards block has 3 columns" — apply that when you'd otherwise use a cards block.
- **Past errors with the same source type.** E.g., "PDF tables flatten into space-separated text; reconstruct manually."
- **Block-mapping precedents.** If a past entry says "image gallery from PDF → use columns block, not cards", follow that for consistency.

Memory entries are advice, not commandments — if one contradicts something obvious from the current block library, trust the current library.

## Append at the end

After the operation completes, decide whether anything is worth saving. Append a new entry when:

- A refinement iteration discovered a fix worth preserving.
- A block-mapping decision was non-obvious and might come up again.
- An error pattern emerged that future runs should avoid.
- A site-specific quirk was uncovered (e.g., "this site's hero needs `dark` modifier on light-background pages").

Don't append when:
- Everything ran smoothly with no surprises.
- The lesson is generic enough to belong in this skill's references instead.
- You'd just be duplicating an existing entry.

## Entry format

Each entry is a `memory-entry` block — same row/column structure as any da.live block:

```html
<div class="memory-entry">
  <div><div>Date</div><div>2026-05-14</div></div>
  <div><div>Operation</div><div>create-page-from-source</div></div>
  <div><div>Page</div><div>customer-experience-digital-postal</div></div>
  <div><div>Issue</div><div>Cards block rendered as raw table on first attempt.</div></div>
  <div><div>Resolution</div><div>Cards block requires exactly 3 columns: image, title, description. Source had only image + description; added an empty title column placeholder.</div></div>
  <div><div>Rule</div><div>Before emitting a cards block, verify the source provides all 3 columns; if not, decide how to fill or pick a different block.</div></div>
</div>
```

Fields:
- **Date** — today's date (YYYY-MM-DD).
- **Operation** — which playbook ran (e.g. `add-block`, `create-page-from-source`).
- **Page** — slug or path of the page involved.
- **Issue** — what went wrong or surprised you.
- **Resolution** — what you did to fix it.
- **Rule** — generalized lesson for future runs (this is the most valuable field).

## How to save

Read the current memory page → append the new entry to its `<main>` (before any closing wrapper or trailing block) → save:

```
save_dalive_content("/source/{owner}/{site}/agent-memory.html", updatedHtml)
```

**Do not** call `preview_publish_dalive_content` on the memory page. Saving is enough — it's not meant to be a published artifact.

## Memory hygiene

- **Cap at ~50 entries.** Above that, the page gets unwieldy and noisy. When you hit the cap, trim oldest-first, but keep entries with broadly applicable rules.
- **Dedupe.** If you'd add an entry that's a near-duplicate of an existing one, instead extend the existing entry's Rule field or skip.
- **Don't include source-specific PII.** Memory is for patterns, not source content. "Page about a CEO named X had Y issue" → drop the name; "Pages with executive bios had Y issue" is the lesson.

## Why this exists

da.live pages are authored by many people (and now agents) over time. Without a shared notepad, every new agent run rediscovers the same site-specific quirks. Memory is the cheap version of "institutional knowledge" — and crucially it lives in the same system it's about, so it follows the site if it's exported, cloned, or transferred.
