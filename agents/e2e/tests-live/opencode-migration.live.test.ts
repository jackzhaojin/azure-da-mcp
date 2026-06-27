import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

/**
 * LIVE: can Kimi K2.6 (via opencode) ACTUALLY migrate a page?
 *
 * This is Backend C's Definition of Done (PRD part-5): "opencode/Kimi K2.6
 * backend completes one migration end-to-end against the same MCP server and
 * prompt." It drives the real migration agent with backend:"opencode", which
 * spawns `opencode serve`, loads the da-live-author-playwright skill, and
 * authors a real page into da.live through the da.live MCP + Playwright MCP.
 *
 * Opt-in (writes a REAL page to da.live): set in agents/.env —
 *   MOONSHOT_API_KEY   (the Kimi-For-Coding key; usually from ~/.zshrc)
 *   DALIVE_TEST_OWNER  (default jackzhaojin)
 *   DALIVE_TEST_SITE   (e.g. adapt-to-2026-demo — S2S account must be a writer)
 *   DALIVE_TEST_SOURCE_URL (default https://example.com)
 * Unset DALIVE_TEST_SITE → skips (so CI never writes to da.live).
 */

const HAVE = !!process.env.MOONSHOT_API_KEY && !!process.env.DALIVE_TEST_SITE;
const OWNER = process.env.DALIVE_TEST_OWNER ?? "jackzhaojin";
const SITE = process.env.DALIVE_TEST_SITE ?? "";
const SOURCE = process.env.DALIVE_TEST_SOURCE_URL ?? "https://example.com";
const DALIVE_MCP =
  process.env.DALIVE_MCP_URL ?? "https://jack-mcp-azure-ai-function.azurewebsites.net/api/mcp-streamable";
const SLUG = "opencode-e2e-smoke";
const FOLDER = "migration-batch-opencode-e2e"; // fixed → reruns overwrite the same test page

const TWENTY_MIN = 20 * 60 * 1000;

function migrationMessage(data: Record<string, unknown>): Message {
  return { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] };
}

/** GET the page back through the da.live MCP to prove it actually landed. */
async function daliveGet(path: string): Promise<string | null> {
  const res = await fetch(DALIVE_MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_dalive_content", arguments: { path } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  const text: string = json?.result?.content?.[0]?.text ?? "";
  if (!text || /not found|404|error/i.test(text.slice(0, 60))) return null;
  return text;
}

describe.skipIf(!HAVE)("opencode/Kimi K2.6 migration (LIVE, writes to da.live)", () => {
  let agent: AgentHandle;

  beforeAll(async () => {
    agent = await startAgent("migration-agent", 14333, {
      env: {
        MIGRATION_DEFAULT_BACKEND: "opencode",
        DALIVE_MCP_URL: DALIVE_MCP,
        OPENCODE_MIGRATION_TIMEOUT_MS: String(TWENTY_MIN),
      },
    });
  });

  afterAll(async () => {
    if (agent) await stopAgent(agent);
  });

  it(
    "authors + publishes a real da.live page, with the skill + da.live MCP + Playwright firing",
    async () => {
      const client = await new ClientFactory().createFromUrl(agent.url);
      const notes: string[] = [];
      let finalState = "";
      let finalNote = "";
      let artifact: Record<string, unknown> | undefined;

      for await (const event of client.sendMessageStream({
        message: migrationMessage({
          sourceType: "webpage",
          sourceLocation: SOURCE,
          site: SITE,
          owner: OWNER,
          pageSlug: SLUG,
          folderPostfix: "e2e",
          backend: "opencode",
          maxRefinementIterations: 2,
        }),
      })) {
        if (event.kind === "status-update") {
          const e = event as TaskStatusUpdateEvent;
          const note = e.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
          if (note) notes.push(note);
          if (e.final) {
            finalState = e.status.state;
            finalNote = note;
          }
        }
        if (event.kind === "artifact-update") {
          const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
          if (part?.kind === "data") artifact = part.data as Record<string, unknown>;
        }
      }

      // surface progress for the run log (observability)
      console.log("── opencode/K2.6 migration progress ──\n" + notes.join("\n"));

      expect(finalState, `migration failed: ${finalNote}`).toBe("completed");

      // 1) contract-shaped artifact
      expect(artifact, "no migration-report artifact").toBeTruthy();
      expect(artifact!.backend).toBe("opencode");
      expect(["PASS", "NEEDS-REFINEMENT", "FAIL"]).toContain(artifact!.status);
      expect(typeof artifact!.confidence).toBe("number");
      expect(String(artifact!.pageUrl)).toContain(`da.live/edit#/${OWNER}/${SITE}/`);
      expect(String(artifact!.previewUrl)).toContain(`--${SITE}--${OWNER}.aem.page/`);

      // 2) the skill fired (skill-as-a-service reuse) + both MCP surfaces fired
      const all = notes.join("\n");
      expect(all, "skill never fired").toMatch(/skill/i);
      expect(all, "da.live MCP never fired").toMatch(/dalive_/);
      expect(all, "Playwright MCP never fired").toMatch(/playwright_/);

      // 3) the page ACTUALLY landed on da.live (read it back through the MCP)
      const targetPath = `/source/${OWNER}/${SITE}/${FOLDER}/${SLUG}.html`;
      let html: string | null = null;
      for (let i = 0; i < 6 && !html; i++) {
        html = await daliveGet(targetPath);
        if (!html) await new Promise((r) => setTimeout(r, 3000));
      }
      expect(html, `page not found on da.live at ${targetPath}`).toBeTruthy();
      expect(html!.length).toBeGreaterThan(50);
    },
    TWENTY_MIN
  );
});
