/** migration.run payload — contract: agents/contracts/migration.run.v1.json */
export interface MigrationRunPayload {
  sourceType: "pdf" | "webpage";
  sourceLocation: string;
  site: string;
  owner: string;
  pageSlug: string;
  folderPostfix?: string;
  /** Explicit target folder (verbatim) for generated drafts, e.g. "ai-articles". Overrides the migration-batch-* default. */
  folder?: string;
  blockLibraryUrl?: string;
  /** A best-practice reference page the migrator mimics (learns block shapes + editorial look). */
  neighborPageUrl?: string;
  /** Prompt variant: "article" authors a journal article mimicking neighborPageUrl; "generic" is the fidelity default. */
  pattern?: "article" | "generic";
  backend?: "makecom" | "sdk" | "opencode" | "dryrun";
  /**
   * The model to drive for THIS run, interpreted by the backend:
   * - opencode: a Kimi model id (`kimi-for-coding` = K2.7, `k3`), overriding
   *   `KIMI_MODEL_ID`. Must be declared in opencode's `provider.kimi-code.models` map.
   * - sdk: a Claude model ("sonnet" | "opus" | "haiku" or a full model id),
   *   overriding `CLAUDE_MIGRATION_MODEL`.
   * Lets one agent serve every model in a comparison matrix — the daily-loop
   * workflow and the model-matrix harness pick per run.
   */
  model?: string;
  /**
   * Operator guiding principles (free text) appended to the migration prompt —
   * e.g. "if an image is low-res, hunt for a higher-res variant; record a gap
   * if none exists". Followed within the run's step budget; unsatisfiable
   * principles land in the report's gaps. opencode + sdk backends; others ignore it.
   */
  guidance?: string;
  /**
   * The site's agent-memory page (`/source/{owner}/{site}/{path}.html`, e.g.
   * `/source/jackzhaojin/adapt-to-2026-demo/ai-content/memory.html`). When set,
   * the opencode/sdk/dryrun backends READ it before the run (needs
   * `DALIVE_MCP_URL`) and inject it into the prompt as lessons from previous
   * runs; the coordinator's post-eval reflect step WRITES to it. Never fatal.
   */
  memoryPath?: string;
  maxRefinementIterations?: number;
  runId?: string;
  labels?: Record<string, string>;
}

/** migration.run result artifact — mirrors the existing Make.com final-report contract. */
export interface MigrationResult {
  pageUrl: string;
  previewUrl: string;
  status: "PASS" | "NEEDS-REFINEMENT" | "FAIL";
  confidence: number;
  blocksUsed: string[];
  refinementIterations: number;
  gaps: string[];
  backend: string;
  /**
   * What the model says it learned this run for the NEXT migration to this
   * site (errors + fixes, block mappings that worked/failed). Raw input to the
   * reflect step, which curates them into the memory page.
   */
  lessons?: string[];
  /** How memory was used for this run (null when the run carried no memoryPath). */
  memory?: MemoryUse | null;
}

/** Observability for the memory read at the start of a run. */
export interface MemoryUse {
  path: string;
  editUrl?: string;
  /** loaded = injected into the prompt; empty = page missing/blank; skipped = disabled; error = read failed (run continued). */
  status: "loaded" | "empty" | "skipped" | "error";
  chars: number;
  entries: number;
  reason?: string;
}

/**
 * The backend seam (PRD part-5): one Agent Card, one task contract — the
 * runtime behind it is an implementation detail. This is what makes
 * "Claude vs Kimi on the same 10 migrations" a no-contract-change experiment.
 */
export interface BackendContext {
  taskId: string;
  onProgress: (note: string) => void;
}

export interface MigrationBackend {
  readonly name: string;
  /** Throws with a setup hint when env/config is missing (callers surface it on the task). */
  assertConfigured(): void;
  run(payload: MigrationRunPayload, ctx: BackendContext): Promise<MigrationResult>;
}
