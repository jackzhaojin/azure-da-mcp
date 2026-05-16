# Set hosts for da-live-postal-2025-07 — 2026-05-16

## Goal

Fix da.live Preview/Publish button on https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/... which currently navigates to `https://undefined/<path>`.

**Root cause** (confirmed by GET steps below): the site `da-live-postal-2025-07` has no entry in the AEM Configuration Service under org `jackzhaojin`. da.live reads `cdn.preview.host` (defaulting to `*.aem.page`) from the site's config service record; when the record doesn't exist, the lookup returns nothing and JS stringifies the missing host as `"undefined"`.

**Fix**: create the site config via `PUT https://admin.hlx.page/config/jackzhaojin/sites/da-live-postal-2025-07.json` with a minimal payload (code source + content source). `cdn.preview.host` / `cdn.live.host` are intentionally omitted — they inherit the org/global defaults of `*.aem.page` / `*.aem.live`, which is what we want.

## Context

- **Org**: `jackzhaojin` (config exists, version 2, admin user `jackzhaojin@gmail.com`)
- **Site**: `da-live-postal-2025-07` (404 in config service — does not exist)
- **GitHub repo**: `jackzhaojin/da-live-postal-2025-07` (assumed — `https://main--da-live-postal-2025-07--jackzhaojin.aem.page/` resolves, confirming Code Sync wired up the code-bus already)
- **DA content source**: `https://content.da.live/jackzhaojin/da-live-postal-2025-07/`
- **Sibling reference**: `jack-da-live-harness-built` (same owner, same shape, same content type `markup`)

## Auth

DA IMS JWT from `~/.aem/da-token.json` works against `admin.hlx.page` as `Authorization: Bearer ${AUTH_TOKEN}` (verified — `GET /profile` → 200, client_id `darkalley`). Token TTL is short — re-source `.env-setup.sh` (or run `npx github:adobe-rnd/da-auth-helper token`) if calls start returning 401.

## Steps

### Step 1 — Discovery (read-only) — ✅ COMPLETED

- **1.1** `GET /config/jackzhaojin.json` → HTTP 200, org exists
- **1.2** `GET /config/jackzhaojin/sites/da-live-postal-2025-07.json` → **HTTP 404** (root cause confirmed)
- **1.3** `GET /config/jackzhaojin/sites.json` → 2 sibling sites listed, target NOT present
- **1.4** `GET /config/jackzhaojin/sites/eds-doc-authoring.json` → schema reference (Google Drive content)
- **1.5** `GET /config/jackzhaojin/sites/jack-da-live-harness-built.json` → schema reference (da.live content — closest match)

### Step 2 — Create site config (mutation, requires approval)

- **OBJECTIVE**: Register `da-live-postal-2025-07` in the AEM Config Service under org `jackzhaojin` so da.live's Preview button can resolve a hostname.
- **Endpoint**: `POST https://admin.hlx.page/config/jackzhaojin/sites/da-live-postal-2025-07.json`
  - Method corrected from PUT → POST after reading `adobe/helix-tools-website/scripts/helix-admin.js` (`config().update() → POST`, `.create() → PUT`). The "Add Site" modal in tools.aem.live uses `.update()`.
- **Payload file**: `execution-files/step-2.1-create-site-config-request.json` (verified identical to `buildSiteConfig({}, codeSrc, contentSrc)` output from `tools/site-admin/helpers/utils.js`)
- **Acceptance**: HTTP 200 or 201, response echoes a config with `version: 1` and the submitted code/content blocks.

### Step 3 — Verify — ✅ COMPLETED

- **3.1** Re-GET site config → HTTP 200, `version: 1`, `contentBusId: 5eb4108d…`, code+content blocks match request payload
- **3.2** Re-GET org sites list → HTTP 200, 3 entries (target now first alphabetically)
- **3.3** ✅ User confirmed: Preview button now navigates to `https://main--da-live-postal-2025-07--jackzhaojin.aem.page/...` correctly
- **3.4** ✅ Bonus: AEM Sidekick now opens the content repo from the edit view (was broken before — same root cause)

### Step 2 — ✅ COMPLETED

- **2.2** POST → HTTP 200, server returned full config with assigned `contentBusId` and `version: 1`

## Risks & rollback

- **Risk**: payload schema mismatch → likely 4xx, no state change. Investigate, propose corrected payload, re-approve.
- **Risk**: server expects PUT instead of POST → fall back to PUT (same URL, same payload). Unlikely given helper source uses POST.
- **Rollback**: `DELETE /config/jackzhaojin/sites/da-live-postal-2025-07.json` removes the record. Safe because the only ambient state we touch is config-service registration; code-bus / content-bus are managed elsewhere and unaffected.

## Files

- `.env-setup.sh` — env vars and token loader (gitignored via `local-only/`)
- `execution-files/step-1.*.json` — discovery responses
- `execution-files/step-2.1-create-site-config-request.json` — request payload
- `execution-files/step-2.2-create-site-config-response.json` — POST response (HTTP 200)
- `execution-files/step-3.*.json` — verification responses

---

## Retrospective — 2026-05-16

### Outcome
One POST to `admin.hlx.page/config/jackzhaojin/sites/da-live-postal-2025-07.json` fixed:
- da.live Preview button (was → `https://undefined/...`)
- da.live Publish button (same root cause)
- AEM Sidekick navigation to the content repo (bonus — wasn't on the original symptom list, also broken by the missing config-service record)

Total time from "what's broken?" to confirmed fix: ~1 work session. Mutation: a single 200 OK on a minimal `{ code, content }` payload.

### Diagnostic chain
What worked: walking the layer stack from outside-in, *with* hard evidence at each step instead of guessing.

1. URL inspection — `https://undefined/<path>` → host-string came back undefined, not a routing issue
2. Layer triage — initial guess (`.da/config.json` site sheet) was **wrong**; user's empty sheet was a red herring
3. Docs read — the `cdn.preview.host` default-to-`*.aem.page` line in aem.live docs is what reframed the search toward AEM Config Service
4. `GET /config/{org}/sites/{site}.json` → 404 = smoking gun
5. `GET /config/{org}/sites.json` → confirmed missing from org's site list (not a permissions issue)
6. `GET sibling site configs` → cribbed the schema from `jack-da-live-harness-built` instead of guessing
7. Source-code verify — pulled `adobe/helix-tools-website/tools/site-admin/helpers/utils.js` to confirm the canonical helper payload matches our draft byte-for-byte

### Surprises / things worth remembering

- **DA Sidekick depends on the same config-service record.** We only chased Preview/Publish; Sidekick happened to share the same broken dependency. Useful: a missing AEM Config Service entry breaks *multiple* DA-side UX surfaces, not just one button.
- **"Newer helper" intuition was wrong** — the tools.aem.live Add Site modal sends the *same* minimal `{ code, content }` payload the older sites have. Server-side defaults handle the rest (`cdn.preview.host`, etc.). User's hunch that newer sites would have richer configs didn't hold; the helper is intentionally minimal.
- **POST vs PUT.** aem.live docs example said PUT; helper source uses POST (`.update() → POST`, `.create() → PUT`, helper calls `.update()`). Trust source over docs for verb selection.
- **Auth surprise: DA IMS JWT is accepted by `admin.hlx.page` via `Authorization: Bearer`.** The hlx-admin-api-executor skill assumes `X-Auth-Token` (cookie-based hlx login). Both work on admin.hlx.page; the IMS path is friction-free since `~/.aem/da-token.json` is already populated by `da-auth-helper`. **No need to do the cookie-extraction dance** when a DA token is around.
- **Tokens are 24h.** A near-expired cached token (~5 min left) bit us mid-script. The cache reflects the JWT's actual expiry, not a fixed offset. Refresh with `npx github:adobe-rnd/da-auth-helper token` (browser interactive, ~10 sec).

### What to do differently next time
- **Start with the right config layer.** I burned a turn proposing `.da/config.json` edits. Decision rule: if the symptom is preview/publish *navigation* (URL construction) or Sidekick behavior, it's the AEM Configuration Service. If it's DA-only UI behavior (block library, link rewrites, save behavior inside da.live), then `.da/config.json`.
- **Crib schemas from working siblings before reading docs.** GETting a working same-org site config gave the canonical payload in 30 seconds; the docs trawl took longer and was less precise.
- **Verify helper behavior at source.** `adobe/helix-tools-website` is the authoritative source for what tools.aem.live actually sends. Faster than guessing from docs which lag.

### Reusable bits for future hlx-admin work
- `.env-setup.sh` pattern (DA token loader → `Authorization: Bearer`) generalizes; copy into new dated dirs.
- The skill's GET/SET/GET pattern is overkill here (mutation was a single create), but the Change Justification block was useful for catching the PUT→POST correction *before* execution.
- Skill assumption "X-Auth-Token only" is incomplete — DA IMS Bearer also works. Worth a PR back to the skill notes.
