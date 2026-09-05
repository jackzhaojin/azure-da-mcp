import { cpSync, existsSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createLogger } from "@agents/a2a-common";
import type { MigrationBackend, MigrationRunPayload, MigrationResult, BackendContext } from "./types.ts";
import { DEFAULT_DALIVE_MCP_URL, resolveSkillsPath, repoRoot } from "./opencode-config.ts";
import { buildMigrationPrompt, migrationTargets, parseMigrationReport, parseSelfReports } from "./opencode-prompt.ts";
import { buildUsage, describeUsage, readTarget } from "../usage.ts";
import { loadRunMemory } from "../memory.ts";

const log = createLogger("da-migration-agent");

/**
 * Claude Agent SDK backend (Backend B, PRD part-5) — the same migration the
 * opencode/Kimi backend runs, driven by a Claude model instead. Same prompt
 * (buildMigrationPrompt), same da-live-author-playwright skill, same two MCP
 * surfaces (da.live CRUD/publish + Playwright validation); only the harness
 * differs: Claude Code's agent loop via the Agent SDK, authenticated with the
 * subscription OAuth token (CLAUDE_CODE_OAUTH_TOKEN) or ANTHROPIC_API_KEY.
 *
 * This is what makes "Claude vs Kimi on the same migration" a per-call flag:
 * `{"backend":"sdk","model":"sonnet"}` vs `{"backend":"opencode","model":"k3"}`.
 */

const TURN_TIMEOUT_MS = Number(process.env.SDK_MIGRATION_TIMEOUT_MS ?? 40 * 60 * 1000);
const MAX_TURNS = Number(process.env.SDK_MIGRATION_MAX_TURNS ?? 150);
/** Default Claude model; per-run override via payload.model ("sonnet" | "opus" | "haiku" | full id). */
const CLAUDE_MIGRATION_MODEL = process.env.CLAUDE_MIGRATION_MODEL || "sonnet";

/**
 * The session's working directory: a throwaway tmp dir seeded with ONLY the
 * da-live-author-playwright skill (copied fresh each boot). Keeping cwd out of
 * the repo means `settingSources: ["project"]` loads the skill and nothing
 * else — no monorepo CLAUDE.md/context noise, matching what the opencode
 * backend gives Kimi (the skill and nothing more).
 */
let workspaceDir: string | null = null;
function ensureWorkspace(): string {
  if (workspaceDir) return workspaceDir;
  const dir = path.join(os.tmpdir(), "a2a-sdk-migration");
  const src = path.join(resolveSkillsPath(), "da-live-author-playwright");
  const dst = path.join(dir, ".claude", "skills", "da-live-author-playwright");
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  workspaceDir = dir;
  return dir;
}

/** Playwright MCP output goes to the gitignored dotfolder (repo rule), own subdir per backend. */
function sdkPlaywrightOutputDir(): string {
  return path.join(repoRoot(), ".playwright-mcp", "sdk-migration");
}

export const sdkBackend: MigrationBackend = {
  name: "sdk",

  assertConfigured() {
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
      throw new Error("sdk backend not configured: needs CLAUDE_CODE_OAUTH_TOKEN (subscription OAuth) or ANTHROPIC_API_KEY");
    }
    const skill = path.join(resolveSkillsPath(), "da-live-author-playwright");
    if (!existsSync(skill)) {
      throw new Error(`sdk backend: da-live-author-playwright skill not found at ${skill} — set DALIVE_SKILLS_PATH`);
    }
  },

  async run(payload: MigrationRunPayload, ctx: BackendContext): Promise<MigrationResult> {
    const targets = migrationTargets(payload);
    const model = payload.model || CLAUDE_MIGRATION_MODEL;
    const cwd = ensureWorkspace();
    const pwOut = sdkPlaywrightOutputDir();
    mkdirSync(pwOut, { recursive: true });

    // lessons from previous runs on this site (same read the opencode backend does)
    const memory = await loadRunMemory(payload, ctx.onProgress);

    ctx.onProgress(`sdk/${model}: starting Claude Agent SDK session`);
    ctx.onProgress(`sdk/${model}: migrating ${payload.sourceType} ${payload.sourceLocation} → ${targets.folder}/${payload.pageSlug}`);

    // Deadline-bound the whole agentic run — a hung turn must fail the task,
    // not park it forever (same rule as the opencode backend's TURN_TIMEOUT_MS).
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`sdk migration timed out after ${TURN_TIMEOUT_MS}ms`)),
      TURN_TIMEOUT_MS
    );

    const texts: string[] = [];
    const toolsFired = new Set<string>();
    const errors: string[] = [];
    const reads: string[] = [];
    let resolvedModel = model;
    let skillFired = false;
    let validations = 0;
    let costUsd: number | undefined;
    let numTurns: number | undefined;

    try {
      for await (const message of query({
        prompt: buildMigrationPrompt({ payload, ...targets, ...(memory?.text ? { memory: { text: memory.text, editUrl: memory.editUrl } } : {}) }),
        options: {
          model,
          cwd,
          maxTurns: MAX_TURNS,
          systemPrompt: { type: "preset", preset: "claude_code" },
          settingSources: ["project"], // loads the skill seeded into cwd/.claude/skills — nothing else lives there
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          abortController: controller,
          mcpServers: {
            dalive: {
              type: "http",
              url: process.env.DALIVE_MCP_URL ?? DEFAULT_DALIVE_MCP_URL,
              ...(process.env.DALIVE_BEARER_TOKEN
                ? { headers: { Authorization: `Bearer ${process.env.DALIVE_BEARER_TOKEN}` } }
                : {}),
            },
            playwright: {
              type: "stdio",
              command: process.env.PLAYWRIGHT_MCP_BIN ?? "npx",
              args: [
                ...(process.env.PLAYWRIGHT_MCP_BIN ? [] : ["-y", "@playwright/mcp@latest"]),
                "--headless",
                "--isolated",
                "--output-dir",
                pwOut,
              ],
            },
          },
        },
      })) {
        if (message.type === "system" && message.subtype === "init") {
          resolvedModel = message.model || model;
          ctx.onProgress(`sdk/${resolvedModel}: session started`);
        }
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === "text" && block.text) texts.push(block.text);
            if (block.type === "tool_use") {
              const tool = String(block.name ?? "tool");
              if (tool === "Skill") {
                skillFired ||= /da-live-author-playwright/.test(JSON.stringify(block.input ?? {}));
                ctx.onProgress(`sdk/${resolvedModel} → skill ${JSON.stringify(block.input ?? {}).slice(0, 120)}`);
              } else {
                toolsFired.add(tool);
                if (/playwright.*browser_(navigate|snapshot|take_screenshot)/.test(tool)) validations++;
                const target = readTarget(tool, block.input);
                if (target) reads.push(target);
                ctx.onProgress(target ? `sdk/${resolvedModel} → ${tool} ${target.slice(0, 140)}` : `sdk/${resolvedModel} → ${tool}`);
              }
            }
          }
        }
        if (message.type === "result") {
          costUsd = message.total_cost_usd;
          numTurns = message.num_turns;
          if (message.subtype !== "success") {
            errors.push(`sdk run ended: ${message.subtype}`);
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    const text = texts.join("\n").trim();
    const result = parseMigrationReport(text, payload, targets, { refinementIterations: validations || undefined });
    result.backend = "sdk";
    if (errors.length) result.gaps = [...result.gaps, ...errors];
    result.memory = memory?.use ?? null;
    result.usage = buildUsage(reads, payload, parseSelfReports(text));
    if (memory?.use.status === "loaded") result.usage.reads.memory += 1;
    ctx.onProgress(`sdk/${resolvedModel}: evidence — ${describeUsage(result.usage)}`);

    log.info("sdk migration done", {
      a2a_task_id: ctx.taskId,
      model: resolvedModel,
      status: result.status,
      confidence: result.confidence,
      skill_fired: skillFired,
      tools_fired: [...toolsFired],
      validations,
      turns: numTurns,
      cost_usd: costUsd,
    });
    ctx.onProgress(
      `sdk/${resolvedModel}: done — ${result.status} (${result.confidence}%), skill ${skillFired ? "fired" : "not detected"}, ` +
        `${toolsFired.size} tool(s), ${numTurns ?? "?"} turns${costUsd !== undefined ? `, $${costUsd.toFixed(4)}` : ""}`
    );

    return result;
  },
};
