# Tools used

What the content factory is built on, grouped by job. For how the pieces fit together, see [docs/architecture/](./architecture/). For every other link (repos, working demo, docs), see [REFERENCES.md](../REFERENCES.md).

## Protocols

| Tool | Used for | Link |
|---|---|---|
| A2A protocol (`@a2a-js/sdk`) | agent to agent: Agent Cards, tasks, streaming, push notifications; every agent is its own A2A server | https://a2a-protocol.org/ |
| Model Context Protocol (`@modelcontextprotocol/sdk`) | agent to tool: the CMS, a browser, a filesystem; also the read-only `store-mcp` server over the run store | https://modelcontextprotocol.io/ |

## Models

| Tool | Used for | Link |
|---|---|---|
| Kimi K3 (Moonshot AI) | the default migration author; K2.7 also benchmarked | https://platform.moonshot.ai |
| Claude Sonnet 5, Opus 5, Haiku 4.5 (Anthropic) | the `sdk` migration backend, picked per run | https://docs.claude.com/en/docs/about-claude/models/overview |
| Claude (Anthropic) | content generation, the agentic eval judge, and `eval.reflect` writing memory rules | https://www.anthropic.com/claude |

## Agent runtimes

| Tool | Used for | Link |
|---|---|---|
| Claude Agent SDK | runs Claude inside content-gen, the eval agent, and the `sdk` migration backend | https://docs.claude.com/en/docs/agent-sdk/overview |
| opencode (pinned 1.18.25) | runs Kimi headless for the default migration backend (`opencode serve` + REST) | https://opencode.ai |
| Agent skill: `da-live-author-playwright` | the authoring playbook; the same file runs under Kimi and Claude | [.claude/skills/da-live-author-playwright/](../.claude/skills/da-live-author-playwright/) |

## Content platform

| Tool | Used for | Link |
|---|---|---|
| Edge Delivery Services | the target site; agents land pages on `.aem.page` previews only | https://www.aem.live/docs/ |
| da.live (Document Authoring) | where agents author pages, and where the agent memory page lives | https://da.live |
| EDS block collection | the block patterns the demo site's block library builds on | https://www.aem.live/developer/block-collection |
| da.live MCP server (this repo, `functions/`) | six CMS tools (list, get, create, save, create folder, preview publish), self-authenticating with an Adobe IMS S2S account | [functions/](../functions/) |
| Azure Functions | hosts the da.live MCP server | https://learn.microsoft.com/azure/azure-functions/ |

## Browser and quality checks

| Tool | Used for | Link |
|---|---|---|
| Playwright | real Chromium for screenshots and rendering checks in the eval agent | https://playwright.dev |
| Playwright MCP | the agents' browser: read the source, check their own preview, give the eval judge the live DOM | https://github.com/microsoft/playwright-mcp |
| Filesystem MCP server | lets the eval judge read its own screenshots back | https://github.com/modelcontextprotocol/servers |
| axe-core | the deterministic accessibility scan (WCAG violations on the rendered page) | https://github.com/dequelabs/axe-core |
| cheerio | deterministic DOM analysis for the structure score | https://cheerio.js.org |
| pixelmatch | deterministic pixel compare for the visual score | https://github.com/mapbox/pixelmatch |

## Cloud and data

| Tool | Used for | Link |
|---|---|---|
| Cloudflare Workers | one Worker fronts all four agents, holds secrets, routes by hostname | https://developers.cloudflare.com/workers/ |
| Cloudflare Containers | each agent runs in its own scale-to-zero container | https://developers.cloudflare.com/containers/ |
| Cloudflare D1 | the shared run store in the cloud (runs, tasks, eval reports, artifacts) | https://developers.cloudflare.com/d1/ |
| SQLite (`better-sqlite3`) | the same store on a laptop, same SQL | https://github.com/WiseLibs/better-sqlite3 |
| Cloudflare R2 | artifact files under public URLs (synthetic source pages, eval screenshots) | https://developers.cloudflare.com/r2/ |
| Cloudflare Tunnel | Make.com callbacks into a local migration agent | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ |
| Make.com / Workfront Fusion | the low-code migration backend and webhook-only callers | https://www.make.com |

## Dashboard

| Tool | Used for | Link |
|---|---|---|
| Next.js + React | the coordinator dashboard (trigger runs, live activity, evidence) | https://nextjs.org |
| Auth.js with Google OAuth | dashboard sign-in | https://authjs.dev |
| Tailwind CSS + Radix UI | dashboard styling and components | https://tailwindcss.com |

## Build, test, and deploy

| Tool | Used for | Link |
|---|---|---|
| Node.js, TypeScript, Express | every agent | https://nodejs.org |
| Vitest | the four e2e test tiers (real servers, no mocks) | https://vitest.dev |
| GitHub Actions | CI on every push, tag-triggered deploys, and the daily content loop cron | https://docs.github.com/actions |
| Wrangler | builds the four container images and rolls the Worker | https://developers.cloudflare.com/workers/wrangler/ |
| Docker | one image per agent | https://www.docker.com |
| Bruno | API collections for the da.live admin API and the MCP server | https://www.usebruno.com |
| Claude Code | used to build this repo; the prompt logs in [ai-docs/](../ai-docs/) are from those sessions | https://docs.claude.com/en/docs/claude-code/overview |
