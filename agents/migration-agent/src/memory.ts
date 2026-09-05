import { createLogger, daliveMcpUrl, memoryEditUrl, memoryPromptExcerpt, readMemory } from "@agents/a2a-common";
import type { MigrationRunPayload, MemoryUse } from "./backends/types.ts";

const log = createLogger("da-migration-agent");

/**
 * Upper bound on memory text injected into a migration prompt. Sized so the
 * WHOLE page is read in practice (approved memory + the episodic log); the
 * head+tail excerpt is only a safety net until compaction trims the log.
 */
const MEMORY_PROMPT_MAX_CHARS = Number(process.env.MEMORY_PROMPT_MAX_CHARS ?? 30_000);

export interface RunMemory {
  use: MemoryUse;
  /** Prompt-ready excerpt (undefined unless status === "loaded"). */
  text?: string;
  editUrl?: string;
}

/**
 * Read the site's memory page for this run (v1's "STEP 1: READ MEMORY",
 * done deterministically by the backend instead of spending a model turn).
 * Never throws — a migration must never fail because memory was unreadable;
 * the outcome is reported on the result (`memory`) and as a progress note.
 */
export async function loadRunMemory(payload: MigrationRunPayload, onProgress: (note: string) => void): Promise<RunMemory | null> {
  const path = payload.memoryPath?.trim();
  if (!path) return null;
  const editUrl = memoryEditUrl(path);
  if (!daliveMcpUrl()) {
    onProgress(`memory: skipped — DALIVE_MCP_URL unset in this process (${path})`);
    return { use: { path, editUrl, status: "skipped", chars: 0, entries: 0, reason: "DALIVE_MCP_URL unset" }, editUrl };
  }
  try {
    const snap = await readMemory(path);
    if (!snap || snap.missing || !snap.text.trim()) {
      onProgress(`memory: page is ${snap?.missing ? "missing" : "empty"} — nothing to apply yet (${editUrl})`);
      return { use: { path, editUrl, status: "empty", chars: 0, entries: 0 }, editUrl };
    }
    const text = memoryPromptExcerpt(snap.text, MEMORY_PROMPT_MAX_CHARS);
    onProgress(`memory: loaded ${snap.chars} chars, ${snap.entries} prior run entr${snap.entries === 1 ? "y" : "ies"} from ${path}`);
    log.info("memory loaded for run", { path, chars: snap.chars, entries: snap.entries, excerpt_chars: text.length });
    return { use: { path, editUrl, status: "loaded", chars: snap.chars, entries: snap.entries }, text, editUrl };
  } catch (err) {
    const reason = String(err).slice(0, 200);
    onProgress(`memory: unavailable (${reason}) — continuing without it`);
    log.warn("memory read failed — run continues without memory", { path, error: reason });
    return { use: { path, editUrl, status: "error", chars: 0, entries: 0, reason }, editUrl };
  }
}
