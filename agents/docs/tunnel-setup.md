# Tunnel Setup — `cloudflared` Named Tunnel for the A2A Mesh

One short laptop session: stand up a **named** Cloudflare Tunnel (stable hostname —
quick tunnels are explicitly out, their hostnames churn and break Make.com configs,
PRD part-3 "Risks") that exposes only what Make.com needs:

- `POST /hooks/{agent}/{skill}` — the edge webhook shim (Make.com as a *caller*)
- `POST /callbacks/makecom/{taskId}` — the `makecom` backend's return path (Make.com's
  final HTTP module POSTs the final report here)

Everything else stays localhost-only. Pair this file with
[`makecom-scenario-checklist.md`](./makecom-scenario-checklist.md).

> Replace every `<your-domain>` and `<tunnel-hostname>` placeholder with a zone you own
> in your Cloudflare account (e.g. `a2a.example.com`). `cloudflared` syntax below verified
> against current Cloudflare docs (locally-managed tunnel, Go-regex path ingress).

---

## 0. Prereqs

```bash
# macOS
brew install cloudflared
cloudflared --version

# Agents running locally (5 terminals, see agents/README.md)
npm run dev:eval          # :4001
npm run dev:content-gen   # :4002
npm run dev:migration     # :4003   ← also owns /callbacks/makecom/{taskId}
npm run dev:coordinator   # :4004
```

---

## 1. Authenticate

Opens a browser; pick the zone you'll use. Writes `~/.cloudflared/cert.pem`.

```bash
cloudflared tunnel login
```

---

## 2. Create the named tunnel

```bash
cloudflared tunnel create a2a-mesh
```

This prints a **tunnel UUID** and writes the credentials file to
`~/.cloudflared/<UUID>.json`. Note the UUID — you need it in the config and the DNS route.

```bash
cloudflared tunnel list   # confirm a2a-mesh + its UUID
```

---

## 3. DNS route — one hostname

Point a hostname on your zone at the tunnel (creates a CNAME → `<UUID>.cfargotunnel.com`):

```bash
cloudflared tunnel route dns a2a-mesh <tunnel-hostname>
# e.g.
cloudflared tunnel route dns a2a-mesh a2a.<your-domain>
```

All five agents + the callback path live behind this **single hostname**, split by path.

---

## 4. Config file — path-based ingress

Default location: **`~/.cloudflared/config.yml`**. cloudflared matches `ingress`
rules **top-to-bottom**; rules under the same hostname are disambiguated by `path`.
The `path` field is a **Go regexp** (`regexp/syntax`), so a glob like `/hooks/eval/*`
must be written as the regex `^/hooks/eval/.*`. The list **must end** with a catch-all
(`service: http_status:404`).

```yaml
# ~/.cloudflared/config.yml
tunnel: a2a-mesh
credentials-file: /Users/<you>/.cloudflared/<UUID>.json

ingress:
  # --- edge shim: Make.com (and curl/cron/skills) as a CALLER ---
  - hostname: <tunnel-hostname>
    path: ^/hooks/eval/.*
    service: http://localhost:4001
  - hostname: <tunnel-hostname>
    path: ^/hooks/content-gen/.*
    service: http://localhost:4002
  - hostname: <tunnel-hostname>
    path: ^/hooks/migration/.*
    service: http://localhost:4003
  - hostname: <tunnel-hostname>
    path: ^/hooks/coordinator/.*
    service: http://localhost:4004

  # --- makecom backend RETURN path: final-report callback into migration-agent ---
  - hostname: <tunnel-hostname>
    path: ^/callbacks/.*
    service: http://localhost:4003

  # --- required catch-all ---
  - service: http_status:404
```

> Notes
> - Each agent serves the shim only for **its own** `shimAgentId` (eval/content-gen/
>   migration/coordinator). Hitting the wrong agent's path returns the shim's own 404
>   (`unknown agent '…'`), which is correct — keep the path→port map exact.
> - `/callbacks/*` and `/hooks/migration/*` both route to **4003** (the migration agent
>   owns both the migration shim and the makecom callback route, per `index.ts`).
> - The well-known card (`/.well-known/agent-card.json`) and `/health` are public on each
>   agent; the shim and callback are bearer-gated (see §6).

Validate before running:

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://<tunnel-hostname>/hooks/migration/migration.run
```

---

## 5. Run + autostart

Foreground (for the session):

```bash
cloudflared tunnel run a2a-mesh
```

Autostart as a background service (macOS launchd / Linux systemd — installs from
`~/.cloudflared/config.yml`):

```bash
sudo cloudflared service install      # creates + starts the service
# macOS: launchd plist at /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
# manage: sudo launchctl start/stop com.cloudflare.cloudflared
# logs:   sudo launchctl print system/com.cloudflare.cloudflared
# uninstall: sudo cloudflared service uninstall
```

---

## 6. Env vars (set on the migration agent, then restart `dev:migration`)

The `makecom` backend reads these (see `migration-agent/src/backends/makecom.ts` and
`a2a-common/src/server.ts`):

```bash
# 1. From Make.com Scenario A's Custom Webhook trigger (see checklist §A)
export MAKECOM_WEBHOOK_URL="https://hook.<region>.make.com/xxxxxxxxxxxxxxxx"

# 2. So the callbackUrl the agent hands Make.com is publicly reachable.
#    makecom.ts builds: ${MIGRATION_CALLBACK_BASE}/callbacks/makecom/{taskId}
export MIGRATION_CALLBACK_BASE="https://<tunnel-hostname>"

# 3. Shared bearer for the public surface (shim + callback). RECOMMENDED — without it
#    the tunnel exposes unauthenticated POSTs to the internet.
export A2A_EDGE_TOKEN="$(openssl rand -hex 24)"
echo "A2A_EDGE_TOKEN=$A2A_EDGE_TOKEN"   # paste into Make.com modules as: Authorization: Bearer <token>
```

> Auth wiring (verified in `server.ts`):
> - `edgeToken = A2A_EDGE_TOKEN || A2A_MESH_TOKEN`. If either is set, **every** `/hooks/*`
>   POST and the `/callbacks/makecom/*` POST require `Authorization: Bearer <edgeToken>`.
> - So once `A2A_EDGE_TOKEN` is set: Make.com's **inbound** HTTP module (Scenario A,
>   calling our shim) AND Make.com's **final** HTTP module (Scenario A's callback into
>   our `/callbacks/makecom/{taskId}`) must both send `Authorization: Bearer <token>`.
> - `A2A_MESH_TOKEN` separately gates the internal `/a2a` JSON-RPC endpoint; cards/health
>   stay public regardless.

---

## 7. Verification curls

Run after the tunnel is up and `dev:migration` restarted with the env vars.

**a) Card fetch through the tunnel** (public, no bearer — proves routing works):

```bash
curl -s https://<tunnel-hostname>/.well-known/agent-card.json | jq .name
# → "da-migration-agent"
curl -s https://<tunnel-hostname>/health | jq .ok      # → true
```

**b) Dryrun migration through the edge shim** (no Make.com needed — `backend:"dryrun"`
simulates; aim `callbackUrl` at a https://webhook.site URL to watch the push land):

```bash
curl -i -X POST https://<tunnel-hostname>/hooks/migration/migration.run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A2A_EDGE_TOKEN" \
  -d '{
    "sourceType": "webpage",
    "sourceLocation": "https://example.com",
    "site": "my-eds-site",
    "owner": "jackzhaojin",
    "pageSlug": "tunnel-smoke",
    "backend": "dryrun",
    "callbackUrl": "https://webhook.site/<your-uuid>"
  }'
```

Expected immediate response (HTTP **202**, shape from `server.ts` shim):

```json
{ "taskId": "…", "contextId": "…", "state": "submitted" }
```

The completed Task object then arrives as a POST at your `callbackUrl` (A2A push
notification — the full Task JSON, with the `migration-report` artifact in
`artifacts[].parts[].data`). Webhook.site shows the body and headers.

**c) (Optional) Real makecom backend** — same call with `"backend":"makecom"` (or omit
`backend`; makecom is the default) and `MAKECOM_WEBHOOK_URL` set. That fires Scenario A;
its final HTTP module POSTs the report back to
`https://<tunnel-hostname>/callbacks/makecom/{taskId}`. See the checklist.

> `sourceType` must be `"webpage"` or `"pdf"` (contract `migration.run.v1`). Required
> fields: `sourceType, sourceLocation, site, owner, pageSlug`.
