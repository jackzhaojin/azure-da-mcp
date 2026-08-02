import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Config + path resolution for the opencode/Kimi backend.
 *
 * We drive Kimi through the `opencode` CLI's headless server (`opencode
 * serve` + REST), validated end-to-end in references/kimi/ (PR #5). The
 * **provider** (`kimi-code` → api.kimi.com/coding/v1, the $MOONSHOT_API_KEY
 * Kimi-For-Coding key) lives in the user's GLOBAL opencode config
 * (`~/.config/opencode/opencode.jsonc`). The config we generate here is loaded
 * ADDITIVELY via `OPENCODE_CONFIG` and only adds what's task-specific:
 *   - the two MCP servers (da.live CRUD/publish + Playwright "agentic eyes"),
 *   - the `da-live-author-playwright` skill (reused, not re-encoded — the whole
 *     point of "skill as a service"), discovered from the repo's .claude/skills,
 *   - blanket `permission:"allow"` so a headless run never blocks on approvals,
 *   - the model selector (an ALIAS — see KIMI_MODEL_ID).
 */

export const KIMI_PROVIDER_ID = "kimi-code";
/**
 * A MOVING ALIAS, not a version pin. Moonshot resolves `kimi-for-coding`
 * server-side to whatever the current Kimi-For-Coding model is — it silently
 * went K2.6 → K2.7 under us with no deploy on our side. Never hardcode the
 * version in user-facing strings; ask the API (`resolveKimiModelLabel`).
 */
export const KIMI_MODEL_ID = "kimi-for-coding";

/** The Kimi-For-Coding endpoint (same base the global opencode config points at). */
export const KIMI_API_BASE = "https://api.kimi.com/coding/v1";
/** The endpoint is UA-gated — match what the global opencode config sends. */
const KIMI_USER_AGENT = "opencode/1.16.2";
/** Shown when the catalog lookup fails — vague but never wrong. */
const KIMI_FALLBACK_LABEL = "Kimi";

let modelLabel: string | null = null;
let modelLabelInFlight: Promise<string> | null = null;

/**
 * The display name of whatever `KIMI_MODEL_ID` currently resolves to (e.g.
 * "K2.7 Coding"), read from the provider's own catalog and cached for the
 * process's life.
 *
 * Purely cosmetic — a migration must never fail over a label, so every error
 * path falls back to "Kimi" rather than throwing.
 */
export async function resolveKimiModelLabel(): Promise<string> {
  if (modelLabel) return modelLabel;
  if (modelLabelInFlight) return modelLabelInFlight;

  modelLabelInFlight = (async () => {
    try {
      const key = process.env.MOONSHOT_API_KEY;
      if (!key) return KIMI_FALLBACK_LABEL;
      const res = await fetch(`${KIMI_API_BASE}/models`, {
        headers: { authorization: `Bearer ${key}`, "user-agent": KIMI_USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return KIMI_FALLBACK_LABEL;
      const body = (await res.json()) as { data?: Array<{ id?: string; display_name?: string }> };
      const hit = body.data?.find((m) => m.id === KIMI_MODEL_ID);
      return hit?.display_name || KIMI_FALLBACK_LABEL;
    } catch {
      return KIMI_FALLBACK_LABEL;
    }
  })();

  modelLabel = await modelLabelInFlight;
  modelLabelInFlight = null;
  return modelLabel;
}

/** Sync peek at the cache (for /health) — null until the first migration resolves it. */
export function cachedKimiModelLabel(): string | null {
  return modelLabel;
}

/** Deployed da.live MCP (anonymous inbound; self-authenticates to da.live via S2S). */
export const DEFAULT_DALIVE_MCP_URL =
  "https://jack-mcp-azure-ai-function.azurewebsites.net/api/mcp-streamable";

export function resolveOpencodeBin(): string {
  return process.env.OPENCODE_BIN ?? path.join(os.homedir(), ".opencode", "bin", "opencode");
}

/** Repo root, resolved from this file so it's cwd-independent. */
export function repoRoot(): string {
  // .../agents/migration-agent/src/backends/opencode-config.ts → up 4 → repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../..");
}

/** Directory that CONTAINS the da-live-author-playwright skill dir (a skills root). */
export function resolveSkillsPath(): string {
  return process.env.DALIVE_SKILLS_PATH ?? path.join(repoRoot(), ".claude", "skills");
}

/** Where Playwright MCP drops traces/screenshots — a gitignored dotfolder (repo rule). */
export function playwrightOutputDir(): string {
  return path.join(repoRoot(), ".playwright-mcp", "opencode-migration");
}

export interface OpencodeConfigOptions {
  daliveUrl: string;
  /** Optional da.live user token; omit to let the server's S2S technical account author. */
  daliveBearer?: string;
  skillsPath: string;
  playwrightOut: string;
  /** MCP request timeout — da.live preview-publish + first-call S2S mint exceed the 5s default. */
  mcpTimeoutMs?: number;
}

/** The additive opencode config object (serialized to a file, loaded via OPENCODE_CONFIG). */
export function buildOpencodeConfig(opts: OpencodeConfigOptions): Record<string, unknown> {
  const timeout = opts.mcpTimeoutMs ?? 120_000;
  return {
    $schema: "https://opencode.ai/config.json",
    model: `${KIMI_PROVIDER_ID}/${KIMI_MODEL_ID}`,
    // Trusted, autonomous local backend: allow every tool (built-ins + dalive_*/playwright_*).
    permission: "allow",
    mcp: {
      dalive: {
        type: "remote",
        url: opts.daliveUrl,
        enabled: true,
        timeout,
        ...(opts.daliveBearer ? { headers: { Authorization: `Bearer ${opts.daliveBearer}` } } : {}),
      },
      playwright: {
        type: "local",
        // PLAYWRIGHT_MCP_BIN (containers: a pre-installed global bin + pre-pulled
        // Chromium) avoids the npx-fetch-latest network dependency at runtime;
        // local default stays npx with the macOS-cached Chromium.
        command: [
          ...(process.env.PLAYWRIGHT_MCP_BIN
            ? [process.env.PLAYWRIGHT_MCP_BIN]
            : ["npx", "-y", "@playwright/mcp@latest"]),
          "--headless",
          "--isolated",
          "--output-dir",
          opts.playwrightOut,
        ],
        enabled: true,
        timeout,
      },
    },
    skills: { paths: [opts.skillsPath] },
  };
}

/** assertConfigured() helper — returns a setup-hint string if unusable, else null. */
export function opencodeSetupProblem(): string | null {
  if (!process.env.MOONSHOT_API_KEY) {
    return "opencode backend needs MOONSHOT_API_KEY (the Kimi-For-Coding key) in the environment — `source ~/.zshrc` before `npm run dev:migration`.";
  }
  const bin = resolveOpencodeBin();
  if (!existsSync(bin)) {
    return `opencode binary not found at ${bin} — install opencode or set OPENCODE_BIN. See references/kimi/README.md.`;
  }
  return null;
}
