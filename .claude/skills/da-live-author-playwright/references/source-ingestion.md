# Ingesting source content

The skill works from a variety of source shapes. Auto-detect what the user provided rather than forcing one shape, because the right shape differs between Claude Code (local files, URLs) and claude.ai web (chat attachments).

## Decision order

For a given operation that needs a source, work through these in order — use the first one that applies:

1. **Attachment in this conversation** (PDF, HTML, or image visible to you) → read it directly using the host's normal file-reading mechanism. On claude.ai web this is the most common shape; on Claude Code, an attachment shows as a Read-able path.
2. **Local file path** the user mentioned (`/Users/...`, `~/Downloads/foo.pdf`, etc.) → use the `Read` tool. Claude Code only.
3. **URL ending in `.pdf` or pointing at a PDF** → try Playwright `browser_navigate` first (some browsers render PDFs); if it returns an unhelpful snapshot, ask the user to attach the PDF directly instead.
4. **HTML page URL** → use Playwright `browser_navigate` + `browser_snapshot` to capture the rendered DOM and content.
5. **Bare text** the user pasted into the chat → treat the chat text itself as the source.

If none of the above apply, ask the user to clarify the source — don't fabricate.

## What to extract

Regardless of source type, end up with a structured understanding before transforming:

- **Title / main heading** — the H1 candidate.
- **Section headings** (H2–H4) and the body content under each.
- **Lists** (bulleted, numbered) — preserve order.
- **Images** — capture the original URL and position. If the source provides a publicly reachable absolute URL (`https://...`), use it directly in the da.live HTML — EDS auto-ingests external images into the local media bus on preview-publish, so no manual download/upload step is needed. Use placeholder paths (`/media/placeholder.jpg`) only when no URL exists at all (e.g., images embedded in a PDF). See `eds-html-structure.md` for the full rules.
- **Links** — keep destinations exactly.
- **Tables** — capture row/column structure if any.
- **CTAs / buttons** — note the call-to-action text and target URL.
- **Author/date/byline** — destined for the metadata block.

## Per-source notes

### PDF (attachment or path)

PDFs are unstructured. You'll get text in reading order, sometimes with column-breakage artifacts. Be alert for:

- Two-column layouts collapsing into interleaved paragraphs — reorder by reading top-to-bottom of each column.
- Headers/footers repeating on every page — dedupe.
- Images embedded inline — you usually only get a reference, not the image data. Flag images as gaps and use placeholder paths.
- Tables flattened into space-separated text — recognize and reconstruct.

### Webpage URL

Use Playwright:

```
browser_navigate(url)
browser_snapshot()  # accessibility tree — best for understanding structure
browser_take_screenshot()  # optional, for visual sanity
```

The snapshot is usually more useful than a raw HTML dump — it gives you the semantic structure (headings, lists, links) without nav/footer chrome bloat. If the page has lazy-loaded content, you may need to wait or scroll (`browser_evaluate` for `window.scrollTo`) to capture below the fold.

For images on the source page, capture the absolute `https://...` URLs from `<img src>` / `<picture><source srcset>` — those URLs go straight into the da.live HTML, no local re-hosting required (EDS handles ingestion at publish time). If `srcset` lists multiple resolutions, pick a reasonable single URL (the highest non-cropped one usually); EDS will re-derive responsive variants anyway.

### PDF URL

Playwright may or may not render PDFs depending on Chromium build. Try `browser_navigate` first. If the snapshot shows a download dialog or "PDF viewer not available", ask the user to attach the PDF to the chat instead.

### Local path (Claude Code only)

Use `Read` for `.md`, `.html`, `.txt`. For local PDFs, the host's PDF handling applies.

## Preserving fidelity

The skill's core promise is structural transformation without editorial rewriting. So:

- **Brand names, product names, trademarks, proper nouns — verbatim.** Never paraphrase "United States Postal Service" as "USPS" unless the source did. Never expand acronyms unless the source did.
- **Numbers, dates, percentages — verbatim.** Don't round, normalize, or "clean up" formatting.
- **Quotes — verbatim, including punctuation.** A quote isn't a paraphrase candidate.
- **Body prose — keep meaning identical.** You can collapse trivial whitespace, but don't reword to sound better.

If the source has obvious typos, leave them and flag them as gaps in the report — that lets a human decide whether to correct them, rather than the skill silently editing.

## Picking a page slug

If the operation creates a new page, derive a URL-safe slug from the source:

- Lowercase, ASCII-only.
- Words separated by hyphens.
- Drop articles (`a`, `an`, `the`) and punctuation.
- Cap at ~60 characters.
- Avoid leading numbers if you can (some routers behave oddly).

Examples:
- "Customer Experience: Digital Postal Services" → `customer-experience-digital-postal-services`
- "Q4 2025 Sustainability Report" → `q4-2025-sustainability-report` (the leading non-letter is uncommon but fine for da.live)

Show the proposed slug to the user before creating — slugs are part of the URL forever.
