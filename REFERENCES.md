# References

Everything in one place: the code, the working demo, the documentation, and the tools this is built on.

## GitHub

- **This repo** - the agent platform (coordinator, migration, eval, content generator), the da.live MCP server, and the docs: https://github.com/jackzhaojin/azure-da-mcp
- **The demo site** - the EDS site the agents author into, plus the 2004-style legacy blog they migrate from (`/docs`): https://github.com/jackzhaojin/adapt-to-2026-demo
- **The migration skill** - the same skill file runs under Kimi and Claude: [`.claude/skills/da-live-author-playwright/`](./.claude/skills/da-live-author-playwright/)

## Working demo

| What | Link |
|---|---|
| Before: Katie's Travel Journal, a hand-built 2004 blog | https://www.jackzhaojin.com/adapt-to-2026-demo/ |
| After: the Wilderness Journal on Edge Delivery Services (preview) | https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ |
| One article, before | https://www.jackzhaojin.com/adapt-to-2026-demo/articles/inca-trail.html |
| The same article, after | https://main--adapt-to-2026-demo--jackzhaojin.aem.page/demo1-september/inca-trail |
| Block library the agent reads before authoring | https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/blocks/ |
| Dashboard (Google sign-in; wakes in about 30 seconds) | https://content-factor-dash.jackzhaojin.com |
| Coordinator Agent Card (A2A discovery) | https://content-factory.jackzhaojin.com/.well-known/agent-card.json |
| da.live authoring (da.live login needed) | https://da.live/#/jackzhaojin/adapt-to-2026-demo |
| Agent memory page in da.live (da.live login needed) | https://da.live/edit#/jackzhaojin/adapt-to-2026-demo/ai-content/memory |

## Documentation

Start here:

- [**docs/architecture/**](./docs/architecture/) - the system diagram by diagram, including how the agentic parts work, A2A and MCP, the cloud architecture, and dev ops
- [agents/README.md](./agents/README.md) - run it, deploy it, test it, the data model

Go deeper:

- [ai-docs/2026-09-08-model-assessment-with-memory/](./ai-docs/2026-09-08-model-assessment-with-memory/) - five models, same source, same judge, with agent memory on vs off
- [ai-docs/2026-08-29-model-assessment/](./ai-docs/2026-08-29-model-assessment/) - the baseline five-model benchmark
- [ai-docs/2026-06-17-v2.2-agentic-loop/](./ai-docs/2026-06-17-v2.2-agentic-loop/) - the daily content loop and the agent-human collaboration model
- [ai-docs/2026-06-11-v2.1-hardening-sprint/02-eval-scoring-honesty.md](./ai-docs/2026-06-11-v2.1-hardening-sprint/02-eval-scoring-honesty.md) - why every score records how it was made
- [ai-docs/2026-06-08-a2a-platform-v2.0/](./ai-docs/2026-06-08-a2a-platform-v2.0/) - the v2.0 build report
- [ai-docs/README.md](./ai-docs/README.md) - index of every plan and build report
- [CHANGELOG.md](./CHANGELOG.md) - release-by-release history

## Tools used

The full list, grouped by job (protocols, models, agent runtimes, content platform, quality checks, cloud, build and deploy): [docs/tools-used.md](./docs/tools-used.md)

Short version: A2A and MCP for the protocols, Kimi K3 and Claude for the models, opencode and the Claude Agent SDK to run them, Playwright MCP and axe-core for checks, da.live and Edge Delivery Services as the target, and Cloudflare Workers, Containers, D1, and R2 to host it.
