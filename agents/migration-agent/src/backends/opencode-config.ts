import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createLogger } from "@agents/a2a-common";

const log = createLogger("da-migration-agent");

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
 * The model opencode asks for. Overridable via `KIMI_MODEL_ID` so swapping
 * models (e.g. `k3`) is one env var — no code change locally, no code change
 * in cloud — which keeps "K2.7 vs K3 on the same migration" a cheap, reversible
 * experiment rather than a release.
 *
 * The default is a MOVING ALIAS, not a version pin: Moonshot resolves
 * `kimi-for-coding` server-side to whatever the current Kimi-For-Coding model
 * is, and it silently went K2.6 → K2.7 under us with no deploy on our side.
 * Never hardcode the version in user-facing strings; ask the API
 * (`resolveKimiModelLabel`).
 *
 * ⚠️ opencode only knows models DECLARED in its config (`kimi-code` is a custom
 * provider, so it never reads the /models catalog). Pointing this at a model
 * that isn't in `provider.kimi-code.models` — the baked
 * `deploy/docker/opencode-global.jsonc` in cloud, `~/.config/opencode/
 * opencode.jsonc` locally — fails at message time, not at boot.
 */
export const KIMI_MODEL_ID = process.env.KIMI_MODEL_ID || "kimi-for-coding";

/** The Kimi-For-Coding endpoint (same base the global opencode config points at). */
export const KIMI_API_BASE = "https://api.kimi.com/coding/v1";
/** The endpoint is UA-gated — match what the global opencode config sends. */
const KIMI_USER_AGENT = "opencode/1.16.2";
/** Shown when the catalog lookup fails — vague but never wrong. */
const KIMI_FALLBACK_LABEL = "Kimi";

// Per-model-id caches: one process can now serve several models (the run
// payload picks one), so a single global label would be wrong the moment a
// k3 run followed a kimi-for-coding one.
const modelLabels = new Map<string, string>();
const modelLabelsInFlight = new Map<string, Promise<string>>();

/**
 * The display name a model id currently resolves to (e.g. `kimi-for-coding` →
 * "K2.7 Coding", `k3` → "K3"), read from the provider's own catalog and cached
 * per id for the process's life.
 *
 * Purely cosmetic — a migration must never fail over a label, so every error
 * path falls back to "Kimi" rather than throwing.
 */
export async function resolveKimiModelLabel(modelId: string = KIMI_MODEL_ID): Promise<string> {
  const cached = modelLabels.get(modelId);
  if (cached) return cached;
  const pending = modelLabelsInFlight.get(modelId);
  if (pending) return pending;

  const job = (async () => {
    try {
      const key = process.env.MOONSHOT_API_KEY;
      if (!key) return KIMI_FALLBACK_LABEL;
      const res = await fetch(`${KIMI_API_BASE}/models`, {
        headers: { authorization: `Bearer ${key}`, "user-agent": KIMI_USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return KIMI_FALLBACK_LABEL;
      const body = (await res.json()) as { data?: Array<{ id?: string; display_name?: string }> };
      const hit = body.data?.find((m) => m.id === modelId);
      if (!hit) {
        // Reachable catalog, unknown id — almost always a typo'd model id.
        // Say so loudly here, because opencode's own failure comes much later
        // (at message time) and reads as a generic turn error.
        log.warn("model id is not in the provider catalog", {
          configured: modelId,
          available: (body.data ?? []).map((m) => m.id).filter(Boolean),
        });
        return KIMI_FALLBACK_LABEL;
      }
      return hit.display_name || KIMI_FALLBACK_LABEL;
    } catch {
      return KIMI_FALLBACK_LABEL;
    }
  })();

  modelLabelsInFlight.set(modelId, job);
  const label = await job;
  modelLabels.set(modelId, label);
  modelLabelsInFlight.delete(modelId);
  return label;
}

/** Sync peek at the cache (for /health) — null until a migration resolves it. */
export function cachedKimiModelLabel(modelId: string = KIMI_MODEL_ID): string | null {
  return modelLabels.get(modelId) ?? null;
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
  /**
   * Route the kimi-code provider through this base URL instead of the global
   * config's api.kimi.com - the in-process wire-repair proxy (kimi-proxy.ts).
   * Deep-merged over the global provider entry, so apiKey/headers/timeouts stay.
   */
  kimiBaseURL?: string;
}

/** The additive opencode config object (serialized to a file, loaded via OPENCODE_CONFIG). */
export function buildOpencodeConfig(opts: OpencodeConfigOptions): Record<string, unknown> {
  const timeout = opts.mcpTimeoutMs ?? 120_000;
  return {
    $schema: "https://opencode.ai/config.json",
    model: `${KIMI_PROVIDER_ID}/${KIMI_MODEL_ID}`,
    // opencode auto-installs PATCH releases at startup unless told not to. A
    // headless backend must run the binary it was built/tested with - the cloud
    // image pins the version (migration.Dockerfile) and this keeps it pinned.
    autoupdate: false,
    ...(opts.kimiBaseURL ? { provider: { [KIMI_PROVIDER_ID]: { options: { baseURL: opts.kimiBaseURL } } } } : {}),
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

// The opencode binary's version, for /health. The container installs opencode
// at image-build time (now pinned) and opencode can self-update patch releases,
// so "which opencode is actually running" was unknowable from outside - this
// is the same class of blind spot the timeout/model fields closed.
let opencodeVersion: string | null = null;
let opencodeVersionInFlight: Promise<string | null> | null = null;

export function resolveOpencodeVersion(): Promise<string | null> {
  if (opencodeVersion) return Promise.resolve(opencodeVersion);
  if (opencodeVersionInFlight) return opencodeVersionInFlight;
  opencodeVersionInFlight = new Promise<string | null>((resolve) => {
    const bin = resolveOpencodeBin();
    if (!existsSync(bin)) return resolve(null);
    execFile(bin, ["--version"], { timeout: 15_000 }, (err, stdout) => {
      if (err) return resolve(null);
      const v = String(stdout).trim().split(/\s+/).pop() ?? null;
      opencodeVersion = v || null;
      resolve(opencodeVersion);
    });
  }).finally(() => (opencodeVersionInFlight = null));
  return opencodeVersionInFlight;
}

/** Sync peek for /health - null until resolveOpencodeVersion() has run. */
export function cachedOpencodeVersion(): string | null {
  return opencodeVersion;
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
