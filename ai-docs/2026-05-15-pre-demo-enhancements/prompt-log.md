# Pre-Demo Enhancements — Prompt Log

**Agent**: claude-code
**Repo**: `azure-da-mcp`
**Theme**: Retouching the app to get it back into demo-ready state ahead of an upcoming demo. Covers production bug fixes on the deployed eval app, version bumps & releases, and authoring the `da-live-author-playwright` skill that swaps out the Make.com-only content-migration flow for a more flexible block-library authoring skill.

---

## Session 1: Demo-stand-up & v1.0.2 release (May 12, 2026)

### Prompt 1: Sample links broken on deployed batch eval (07:53 PM)

> For some rason for the content author eval http://157.151.152.16:3000/evaluate/batch deployed, all 4 samples link doesn't work. can you take a look and fix? use playwright cli skill

-> Response: Reproduced the broken sample links on the Oracle deploy; root cause was `public/` not being copied into the Docker image.
-> Action: Patched `content-authoring-eval/Dockerfile` to COPY `public/`. (commit `44f33c1`)

### Prompt 2: Gitignore cleanup (07:55 PM)

> can you add '/Users/jackjin/dev/azure-da-mcp/.github' to gitignore? also git rm '/Users/jackjin/dev/azure-da-mcp/.playwright-mcp' all files

-> Response: Pushed back on ignoring `.github` (would untrack the workflows); proposed ignoring playwright artifact dirs only.
-> Action: Held off on the destructive change.

### Prompt 3: Correction — playwright-cli only (07:56 PM)

> do not add github to gitignore? what? add '/Users/jackjin/dev/azure-da-mcp/.playwright-cli' to gitignore

-> Response: Added `.playwright-cli/` and `.playwright-mcp/` artifacts to root `.gitignore`.
-> Action: Updated `.gitignore`, untracked stray PNGs. (commit `357f8ab`)

### Prompt 4: Self-correction (07:56 PM)

> sorry it was my fault, i dragged the wrong thing

-> Response: Acknowledged, no rework needed.
-> Action: None.

### Prompt 5: Commit (07:57 PM)

> /jack-git-commit

-> Response: Created Conventional Commit for the Dockerfile fix + gitignore.
-> Action: 2 commits on `main`.

### Prompt 6: How did Oracle releases work before? (07:58 PM)

> i think in github i was able to do releases to oracle somehow by verisoning it in github or creating a release in github, can you see what i did? use gh and feelfree to look in otherp laces

-> Response: Inspected `gh release list` + `.github/workflows/`; confirmed `deploy-content-authoring-eval.yml` fires on `v*` tags and deploys to Oracle.
-> Action: Read workflow files, summarized release mechanics.

### Prompt 7: Make both v1.0.1 (08:16 PM)

> ya let's officially make both 1.0.1, feel free to version in file like your'e suggesting

-> Response: Proposed lockstep `package.json` version + matching git tag.
-> Action: Bumped versions, prepped tag.

### Prompts 8-9: Branch confusion (08:18 PM)

> wait uhmm... why do i have a bunc hf ofiles not checked in? that's weird
>
> no, you switched branches

-> Response: Realized I'd switched to `release/1.0`; the "uncommitted" files were just main-only changes.
-> Action: Switched back to `main`.

### Prompt 10: Tag main with 1.0.2 (08:19 PM)

> sorry keep on main please, and tag main with 1.0.2

-> Response: Bumped to 1.0.2 directly on `main` (skipping 1.0.1 since it never shipped clean).
-> Action: `chore(content-authoring-eval): bump version to 1.0.2` (commit `880052e`), tagged `v1.0.2`.

### Prompt 11: Why is release/1.0 still around? (08:20 PM)

> wait lol ok - sorry i haven't touched this branch in a while - why do we have the release/1.0 branch again?

-> Response: Explained it was leftover from an older gitflow-style attempt; recommended deleting it and going trunk-based.
-> Action: Discussed strategy.

### Prompt 12: Push 1.0.2 from main (08:22 PM)

> can you push whatever is on 1.0.2 to cloud? like main right now, not a branch doesn't exist anymore

-> Response: Merged `release/1.0` into `main`, deleted the branch, pushed tag.
-> Action: Merge commit `72172f1`, `git push origin v1.0.2`, deploy ran on Oracle.

### Prompt 13: Create GitHub release (08:24 PM)

> can you create a release from the version again?

-> Response: Created `gh release create v1.0.2 --generate-notes`.
-> Action: Release published.

### Prompt 14: Trunk-based going forward (08:25 PM)

> ya let's just do main for now and it's fairly more standard, go ahead and update the documentation

-> Response: Authored `RELEASES.md` documenting trunk-based + lockstep versioning.
-> Action: `docs: update CLAUDE.md and RELEASES.md for trunk-based release strategy` (commit `406f4a5`).

### Prompt 15: Refresh all docs (08:27 PM)

> /init update all the documentation to the latest

-> Response: Rewrote root `CLAUDE.md` with the 5-subproject layout, release section, navigation tips.
-> Action: Updated `CLAUDE.md`, `README.md`. ✅ v1.0.2 shipped to Oracle.

---

## Session 2: Playwright fixes, v1.0.3 release, da-live skill (May 14, 2026)

### Prompt 1: Resume (10:17 AM)

> /resume

-> Response: Picked the session back up.
-> Action: None.

### Prompt 2: Playwright deploy error (10:17 AM)

> Looks like i got this error [Image #1] something with the image and playwright not getting deployed properly locally?

-> Response: Diagnosed: Docker image was missing chromium-headless-shell (Playwright >=1.49 needs both).
-> Action: Patched Dockerfile to `apk add chromium chromium-headless-shell`. (commit `25651ec`)

### Prompt 3: Tag and push v1.0.3 (10:22 AM)

> Can you tag and push v1.0.3?

-> Response: Bumped to 1.0.3, tagged, pushed.
-> Action: `c8269c8` -> `bf308b1` series of fix commits + `63616b7` version bump + `v1.0.3` tag pushed.

### Prompt 4: Monitor deploy (10:41 AM)

> can you monitor?

-> Response: Watched the GHCR build + Oracle SSH deploy via `gh run watch`.
-> Action: Confirmed image pushed, deploy step healthcheck passed.

### Prompt 5: Still erroring + add version badge (10:52 AM)

> still got this error tho - [Image #2] also can we make a UI enhacnement to show the version number on the page somewhere elegantly? [Image #3] [Image #4]

-> Response: Found deeper Playwright path issue — app and `@playwright/mcp` were sharing a browser cache and stomping each other.
-> Action: Started a series of Dockerfile/runtime fixes (`c8269c8`, `f189d58`, `bf308b1`) + planned version badge for the eval UI.

### Prompt 6: More research on the Playwright issue (10:53 AM)

> do a bit more research please on this issue, do some rsearching and searching

-> Response: Researched Playwright 1.49+ browser-cache layout, confirmed need for separate `PLAYWRIGHT_BROWSERS_PATH` per binary.
-> Action: Read Playwright docs, GitHub issues.

### Prompt 7: Remote control (11:54 AM)

> /remote-control

-> Response: Hooked into the remote-control skill for debugging the deployed Oracle instance.
-> Action: Session ran through dashboard / live troubleshooting.

### Prompt 8: HAR upload after single eval (12:40 PM)

> yay that worked - ok [Image #5] for some reason after running a single eval, i uploaded the har '/Users/jackjin/dev/azure-da-mcp/local-only/157.151.152.16.har'

-> Response: Inspected HAR; spotted client-side redirect storm post-eval — `setState` was being called during render after navigation.
-> Action: Wrote `fix(content-authoring-eval): wrap post-eval navigation in useEffect to avoid render-time setState` (commit `a010ef7`).

### Prompt 9: Dashboard fine (12:41 PM)

> Oh i should add that dashboard looks fine

-> Response: Acknowledged; narrowed scope to the post-eval redirect only.
-> Action: None.

### Prompt 10: Duplicate findings per run (03:42 PM)

> it wrote in like, a TON of findings per run or did we run it multiple times? we're talking like 20-30 entries, can we makes ure it only saves once per run? [Image #6]

-> Response: Confirmed it was the render-time setState bug — useEffect was firing the save logic on every re-render. Same fix as Prompt 8.
-> Action: Verified `a010ef7` resolves this too.

### Prompt 11: Clear local storage (03:43 PM)

> if it's local storage i can clear it out manually, one second

-> Response: Confirmed history is in localStorage; user can clear via devtools.
-> Action: None. ✅ v1.0.3 fully stable on Oracle.

### Prompt 12: Re-read make.com prompts, plan a generic skill (04:32 PM)

> first look through '/Users/jackjin/dev/azure-da-mcp/README.md' and '/Users/jackjin/dev/azure-da-mcp/make-dot-com/v1-content-migration/agent-init-prompt-full.md' and '/Users/jackjin/dev/azure-da-mcp/make-dot-com/v1-content-migration'.  This was originally fed into make.com but ideally should be more generic, don't do anything yet but read files into context, eventually we'll have a converastion And you'll create one single skill to use two MCP servers. One is the playwrightMCP, as well as the oth[er da.live MCP]

-> Response: Read all 3 sources; summarized the Make.com flow (PDF -> deterministic prompt -> da.live API).
-> Action: Context-only, no edits.

### Prompt 13: Skill-vs-Make.com design discussion (04:36 PM)

> Oh yeah, just a few thoughts and having a conversation with you. Yeah, so in make.com, right, things has to be fairly deterministic. Whereas AI skills, the user will need to either provide a set of PDFs by uploading to Cloud UI where you know if it's local, upload it to Cloud using Claude code.So this one doesn't need to be as deterministic at all. so even this could be more genic from a skills perspective.  Yep, yeah we AI should hopefully leverage the skills it has, baked in, right, make.com.

-> Response: Aligned on: skill version can be agentic, leverage Claude's built-in tools (Read, WebFetch, image vision) instead of Make.com modules; defer skill scope.
-> Action: Sketched skill outline.

### Prompt 14: Find self-hosted Playwright server (04:45 PM)

> good question - i think we deployed playwright mcp somewhere, mm... i wonder, '/Users/jackjin/dev/jack-dev-server-configs/server/oracle-arm4-free-vm' can you look if i'm hosting my own playwright cloud server?

-> Response: Searched server configs; found Playwright MCP is on the **AWS t2** box, not Oracle.
-> Action: Read `~/jack-dev-server-configs/server/aws-t2-free-vm/`.

### Prompt 15: Curl test the AWS box (04:47 PM)

> ya you're correct it's the aws t2, does it have the server info and can hyou test it really quick with a quick curl?

-> Response: Curl'd; got access denied.
-> Action: `curl http://<aws-t2>:port/` returned 403.

### Prompt 16-21: AWS t2 outage & recovery (04:51 PM - 05:02 PM)

> what happened here? access denied?
> it says it's running though
> ya can you readjust to the new dns or ip?
> can you follow '/Users/jackjin/dev/jack-dev-server-configs/server/aws-t2-free-vm' and attempt to ssh in?
> maybe let me reboot, mm...
> what was hosting on this thing again?
> still not connecting, mm...
> OK after some time the server is back up! can you try again?

-> Response: Walked through SSH attempts, IP/DNS mismatch, user rebooted AWS instance, confirmed services back up.
-> Action: SSH'd in once server was up, verified Playwright MCP container running.

### Prompt 17: CloudFront routing (05:04 PM)

> https://d3chtew0dmpv41.cloudfront.net/ has https routing, and uhmm... can you look and see if it's suppsoed to be https://d3chtew0dmpv41.cloudfront.net/ or https://d3chtew0dmpv41.cloudfront.net/mcp?

-> Response: Confirmed correct MCP endpoint path with curl + nginx config.
-> Action: Verified routing.

### Prompt 18: Azure Function MCP endpoint (05:09 PM)

> it's https://jack-mcp-azure-ai-function.azurewebsites.net/api/mcp-streamable

-> Response: Recorded the correct da.live MCP URL for skill use.
-> Action: Captured endpoint.

### Prompt 19: Drop "migration" framing, embrace block library (05:12 PM)

> oh let's drop the whole migrating thing, i like that it's creating content and bulk cerating content. migration is one of the use cases, but with block library it should be able to add a block or remove a block or whatever from da live with the mcp.  As with the skill, it's really important in skill creator to not put everythign in SKILL.md, have references to show and demonstrate content authoring capabilities.

-> Response: Redesigned the skill: it's an **authoring** skill (create, modify, add/remove blocks), with migration as a sub-case. SKILL.md stays small; reference files carry block-library examples.
-> Action: Outlined skill structure with separate references.

### Prompt 20: Skill name & green light (05:18 PM)

> da-live-author-playwright maybe, and we're good to go!

-> Response: Locked in name `da-live-author-playwright`, started building.
-> Action: Created skill directory structure under `~/.claude/skills/`.

### Prompt 21: Test against real da.live page (06:17 PM)

> Ya let's give it a test! i entered in da mcp already. there should be some content in https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/migration-2/da-live-authoring-platform-modern-web

-> Response: Used both MCPs to fetch the source, manipulate blocks, save back.
-> Action: Exercised create/modify operations end-to-end. (commit `2833275`)

### Prompt 22: Move skill into repo + preview-publish step (06:27 PM)

> oh uhmm... let's move the skills awayf rom my ~/.claude and into '/Users/jackjin/dev/azure-da-mcp''s .claude folder when done. also uhmm... skill needs to preview publish to .page via da live mcp for the playwright change to take effect, itd be at https://main--da-live-postal-2025-07--jackzhaojin.aem.page/ (note the site and domain)

-> Response: Relocated skill to `azure-da-mcp/.claude/skills/da-live-author-playwright/`, added preview-publish step before Playwright validation.
-> Action: Moved files, updated SKILL.md to call `preview_publish_dalive_content` then validate on `.aem.page`.

### Prompt 23: Example URL (06:28 PM)

> for example the page you ended is at https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-2/da-live-authoring-platform-modern-web when preview published (note the .page)

-> Response: Added the URL-shape mapping (`da.live/edit#/owner/site/path` -> `main--site--owner.aem.page/path`) to the skill reference.
-> Action: Documented URL transformation.

### Prompt 24: Package the .skill file (06:29 PM)

> /skill-creator generate the .skill file from '/Users/jackjin/dev/azure-da-mcp/.claude/skills/da-live-author-playwright' so i can upload it, sorry, help me understand what he issue is a bit better

-> Response: Used `/skill-creator` to bundle the skill into an uploadable `.skill` zip; clarified its packaging vs. live-install difference.
-> Action: Generated `da-live-author-playwright.skill`.

### Prompt 25: Ignore .skill files (06:30 PM)

> oh add .skill to .gitignore project wide so the .skill zip file is not checked in

-> Response: Added `*.skill` to root `.gitignore`.
-> Action: Edited `.gitignore`.

### Prompt 26: Metadata-as-table fix (06:31 PM)

> also metadata is a table i think? look up latest EDS thing and this is literally print out as content. [Image #5]

-> Response: Confirmed EDS metadata must be a `<table>` with header "metadata" so the EDS pipeline parses it into page metadata; otherwise it renders inline.
-> Action: `fix(da-live-author-playwright): switch metadata block to <table> form per EDS spec` (commit `a7ade2d`).

### Prompt 27: Commit (06:43 PM)

> amazing - let's commit

-> Response: Staged + committed skill + metadata fix.
-> Action: Commits `2833275` and `a7ade2d` pushed.

### Prompt 28: Log the session (06:45 PM)

> /conversation-logger to '/Users/jackjin/dev/azure-da-mcp/ai-docs/2026-pre-demo-enhancements' with today's timestamp with today and yesterday's work (or the day before), we did some retouching of the application amke sure it's back in demo state

-> Response: Wrote this log.
-> Action: Created `ai-docs/2026-pre-demo-enhancements/prompt-log.md`. ✅

---

**Combined Outcome**: Demo-ready. Eval app stable at v1.0.3 on Oracle (`http://157.151.152.16:3000`), all 4 sample links + post-eval flow + duplicate-history bug fixed, Playwright cache split correctly. New `da-live-author-playwright` skill replaces the Make.com-only migration story with a flexible block-library authoring flow against the Azure Functions MCP + Playwright MCP.
