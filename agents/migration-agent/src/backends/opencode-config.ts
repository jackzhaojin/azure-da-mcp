import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Config + path resolution for the opencode/Kimi K2.6 backend.
 *
 * We drive Kimi K2.6 through the `opencode` CLI's headless server (`opencode
 * serve` + REST), validated end-to-end in references/kimi/ (PR #5). The
 * **provider** (`kimi-code` → api.kimi.com/coding/v1, the $MOONSHOT_API_KEY
 * Kimi-For-Coding key) lives in the user's GLOBAL opencode config
 * (`~/.config/opencode/opencode.jsonc`). The config we generate here is loaded
 * ADDITIVELY via `OPENCODE_CONFIG` and only adds what's task-specific:
 *   - the two MCP servers (da.live CRUD/publish + Playwright "agentic eyes"),
 *   - the `da-live-author-playwright` skill (reused, not re-encoded — the whole
 *     point of "skill as a service"), discovered from the repo's .claude/skills,
 *   - blanket `permission:"allow"` so a headless run never blocks on approvals,
 *   - the K2.6 model pin.
 */

export const KIMI_PROVIDER_ID = "kimi-code";
export const KIMI_MODEL_ID = "kimi-for-coding"; // opencode catalog label: "Kimi for Coding (K2.6)"

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
        // @playwright/mcp uses the macOS-cached Chromium; headless + isolated for a clean run.
        command: [
          "npx",
          "-y",
          "@playwright/mcp@latest",
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
