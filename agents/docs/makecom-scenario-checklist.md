# Make.com Scenario Checklist — A2A `makecom` Migration Backend

The Make.com side of the round-trip. Pairs with [`tunnel-setup.md`](./tunnel-setup.md).
Every field below is copied **from the code** — no invented fields.

Flow (PRD part-3 / part-5, `migration-agent/src/backends/makecom.ts` + `index.ts`):

```
agent  --POST MAKECOM_WEBHOOK_URL-->  [Scenario A: Custom Webhook trigger]
                                            │ runs the migration (Claude agent + da.live)
[migration-agent /callbacks/makecom/{taskId}] <--POST {{callbackUrl}}-- [Scenario A: final HTTP module]
```

---

## Scenario A — Migration runner (REQUIRED)

### A1. Trigger: **Custom Webhook**

1. Add module → **Webhooks › Custom webhook** → create a hook → **Copy address**.
2. Set it on the agent: `export MAKECOM_WEBHOOK_URL="<copied URL>"` and restart
   `dev:migration` (see tunnel-setup §6).
3. Run "Determine data structure" once, then fire the dryrun→`webhook.site` swap or a
   real trigger so Make.com learns the field shape.

**Exact JSON the migration agent POSTs to this webhook** (verbatim from `makecom.ts`
`run()` — these are the `{{1.*}}` runtime vars you map downstream):

```json
{
  "sourceType": "webpage",
  "sourceLocation": "https://example.com/legacy-page",
  "siteName": "my-eds-site",
  "owner": "jackzhaojin",
  "pageSlug": "my-page",
  "folderPostfix": "",
  "blockLibraryUrl": "",
  "maxRefinementIterations": 3,
  "callbackUrl": "https://<tunnel-hostname>/callbacks/makecom/<taskId>",
  "taskId": "<a2a-task-id>"
}
```

Field notes (source of truth = `makecom.ts`):

| Webhook field | Type / values | Origin in agent |
|---|---|---|
| `sourceType` | `"pdf"` \| `"webpage"` | `payload.sourceType` |
| `sourceLocation` | URL string | `payload.sourceLocation` |
| `siteName` | string | `payload.site` ← note the **rename**: contract field is `site`, webhook key is `siteName` |
| `owner` | string | `payload.owner` |
| `pageSlug` | string | `payload.pageSlug` |
| `folderPostfix` | string (defaults `""`) | `payload.folderPostfix ?? ""` |
| `blockLibraryUrl` | string (defaults `""`) | `payload.blockLibraryUrl ?? ""` |
| `maxRefinementIterations` | integer (defaults `3`) | `payload.maxRefinementIterations ?? 3` |
| `callbackUrl` | URL the final module POSTs to | `${MIGRATION_CALLBACK_BASE}/callbacks/makecom/${taskId}` |
| `taskId` | A2A task id | `ctx.taskId` |

> The agent does **not** forward `backend`, `runId`, or `labels` to Make.com — only the
> ten fields above.

### A2. (middle) Your migration work

Whatever the scenario already does — Claude agent + da.live tools — to author the page and
self-validate. Keep `{{1.callbackUrl}}` and `{{1.taskId}}` in scope for the final module.

### A3. Final module: **HTTP › Make a request** → POST `{{1.callbackUrl}}`

- **URL**: `{{1.callbackUrl}}` (the tunnel `/callbacks/makecom/{taskId}` URL the agent sent)
- **Method**: `POST`
- **Body type**: Raw / `application/json`
- **Headers** (only if `A2A_EDGE_TOKEN` is set on the agent — it should be):
  `Authorization: Bearer <A2A_EDGE_TOKEN>`

**Exact JSON body the callback route expects** (verbatim from `MigrationResult` in
`backends/types.ts`; validated in `index.ts` — it requires an object with a `status`):

```json
{
  "pageUrl": "https://main--my-eds-site--jackzhaojin.aem.page/my-page",
  "previewUrl": "https://main--my-eds-site--jackzhaojin.aem.page/my-page",
  "status": "PASS",
  "confidence": 0.92,
  "blocksUsed": ["hero", "cards", "text"],
  "refinementIterations": 1,
  "gaps": []
}
```

| Callback field | Type / values | Required? |
|---|---|---|
| `pageUrl` | string | per `MigrationResult` |
| `previewUrl` | string | per `MigrationResult` |
| `status` | `"PASS"` \| `"NEEDS-REFINEMENT"` \| `"FAIL"` | **yes** — route 400s if missing |
| `confidence` | number | per `MigrationResult` |
| `blocksUsed` | string[] | per `MigrationResult` |
| `refinementIterations` | integer | per `MigrationResult` |
| `gaps` | string[] | per `MigrationResult` |

> The route hard-checks only `status` (`!report.status` → 400). The agent stamps
> `backend:"makecom"` onto the report itself — **do not** send a `backend` field.
> Expected success response from the callback route:
> - in-process waiter still parked: `{ "ok": true, "delivered": "in-process" }`
> - agent restarted mid-run: `{ "ok": true, "delivered": "store" }` (completed from store)
> - already-terminal task: `409`; unknown taskId: `404`; bad/no bearer: `401`.

---

## Scenario B — Eval consumer (OPTIONAL)

Receive an A2A **push notification** (the full completed Task JSON) when an eval/migration
finishes — Make.com's webhook consumes it natively (a push notification is just an HTTP
POST of the Task object).

### B1. Trigger: **Custom Webhook**

- Copy this hook URL and pass it as `callbackUrl` when you invoke a shim
  (`/hooks/eval/eval.run`, `/hooks/migration/migration.run`, …).
- Optionally pass `callbackToken` in the same shim body. The A2A SDK's push sender then
  sends that token on the outbound webhook in the **`X-A2A-Notification-Token`** header
  (SDK default header name). Validate it in Make.com with a Router/filter:
  `{{1.headers.x-a2a-notification-token}}` equals your token → continue, else stop.
- The body is the full A2A **Task** object: `id`, `contextId`, `status.state`
  (`completed`/`failed`), and `artifacts[].parts[].data` carrying the result payload
  (e.g. the `MigrationResult` for migration, the eval report for eval).

> Scenario B is the generic A2A-push receiver; Scenario A's A3 module is the
> migration-specific return path into `/callbacks/makecom/{taskId}`. They are different
> endpoints — don't merge them.

---

## Smoke test order

Do these in sequence; stop at the first failure.

```text
1. Tunnel up          cloudflared tunnel run a2a-mesh        (tunnel-setup §5)
2. Card via tunnel     curl …/.well-known/agent-card.json    → "da-migration-agent"
                       curl …/health                          → ok:true            (§7a)
3. Dryrun via shim     POST …/hooks/migration/migration.run  backend:"dryrun",
                       callbackUrl = webhook.site URL          → 202 {taskId,…},
                       webhook.site shows the pushed Task      (§7b)
4. makecom end-to-end  set MAKECOM_WEBHOOK_URL, restart dev:migration;
                       POST shim with backend:"makecom" (or omit backend);
                       Scenario A runs → its A3 module POSTs the report to
                       …/callbacks/makecom/{taskId} (Bearer) → {ok:true,delivered:…};
                       the A2A task completes with the migration-report artifact.
```
