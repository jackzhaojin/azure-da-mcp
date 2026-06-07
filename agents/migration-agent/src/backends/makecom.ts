import type { MigrationBackend, MigrationRunPayload, MigrationResult, BackendContext } from "./types.ts";
import { waitForCallback } from "../callbacks.ts";

/**
 * Make.com backend (PRIMARY per PRD part-5) — the full async round-trip:
 *
 *  1. POST the payload to MAKECOM_WEBHOOK_URL (the scenario's Custom Webhook
 *     trigger), fields 1:1 with the scenario's {{5.*}} runtime vars, plus a
 *     callbackUrl pointing at this agent's /callbacks/makecom/{taskId}
 *  2. The scenario runs the migration (its own Claude agent + da.live tools)
 *  3. Its final HTTP module POSTs the final-report JSON to the callbackUrl;
 *     the route resolves the parked waiter (or, after a restart, completes
 *     the task directly from the store) — no 300s scenario-timeout fights
 *
 * Locally this is fully testable with a fake Make.com (see e2e). In production
 * the callbackUrl rides the cloudflared tunnel: set MIGRATION_CALLBACK_BASE to
 * the tunnel hostname.
 */
const TIMEOUT_MS = Number(process.env.MAKECOM_TIMEOUT_MS ?? 25 * 60 * 1000); // scenarios can run long

export const makecomBackend: MigrationBackend = {
  name: "makecom",

  assertConfigured() {
    if (!process.env.MAKECOM_WEBHOOK_URL) {
      throw new Error(
        "makecom backend not configured: set MAKECOM_WEBHOOK_URL (Make.com Custom Webhook trigger URL) and MIGRATION_CALLBACK_BASE (tunnel hostname in prod). Use backend:'dryrun' meanwhile."
      );
    }
  },

  async run(payload: MigrationRunPayload, ctx: BackendContext): Promise<MigrationResult> {
    const webhookUrl = process.env.MAKECOM_WEBHOOK_URL!;
    const callbackBase = process.env.MIGRATION_CALLBACK_BASE ?? `http://localhost:${process.env.PORT ?? 4003}`;
    const callbackUrl = `${callbackBase}/callbacks/makecom/${ctx.taskId}`;

    // park the waiter BEFORE firing the webhook — no race with a fast scenario
    const reportPromise = waitForCallback(ctx.taskId, TIMEOUT_MS);

    ctx.onProgress(`makecom: triggering scenario (callback ${callbackUrl})`);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // 1:1 with the Make.com scenario's runtime vars (PRD part-5)
        sourceType: payload.sourceType,
        sourceLocation: payload.sourceLocation,
        siteName: payload.site,
        owner: payload.owner,
        pageSlug: payload.pageSlug,
        folderPostfix: payload.folderPostfix ?? "",
        blockLibraryUrl: payload.blockLibraryUrl ?? "",
        maxRefinementIterations: payload.maxRefinementIterations ?? 3,
        callbackUrl,
        taskId: ctx.taskId,
      }),
    });
    if (!res.ok) {
      throw new Error(`makecom webhook rejected the trigger: HTTP ${res.status} ${await res.text().catch(() => "")}`.trim());
    }

    ctx.onProgress("makecom: scenario accepted — waiting for the final-report callback");
    const report = await reportPromise;
    return { ...report, backend: "makecom" };
  },
};
