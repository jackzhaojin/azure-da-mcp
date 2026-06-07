import type { MigrationBackend, MigrationRunPayload, MigrationResult } from "./types.ts";

/**
 * Make.com backend (PRIMARY per PRD part-5) — scaffold.
 *
 * Shape of the real implementation (M2 remainder, needs the cloudflared tunnel):
 *  1. POST the payload (1:1 with the scenario's {{5.*}} runtime vars) to
 *     MAKECOM_WEBHOOK_URL, including a callbackUrl pointing at this agent's
 *     /callbacks/makecom/{taskId} route through the tunnel
 *  2. Make.com runs the migration scenario (Claude agent inside Make.com)
 *  3. The scenario's final HTTP module POSTs the final-report JSON back to the
 *     callback → the facade completes the A2A task with the same artifact shape
 *
 * Until MAKECOM_WEBHOOK_URL + the tunnel exist, this backend reports itself
 * unconfigured and the task fails cleanly with a setup hint.
 */
export const makecomBackend: MigrationBackend = {
  name: "makecom",

  assertConfigured() {
    if (!process.env.MAKECOM_WEBHOOK_URL) {
      throw new Error(
        "makecom backend not configured: set MAKECOM_WEBHOOK_URL (and run the cloudflared tunnel for the callback path). Use backend:'dryrun' meanwhile."
      );
    }
  },

  async run(_payload: MigrationRunPayload, _onProgress): Promise<MigrationResult> {
    throw new Error("makecom backend: callback wiring lands with the tunnel (M2 remainder)");
  },
};
