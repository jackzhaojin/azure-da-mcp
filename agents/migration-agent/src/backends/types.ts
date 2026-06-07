/** migration.run payload — contract: agents/contracts/migration.run.v1.json */
export interface MigrationRunPayload {
  sourceType: "pdf" | "webpage";
  sourceLocation: string;
  site: string;
  owner: string;
  pageSlug: string;
  folderPostfix?: string;
  blockLibraryUrl?: string;
  backend?: "makecom" | "sdk" | "opencode" | "dryrun";
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
}

/**
 * The backend seam (PRD part-5): one Agent Card, one task contract — the
 * runtime behind it is an implementation detail. This is what makes
 * "Claude vs Kimi K2.6 on the same 10 migrations" a no-contract-change experiment.
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
