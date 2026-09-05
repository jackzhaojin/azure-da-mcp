import { readTarget } from "../usage.ts";

/**
 * Tool-event tracker for the opencode SSE tap (pure; the SSE plumbing in
 * opencode.ts feeds it `message.part.updated` tool parts). Owns the
 * observability rules:
 *
 *  - one "→ tool" progress note per tool part (keyed by part id, not by
 *    status — a part is updated several times: pending → running → completed);
 *  - for READ tools, the note waits until the input (the URL/path) is known,
 *    because on Cloudflare the first `running` update routinely arrives before
 *    `state.input` is populated — v2.9.2 keyed on `id:status` and so logged
 *    `K3 → webfetch` with no target and recorded no reads at all (v2.9.3 fix);
 *  - every read target is captured exactly once per part into `summary.reads`
 *    (the deterministic block-library / reference / memory evidence);
 *  - errors are noted once per part and folded into `summary.errors`.
 */

export interface ToolPart {
  id?: string;
  type?: string;
  tool?: string;
  sessionID?: string;
  state?: { status?: string; input?: unknown; error?: unknown; title?: unknown };
}

export interface ToolSummary {
  toolsFired: Set<string>;
  skillFired: boolean;
  validations: number;
  errors: string[];
  reads: string[];
}

export function createToolTracker(opts: { model: string; onProgress: (note: string) => void }) {
  const summary: ToolSummary = { toolsFired: new Set<string>(), skillFired: false, validations: 0, errors: [], reads: [] };
  const noted = new Set<string>(); // part ids that already produced their "→" note
  const targeted = new Set<string>(); // part ids whose read target has been captured
  const errored = new Set<string>();

  function handle(part: ToolPart): void {
    if (!part || part.type !== "tool") return;
    const id = part.id ?? `${part.tool}:${Math.random()}`;
    const status = part.state?.status ?? "";
    const tool = part.tool ?? "tool";

    if (status === "error") {
      if (errored.has(id)) return;
      errored.add(id);
      const errText = String(part.state?.error ?? part.state?.title ?? "tool error").slice(0, 200);
      summary.errors.push(`${tool}: ${errText}`);
      opts.onProgress(`${opts.model} ✗ ${tool}: ${errText}`);
      return;
    }
    if (status !== "running" && status !== "completed") return; // pending: input still streaming

    if (tool === "skill") {
      if (noted.has(id)) return;
      noted.add(id);
      const input = part.state?.input as Record<string, unknown> | undefined;
      const skillName = (input?.skill ?? input?.name ?? "skill") as string;
      summary.skillFired ||= /da-live-author-playwright/.test(JSON.stringify(input ?? {}));
      opts.onProgress(`${opts.model} → skill ${skillName}`);
      return;
    }

    summary.toolsFired.add(tool);
    const target = readTarget(tool, part.state?.input);
    if (target && !targeted.has(id)) {
      targeted.add(id);
      summary.reads.push(target);
    }
    if (noted.has(id)) return;
    // A read tool's note waits for its target (or for completion, when the
    // input never carried one); other tools are noted as soon as they run.
    const isRead = isReadTool(tool);
    if (isRead && !target && status !== "completed") return;
    noted.add(id);
    if (/playwright.*browser_(navigate|snapshot|take_screenshot)/.test(tool)) summary.validations++;
    opts.onProgress(target ? `${opts.model} → ${tool} ${target.slice(0, 140)}` : `${opts.model} → ${tool}`);
  }

  return { summary, handle };
}

/** Tools whose input names something being read (mirrors usage.ts's target keys). */
export function isReadTool(tool: string): boolean {
  return /webfetch|web_fetch|fetch|dalive_get_dalive_content|get_dalive_content|dalive_list_dalive_content|browser_navigate|^read$|readfile|read_file/i.test(tool);
}
