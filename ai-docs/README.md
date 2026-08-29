# ai-docs/ - Planning PRDs and as-built reports

Dated folders, one per initiative: the plan going in, the as-built report coming out, plus prompt logs and diagrams. This directory is **public**; pre-pivot private material lives outside the repo. Newest first.

For the release-by-release view, see the root [CHANGELOG.md](../CHANGELOG.md).

| Folder | What it is |
|---|---|
| [2026-08-29-model-assessment/](./2026-08-29-model-assessment/) | **Five-model migration benchmark** (Kimi K3/K2.7, Claude Sonnet 5/Opus 5/Haiku 4.5), same prompt, same judge, redesign-mode eval. Verdict: K3 confirmed as the migration default. Produced by `npm run model-matrix` (v2.8). |
| [2026-08-02-migrate-website-demo/](./2026-08-02-migrate-website-demo/) | UX plan for the "migrate a real page" dashboard lane (multi-URL fan-out, folder override, per-run Kimi model) - shipped as v2.6. |
| [2026-06-27-v2.4-wilderness-retarget/](./2026-06-27-v2.4-wilderness-retarget/) | Prompt log for the v2.4 retarget to the `adapt-to-2026-demo` Wilderness Journal site (site profiles, /ai-content vs /ai-articles IA split) and the v2.5 quality eval mode. |
| [2026-06-17-v2.2-agentic-loop/](./2026-06-17-v2.2-agentic-loop/) | v2.2 agentic daily loop: design, as-built, prompt log, and the agent-human collaboration thesis behind it. |
| [2026-06-14-jackzhaojin-domain-migration/](./2026-06-14-jackzhaojin-domain-migration/) | Moving the mesh's public hostnames from `*.xpri.ai` to `content-factory*.jackzhaojin.com`. |
| [2026-06-11-v2.1-hardening-sprint/](./2026-06-11-v2.1-hardening-sprint/) | v2.1 hardening: eval scoring honesty, local agentic eval, live-run UX and evidence, v1 UI parity + `agents/ui` retirement, bulk source-to-target eval, demo script. |
| [2026-06-08-a2a-platform-v2.0/](./2026-06-08-a2a-platform-v2.0/) | **The v2.0 as-built report** (read this first for the platform): architecture, sequence diagrams, Cloudflare deployment chronicle (M5), testing, the opencode/Kimi backend, the dashboard. |
| [2026-06-05-a2a-agent-platform/](./2026-06-05-a2a-agent-platform/) | **The v2.0 PRD** - decisions D1-D6 (Cloudflare D1+R2, official A2A SDK, one server per agent, freeze v1 as backup, deploy last), part-by-part plan, Kimi/opencode findings. |
| [2026-05-16-s2s-oauth/](./2026-05-16-s2s-oauth/) | v1.1: server-side Adobe IMS S2S auth for the `functions/` MCP server (architecture diagram + prompt log). |
| [2026-05-15-pre-demo-enhancements/](./2026-05-15-pre-demo-enhancements/) | v1.x pre-demo polish prompt log for the eval app. |

## Conventions

- **Folder name**: `YYYY-MM-DD-<slug>`, dated by when the initiative started.
- **Contents**: a `README.md` when the folder is a report meant to be read (add one for anything load-bearing); `prompt-log*.md` for session transcripts; `.excalidraw` + exported `.png` for diagrams.
- Plans (PRDs) are written before the work and left unedited; as-built reports record what actually shipped, including failures and detours.
