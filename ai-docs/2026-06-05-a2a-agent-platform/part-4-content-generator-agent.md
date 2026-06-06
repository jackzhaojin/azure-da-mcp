# Part 4 — Content Generator Agent (new)

The missing third of the closed loop. Today the pipeline starts from real PDFs/webpages; this agent manufactures inputs on demand, which unlocks repeatable Nx experiments and removes dependence on scraping other people's sites for demo material.

## Purpose

Two modes, two skills on the Agent Card:

### Mode 1 — `content.brief`
Generates a structured **content brief**: page intent, audience, outline, copy blocks, image directions, target EDS blocks (from the site's block library). Output is a markdown/JSON artifact the migration agent (or a human) can author from.

**Use case**: AI-driven net-new content creation for the EDS site (the user's "have AI drive content creation" goal).

### Mode 2 — `content.synthesize-source`
Generates a complete **synthetic "legacy" source page** — standalone HTML (optionally deliberately messy: table layouts, inline styles, non-semantic markup, configurable "legacy-ness") that mimics a real-world migration source. Uploaded to Supabase Storage and served at a public URL.

**Use case**: feeds the migration agent exactly like a real `sourceType: webpage` input. This is what makes the closed loop *closed*: generate 10 synthetic pages → migrate 10x → eval 10x, with full knowledge of ground truth (we generated the source, so the eval's content-fidelity dimension has a perfect reference).

## Task Contracts

```jsonc
// content.brief.v1 — input
{
  "siteBrief": "string — the site's concept/voice (from the EDS site project)",
  "pageType": "landing | article | product | event | custom",
  "topic": "string",
  "blockLibraryUrl": "https://main--{site}--{owner}.aem.page/tools/sidekick/library.html", // optional
  "constraints": { "wordCount": 800, "imageCount": 3 }                                     // optional
}
// artifact: { "brief": { ...structured brief... }, "artifacts": [{ "type": "brief", "path": "artifacts/<taskId>/brief.md" }] }

// content.synthesize-source.v1 — input
{
  "brief": { /* inline brief, or */ },
  "briefTaskId": "uuid — reuse a content.brief output",
  "legacyStyle": "clean | dated | messy",     // how hostile the markup should be
  "count": 1                                   // fan-out handled by coordinator; agent does 1 per task
}
// artifact: { "sourceUrl": "https://<supabase-storage-public-url>/.../page.html",
//             "groundTruth": { headings, links, imageAlts, bodyText },   // for eval reference
//             "artifacts": [{ "type": "source-html", "path": "..." }] }
```

`groundTruth` is the quiet superpower: the eval agent's content dimension can compare against *known-correct* extraction instead of re-parsing the source — a new optional `sourceType: "ground-truth"` input variant worth adding to `eval.run.v2` later. v1: just pass the `sourceUrl` as a normal webpage source.

## Backend — Claude Agent SDK only (single backend)

Unlike the migration agent (three backends, Part 5), content-gen has **one backend: the Claude Agent SDK**. There is no Make.com backend here — generation is a near-pure LLM task with no da.live/MCP dependency, so the multi-backend facade would be pure overhead. One Agent Card, one runtime.

## Implementation

```
agents/content-gen/
  src/
    a2a/          # standard wiring from a2a-common
    skills/       # brief.ts, synthesize.ts — each a Claude Agent SDK query() invocation
    prompts/      # versioned JSON prompt files, same convention as eval-service prompts
    publish.ts    # Supabase Storage upload + public URL resolution
```

- Claude Agent SDK `query()` with model `claude-sonnet-4-6`; `WebFetch`-style access only for reading the block library page; **no Playwright needed** (cheapest agent in the mesh — no browser permits required)
- Brief mode is a near-pure LLM call; synthesize mode emits a single self-contained HTML file (inline CSS, picsum/placeholder images or generated SVG) — no asset pipeline in v1
- Prompts versioned in-repo like `make-dot-com/` conventions (v1-brief.md etc.), but these ARE deployed with the service (unlike Make.com prompts)

## Relationship to the EDS Site Build (out-of-scope dependency)

The separate EDS-site PRD provides: site name/owner, block library, voice/branding. This agent consumes those as inputs (`siteBrief`, `blockLibraryUrl`). Until the site exists, develop against the existing demo site used by `make-dot-com/` flows (`owner=jackzhaojin`).

## Definition of Done

- `content.synthesize-source` task via curl produces a publicly fetchable HTML page that the existing Make.com migration prompt accepts as `sourceType=webpage, sourceLocation=<url>` with zero prompt changes
- One full manual loop executed: synthesize → migrate (Make.com) → eval (new service) — even before the coordinator exists
