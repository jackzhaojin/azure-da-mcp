# Migrate-the-Website On-Stage Demo — UX Plan (2026-08-02)

**Goal**: demo the v2.0 A2A mesh migrating a REAL legacy website into Edge Delivery Services,
live on stage at adaptTo() Sept 2026 — through the coordinator dashboard, not a terminal.

## The cast

| Piece | What | Why it works on stage |
|---|---|---|
| **Source** | [Katie's Travel Journal](https://www.jackzhaojin.com/adapt-to-2026-demo/) — a hand-built 2004-style personal travel blog (10 articles, table layouts, "best viewed at 800×600") on GitHub Pages | Instantly legible as "legacy". It's ours: stable, safe, no rights issues. The content (backcountry travel) maps perfectly onto the Wilderness Journal voice |
| **Target** | da.live `adapt-to-2026-demo` (Wilderness Journal), folder **`travel-journal-<demo-date>`** | Dated folder per demo day: rehearsals never collide with the live demo, and nothing pollutes `/ai-content` (reference corpus) or `/ai-articles` (daily drafts) |
| **UI** | Coordinator dashboard → **"Migrate a real page"** lane (shipped 2026-08-02) | Paste N URLs → one branch per URL → live activity + branch grid + fidelity scores. The audience watches agents work |
| **Engine** | `opencode` backend, Kimi K3 (per-run model dropdown) | The "non-Anthropic model behind the same A2A contract" story |

## The beats (~8 min segment)

1. **(30s) The "before".** Browser tab on Katie's Travel Journal. Scroll it. Let the 2004
   aesthetic land — hit F12 and show the `<table>` layout for the older crowd.
2. **(30s) The "after" reference.** `/ai-content/stories/chasing-sunsets` — "the mesh learns
   modern block conventions from this hand-built corpus; it never writes to it."
3. **(1 min) The trigger.** Dashboard → route *Migrate a real page*. Paste 2–3 article URLs
   (pre-copied). Target folder `travel-journal-<demo-date>`. Backend `opencode`, model `k3`,
   *Evaluate fidelity* ON → the form shows the inferred route `migrate → evaluate`.
   Narrate: goal `auto`, one branch per URL, per-URL slugs.
4. **(30s) Fire it.** Live activity starts streaming: `K3 → skill da-live-author-playwright`,
   `K3 → playwright_browser_navigate`, `K3 → dalive_save_dalive_content`… Narrate the A2A hops:
   coordinator → migration agent → opencode/Kimi → da.live MCP (S2S) → aem.page preview.
5. **(3 min) THE GAP — don't wait.** A K3 page migration runs 13–20 min. Cooking-show pattern:
   switch to **the morning's completed run** (same lane, same folder). Walk the branch grid —
   per-article migrate confidence + eval scores, the evidence panel (dimension scores,
   screenshots, findings), variance stats.
6. **(1 min) The reveal.** Open a migrated page on `aem.page` side-by-side with its legacy
   source. Same words, 22 years newer.
7. **(30s) Close the loop.** Flip back to the live run — tool calls still streaming — "this one
   lands the same way in ~10 minutes; check it at Q&A." (Do actually check it at Q&A.)

## Timing & risk ladder

- **Never block the stage on a live Kimi turn.** Fire live, show finished. The store-backed run
  detail page ALWAYS renders (survives restarts) — it is the safe artifact.
- **Morning-of checklist**: run the same multi-URL migration into `travel-journal-<demo-date>`;
  verify the aem.page previews render; bookmark that run's detail page; keep one browser tab per
  beat pre-opened.
- **Kimi quota** is ~1 real migration run/day on the Kimi-for-Coding sub — the rehearsal and the
  live run may compete. Mitigations: keep the live run to 1–2 URLs; confirm 2-runs/day headroom
  the week before; `makecom` backend as the standby engine.
- **Cloud mesh cold starts**: containers scale to zero — pre-warm all four `/health` endpoints
  ~10 min before the segment (the daily loop's pre-warm step does exactly this).
- **Fallback ladder**: live Kimi run → morning's completed run (always works) → `dryrun` live
  (instant, real A2A transactions, honestly framed as simulation).
- **Transient failure is part of the demo**: a failed branch shows WHY (runs.error + progress
  trail) and **Run again** re-fires the exact config (incl. folder/model since 2026-08-02).
  If a branch dies on stage, that's the observability slide — retry and move on.

## Shipped today (2026-08-02)

- Dashboard **"Migrate a real page" lane**: multi-URL textarea (one branch per URL), source type
  (webpage/pdf), optional page slug (single-URL), optional **target folder** override, backend +
  per-run **Kimi model** dropdown, *evaluate-after* toggle showing the inferred route.
- Coordinator: `sources[]` + `folder` in `coordinate.run.v1`; per-URL slug derivation
  (`…/kilimanjaro.html` → `kilimanjaro`); folder override beats the site profile; eval stays
  `fidelity` mode for real-source routes; pdf sourceType now reaches the eval stage.
- **Run again** round-trips the migrate-lane fields (sources/sourceType/pageSlug/folder).
- Stale site default (`da-live-postal-2025-07`) → `adapt-to-2026-demo`.

## Gaps to close before September (ranked)

1. **Side-by-side compare view** on the run detail (iframe: legacy source | migrated preview) —
   the money shot without leaving the dashboard.
2. **"Open preview" affordance per branch** — target link with an external-link icon, visible
   the moment migration completes (today the target URL is a plain link post-completion).
3. **"Migrate the website" literally**: paste the site root → crawl same-origin article links →
   prefill the URL list (bounded, with a review step). Turns 10 copy-pastes into 1.
4. **Demo preset button** (localStorage): one click fills Katie's URLs + folder-of-the-day.
5. **Projector pass**: run detail at 1920×1080 from the back of a room — bump live-feed font.
6. **Cloud parity check**: this lane through `content-factor-dash.jackzhaojin.com` against the
   deployed mesh (needs the next v2.x tag deploy).
