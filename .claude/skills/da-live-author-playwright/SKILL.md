---
name: da-live-author-playwright
description: Author content on da.live (Adobe Document Authoring / Edge Delivery Services / EDS). Create pages from PDFs or webpages, bulk-create page batches, surgically add/remove/replace blocks on existing pages, update page metadata, and validate the rendered preview output. Orchestrates two MCP servers (DA.live for CRUD + preview-publish, Playwright for source viewing + post-publish validation). Trigger this skill whenever the user mentions da.live, daleve, Adobe Document Authoring, Edge Delivery Services, EDS block library, aem.page URLs, paths shaped like /source/{owner}/{site}/, "preview-publish", "migrate to da.live", "add a block to a page", "replace the hero", "create a page from this PDF/URL", or any content-authoring task targeting that ecosystem — even when they don't explicitly say "skill" or "da.live" but the artifacts make the intent clear (e.g. an EDS block library URL or an aem.page link in the conversation).
---

# da.live Content Authoring (with Playwright)

This skill orchestrates **two MCP servers** to author content on [da.live](https://da.live) — Adobe's Document Authoring tool for Edge Delivery Services (EDS). It handles the end-to-end pattern that da.live demands: **GET existing structure → transform → CREATE/SAVE → preview-publish → validate the rendered output → refine → report**.

Migration (PDF/webpage → da.live page) is just one operation. The skill also does surgical edits to existing pages (add/remove/replace a single block), bulk authoring, and metadata updates.

## MCP servers this skill depends on

The skill assumes both are already wired into the host. It does not install or configure them — it just calls their tools.

| Server | Cloud endpoint | Purpose | Key tools |
|---|---|---|---|
| **DA.live MCP** | `https://jack-mcp-azure-ai-function.azurewebsites.net/api/mcp-streamable` | Read/write da.live content + preview-publish | `list_dalive_content`, `get_dalive_content`, `create_dalive_content`, `save_dalive_content`, `create_folder_dalive`, `preview_publish_dalive_content` |
| **Playwright MCP** | `https://d3chtew0dmpv41.cloudfront.net/mcp` | Browse source pages + validate the published preview | `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_fill_form`, etc. |

If either tool surface is missing when the skill runs, surface that to the user immediately rather than improvising — the value of the skill comes from the two working together.

## Authentication — the bearer token problem

Every DA.live MCP tool call needs an Adobe IMS bearer token (24h lifetime). The server does not store a token of its own; the caller has to supply one on every request. There are two channels for delivering it, and **which one applies depends on the host the skill is running in**:

- **Hosts that send `Authorization: Bearer <token>` natively** (Claude Desktop via stdio bridge, Claude Code, ChatGPT custom actions, curl/Bruno): the token reaches the server through the HTTP header. You don't have to do anything special — call the DA.live MCP tools normally.
- **Hosts that can't set custom HTTP headers on remote MCP requests** (Claude.ai custom connectors, Make.com MCP modules): the token travels as a `bearerToken` field inside each tool call's `arguments` object. The user puts the current token value in project knowledge / system prompt with an instruction to include it in every tool call. **When such an instruction is present, follow it — pass `bearerToken: "eyJ..."` in every DA.live MCP tool call's arguments.** The server strips that field before the tool implementation runs, so it never leaks into tool error output.

When in doubt, defensively include `bearerToken` if the user supplied one — the server prefers a real header when both are present, so an extra arg-channel value is just ignored when not needed.

**Failure mode**: a tool call that returns `Authentication failed for da.live API`, `Invalid session: No session or Bearer token provided`, or `401 Unauthorized: Invalid or expired Bearer token` means the token has expired or isn't reaching the server. Stop the operation, surface this to the user, and ask them to refresh — the canonical command is `npx github:adobe-rnd/da-auth-helper token`. Don't try to refresh it yourself; the helper requires a browser session on the user's machine.

See `references/authentication.md` for the full model, why it's designed this way, and a deeper triage table.

## How to use this skill — at a glance

1. **Confirm the working context** (see "Confirmation gate" below) before any tool call.
2. **Pick an operation** based on the user's intent and load the matching playbook from `operations/`.
3. **Run the operation**, using the references in `references/` as needed for HTML structure, block library lookups, validation, etc.
4. **Validate** the rendered preview with Playwright (max 3 refinement loops).
5. **Report** with a confidence score and any gaps. Optionally update the memory page.

---

## Confirmation gate — ask first, act second

da.live is a live CMS. A misnamed folder, wrong owner, or wrong site means publishing content into the wrong place — sometimes a place where another team is shipping production pages. So before any write, **confirm the working context with the user**. Don't guess.

Ask for and echo back this checklist (only ask for what's relevant to the chosen operation — e.g., for "add a block" you don't need a target folder):

| Field | Always required? | Example | Notes |
|---|---|---|---|
| `owner` | Yes | `jackzhaojin` | GitHub org/user that owns the da.live site |
| `site` | Yes | `da-live-postal-2025-07` | da.live site repo name |
| Operation type | Yes | `create-from-source` / `bulk-create` / `add-block` / `remove-block` / `replace-block` / `update-metadata` | Determines which playbook to load from `operations/` |
| Block library index URL | For create/add/replace ops | `/source/{owner}/{site}/block-library/index.html` | The agent's source of truth for valid block patterns. Verify it exists before relying on it; if missing, ask the user whether to proceed without it. |
| Memory page URL | Optional | `/source/{owner}/{site}/agent-memory.html` | Lessons from past runs. Skip if absent. See `references/memory-page.md`. |
| Sample/reference page URL | Optional | `/source/{owner}/{site}/index.html` | A known-good existing page to mimic when the block library is sparse. |
| Target folder | For create/bulk-create | `migration-batch-2026-05-trial-run-1` | Where new pages land. Auto-suggest from date + ask for a postfix. |
| Source location | For create/bulk-create | Attachment, URL, or local path | Auto-detect — see `references/source-ingestion.md`. |
| Page slug | For create | `customer-experience-digital-postal` | Auto-derive a URL-safe slug from source; ask user to confirm. |
| Target page URL | For add/remove/replace/update-metadata | `/source/{owner}/{site}/some-page.html` | The existing page being edited. |
| Block target | For add/remove/replace | `class=hero, index=0` or "the second columns block" | Which block to act on. |

Why so many questions: the original prompt this was derived from had `owner` and `site` hardcoded. That made it fast for one demo and useless for everyone else. Asking once, up front, lets the same skill serve any da.live site — and the confirmation echo catches typos before they become publishing accidents.

After the user confirms, proceed to the operation playbook.

---

## Operation router

Once the context is confirmed, load **one** of these playbooks based on the user's intent. Don't load more than the operation needs.

| User intent | Load |
|---|---|
| "Create a page from this PDF / URL / file" | `operations/create-page-from-source.md` |
| "Migrate this content into da.live" | `operations/create-page-from-source.md` |
| "Create a batch of pages from these sources" | `operations/bulk-create-pages.md` |
| "Add a [hero/columns/cta/...] block to this page" | `operations/add-block.md` |
| "Remove the [block] from this page" | `operations/remove-block.md` |
| "Replace the [block] with a [different block]" | `operations/replace-block.md` |
| "Change the title / description / metadata on this page" | `operations/update-metadata.md` |

If the user's intent is ambiguous, ask. Don't pick one and hope.

---

## Reference material

Load these on-demand. Don't preload — they bloat context for operations that don't need them.

| Reference | When to load |
|---|---|
| `references/eds-html-structure.md` | Any time you're generating or modifying da.live HTML — covers the block-as-div pattern, default content, picture/img convention, the metadata block. |
| `references/block-library.md` | Before any create / add-block / replace-block operation — explains how to fetch the index page, parse the linked block examples, and study their exact HTML. |
| `references/source-ingestion.md` | At the start of any create / bulk-create — explains how to handle attachments vs URLs vs local paths in a host-agnostic way. |
| `references/validation-loop.md` | After preview-publish on any operation — covers Playwright validation, the 3-iteration refinement loop, and the confidence-scoring rubric. |
| `references/memory-page.md` | Optional — at start (read) and end (append) of operations, if the user opted into a memory page. |
| `references/url-conventions.md` | Whenever you need to construct a da.live edit URL, an `aem.page` preview URL, or a `/source/{owner}/{site}/...` path. Especially important: `preview_publish_dalive_content` requires the *full* `/source/{owner}/{site}/...` path. |
| `references/authentication.md` | Load when a tool call returns 401 / "Authentication failed for da.live API", or when you need to understand how the DA.live MCP server expects bearer tokens (header vs `bearerToken`-in-args). |

A canonical end-to-end shape for da.live HTML lives at `examples/sample-page.html`. Open it when you need a concrete anchor for "what does a clean page look like?"

---

## Universal rules across operations

These hold regardless of which playbook is running:

- **GET before CREATE/SAVE.** Always read at least one neighbor page or the block library before generating new HTML. da.live's structure is precise and varies subtly between sites; assume nothing.
- **Preserve factual content exactly.** No paraphrasing of brand names, product names, headings, body text, numbers, or quotes from the source. The skill's job is structural transformation, not editorial rewriting.
- **Preview-publish requires the full source path.** `preview_publish_dalive_content` needs `/source/{owner}/{site}/folder/page` — *not* just `folder/page`. This is a common pitfall; see `references/url-conventions.md`.
- **Validate after publish, not after save.** The `.aem.page` URL only reflects published content. A `save_dalive_content` without a `preview_publish_dalive_content` will appear stale on preview.
- **Cap refinement at 3 loops.** If the page still isn't right after 3 Playwright validation passes, stop and surface the issue to the user. Don't burn tokens chasing tail issues.
- **Be honest in the final report.** Score the confidence (rubric in `references/validation-loop.md`), list any gaps, and recommend manual follow-ups when something was unclear or unmappable. Underclaiming is fine; overclaiming makes downstream humans waste time verifying things that aren't true.

---

## Final report shape

Every operation ends with a structured report like this:

```
## Operation: <operation type>

**Owner / Site:** <owner> / <site>
**Target:** <full /source/... path>
**Preview URL:** https://main--<site>--<owner>.aem.page/<path>

**Status:** ✅ Success | ⚠️ Partial | ❌ Failed
**Confidence:** XX%

**What changed:**
- <bullet list of concrete edits>

**Blocks used / touched:**
- <list>

**Refinement iterations:** N of 3

**Gaps / uncertainties:**
- <bullet list, or "none">

**Recommendations:**
- <manual follow-ups, or "none">
```

If memory page is enabled and you learned something generalizable (a fix, a new block-mapping pattern, a recurring error), append to it — see `references/memory-page.md`.
