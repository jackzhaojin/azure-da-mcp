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
  stages: StageResult[];
  error?: string;
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
    dimensions?: string[];
    title?: string;
    backend?: string;
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
