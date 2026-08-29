# CLAUDE.md - hlx-admin/

**Purpose**: Auditable, one-at-a-time AEM Edge Delivery Services admin operations against `admin.hlx.page` (Config Service site records, access control, code/content ops). Not code - a log of executed operations, each in its own dated working directory. **Status**: active use.

## How this folder works

- **One operation = one dated directory**: `YYYY-MM-DD-<description>/` containing an `EXECUTION.md` plan, JSON request/response files, and a retrospective. See `2026-05-16-set-hosts/EXECUTION.md` for a worked example.
- **Skill-driven**: operations are executed with the [hlx-admin-api-executor skill](https://github.com/jackzhaojin/ai-builder-kit/tree/main/skills/hlx-admin-api-executor), which enforces the GET/SET/GET pattern (capture current state, mutate, verify) and human-in-the-loop approval before every mutation.
- Mutations here are **costly to get wrong** (org/site config, access lists, secrets, API keys) - never batch, never skip the pre-GET, never proceed past a diff the human hasn't approved.

## Auth

Two paths, both accepted by `admin.hlx.page`:

1. **DA IMS JWT as Bearer** (preferred, faster): the cached token at `~/.aem/da-token.json` (refresh with `npx github:adobe-rnd/da-auth-helper token`, 24h TTL) works as `Authorization: Bearer <jwt>`. Each dated dir has a `.env-setup.sh` that loads it.
2. **`X-Auth-Token` cookie** (the skill's documented path): the fallback when the DA token is unavailable.

## When to work here

- Creating or repairing AEM Config Service site records (the classic symptom: da.live shows an "undefined" preview URL - that means the site record is missing, not that the DA sheet config is wrong).
- Mutating org/site config, access lists, secrets, or API keys on `admin.hlx.page`.

## Run

```bash
cd hlx-admin/<YYYY-MM-DD-description>
source .env-setup.sh   # loads the DA IMS token
# follow EXECUTION.md step by step
```
