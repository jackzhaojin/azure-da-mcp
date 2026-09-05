/** Client-safe shapes (no server imports) shared by pages + components. */

export interface ProgressNote {
  ts: string;
  note: string;
}

export interface StageResult {
  stage: "generate" | "migrate" | "evaluate";
  agent: string;
  taskId?: string;
  state: string;
  durationMs: number;
  error?: string;
}

export interface BranchResult {
  branch: number;
  target?: string;
  sourceUrl?: string;
  /** running (live snapshots) | completed | failed */
  state: string;
  evalTaskId?: string;
  overallScore?: number;
  dimensionScores?: Record<string, number>;
  confidence?: number;
  /** Migration report details (blocks, gaps, the model's self-reported lessons, memory use). */
  migration?: {
    pageSlug: string;
    backend?: string;
    model?: string;
    status?: string;
    confidence?: number;
    blocksUsed?: string[];
    gaps?: string[];
    lessons?: string[];
    memory?: { status: string; chars: number; entries: number; path?: string; reason?: string } | null;
    /** Evidence: what the migration read + what the model says it applied (v2.9.2). */
    usage?: {
      reads: { source: number; referencePage: number; blockLibraryIndex: number; blockPages: number; memory: number; other: number };
      blocksLookedAt: string[];
      urls: string[];
      memoryApplied: string[];
      referencesConsulted: string[];
    };
    pageUrl?: string;
    previewUrl?: string;
  };
  evalFindings?: Array<{ dimension: string; severity: string; issue: string; recommendation?: string }>;
  evalMode?: string;
  stages: StageResult[];
  error?: string;
}

/** The run-level memory write-back (eval.reflect) outcome. */
export interface MemoryOutcome {
  attempted: boolean;
  written: boolean;
  path?: string;
  editUrl?: string;
  entries?: number;
  lessons?: string[];
  summary?: string;
  tier?: string;
  model?: string;
  skipped?: string;
  error?: string;
  taskId?: string;
}

export interface DimensionSummary {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  n: number;
}

export interface RunStats {
  route?: string;
  branches?: number;
  completed?: number;
  failed?: number;
  overall?: { mean: number; stddev: number; min: number; max: number };
  passRate?: number;
  migrationConfidence?: { mean: number; stddev: number; min: number; max: number };
  perDimension?: Record<string, DimensionSummary>;
  /** Agent-memory write-back for this run (absent when the site has no memory page). */
  memory?: MemoryOutcome;
  branchResults?: BranchResult[];
}

export interface RunView {
  id: string;
  kind: string;
  status: string;
  contextId: string | null;
  userEmail?: string | null;
  /** Groups the runs fired by one bulk submission (runs.batch_id); null = one-off. */
  batchId?: string | null;
  createdAt: string;
  completedAt: string | null;
  config: {
    goal?: string;
    topic?: string;
    targets?: string[];
    targetUrl?: string;
    sourceType?: "none" | "webpage" | "pdf";
    sourceLocation?: string;
    /** Multi-source migrate runs: one branch per URL. */
    sources?: string[];
    /** Migration target folder override (beats the site profile's contentFolder). */
    folder?: string;
    pageSlug?: string;
    dimensions?: string[];
    title?: string;
    backend?: string;
    /** opencode only: which Kimi model produced this run (e.g. "k3"). */
    model?: string;
    /** Operator guiding principles threaded into the migration prompt (merged after the site profile's defaults). */
    guidance?: string;
    legacyStyle?: string;
    fanOut?: number;
    site?: string;
    owner?: string;
  } & Record<string, unknown>;
  stats: RunStats | null;
  progress: ProgressNote[];
  /** Per-branch stage snapshots while the run executes; null once stats land. */
  liveBranches?: BranchResult[] | null;
  /** Why a failed run failed (status='failed'). */
  error?: string | null;
}

export interface MeshStatus {
  coordinator: { id: string; up: boolean };
  agents: Array<{ id: string; url: string; up: boolean }>;
}

/** One browser-local history entry (localStorage v1). */
export interface HistoryEntry {
  runId: string;
  goal: string;
  label: string; // topic or first target
  backend?: string;
  fanOut?: number;
  triggeredAt: string;
  status?: string;
  score?: number;
}
