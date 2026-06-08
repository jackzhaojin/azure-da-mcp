# R2 artifact storage — setup

Artifacts (synthetic source pages now; eval screenshots next) are stored in
**Cloudflare R2** and served publicly over `r2.dev`. This is the durable,
public-fetch home that survives container scale-to-zero (D3) and lets the
external Make.com scenario fetch generated sources.

**Local fallback is automatic.** With no R2 env set, agents write to a local
`./output` dir served via `staticRoutes` — same URL contract. The closed loop
and CI run fully local with zero credentials. R2 only kicks in once the env
below is present.

## What already exists (provisioned 2026-06-08)

| Thing | Value |
|-------|-------|
| Bucket | `a2a-agents-artifacts` |
| Public base | `https://pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev` |
| Account ID | `957b2690e54ade4c335d8e395c5b69d5` |
| S3 endpoint | `https://957b2690e54ade4c335d8e395c5b69d5.r2.cloudflarestorage.com` |

Bucket created + public access enabled via `wrangler r2 bucket create` /
`… dev-url enable`. Round-trip already proven (PUT `--remote` → public GET `200`).

## The one manual step — mint an R2 API token

Writes use the S3-compatible API (SigV4), which needs an access key + secret.
This is a credential, so you create it (I consume it from env):

1. Cloudflare dashboard → **R2** → **Manage API Tokens** → **Create API Token**
2. Permissions: **Object Read & Write**
3. Scope: **Apply to specific buckets only → `a2a-agents-artifacts`** (least privilege)
4. Create → copy the **Access Key ID** and **Secret Access Key** (shown once)

## Wire it up

```bash
cd agents
cp .env.example .env          # if you haven't already
# edit .env — paste the two secrets:
#   R2_ACCESS_KEY_ID=...
#   R2_SECRET_ACCESS_KEY=...
# (R2_BUCKET / R2_PUBLIC_BASE / R2_ACCOUNT_ID are pre-filled)

set -a; source .env; set +a   # export into the shell
npm run dev:content-gen       # startup log now says "artifact store: R2"
```

## Verify

```bash
# direct, self-cleaning R2 round-trip (skipped automatically without the creds):
cd agents && set -a && source .env && set +a
npm run test:live -w e2e -- r2.live.test.ts
# → PUTs a test object via createArtifactStore(), reads it back over r2.dev (200), deletes it
```

Or end-to-end: with the env exported, run a synthesize-source and confirm the
returned `sourceUrl` is a `pub-…r2.dev` URL that returns `200`.

## How it works

`agents/a2a-common/src/store/artifactStore.ts` — `createArtifactStore()` picks the
R2 backend when the env above is set, else the local stand-in. One `put()` code
path runs identically in local Node and in a Container at deploy (containers get
no native bindings, so the S3 API is the universal write path; reads are public
r2.dev either way).
