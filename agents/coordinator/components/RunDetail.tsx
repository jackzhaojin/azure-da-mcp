"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge, ScoreText } from "@/components/StatusBadge";
import { usePoll, useElapsed } from "@/lib/hooks";
import { fmtLocal } from "@/lib/utils";
import type { RunView, BranchResult } from "@/lib/types";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  ExternalLink,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Camera,
  Download,
  Layers,
} from "lucide-react";

function StageChip({ stage, state, durationMs }: { stage: string; state: string; durationMs?: number }) {
  const ok = state === "completed";
  const failed = state === "failed" || state === "canceled" || state === "rejected";
  const working = state === "working" || state === "running" || state === "submitted";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
        ok
          ? "bg-green-50 text-green-700 border-green-200"
          : failed
            ? "bg-red-50 text-red-700 border-red-200"
            : working
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      {ok ? (
        <CheckCircle className="h-3 w-3" />
      ) : failed ? (
        <XCircle className="h-3 w-3" />
      ) : working ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : null}
      {stage}
      {durationMs !== undefined && durationMs > 0 && (
        <span className="font-mono text-[10px] opacity-70">{(durationMs / 1000).toFixed(1)}s</span>
      )}
    </span>
  );
}

interface EvidenceDimension {
  dimension: string;
  score: number;
  mode?: string;
  modeReason?: string;
  screenshotUrl?: string;
  findings: Array<{ severity: string; issue: string; recommendation: string }>;
}

interface Evidence {
  overallScore?: number;
  grade?: string;
  summary?: { passedDimensions: number; totalDimensions: number };
  dimensions: EvidenceDimension[];
  notes: Array<{ dimension: string; severity: string; issue: string }>;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  serious: "bg-orange-100 text-orange-800 border-orange-200",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  minor: "bg-blue-50 text-blue-700 border-blue-200",
  info: "bg-gray-100 text-gray-600 border-gray-200",
};

function ModeBadge({ mode }: { mode?: string }) {
  if (!mode) return null;
  const agentic = mode === "agentic";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        agentic ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
      title={agentic ? "Scored by the Claude agentic pass blended with deterministic analysis" : "Deterministic analysis only — agentic pass did not run"}
    >
      {agentic ? "agentic" : mode}
    </span>
  );
}

/** On-demand eval report behind a branch score: findings, modes, screenshot. */
function EvidencePanel({ evalTaskId }: { evalTaskId: string }) {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/evidence/${evalTaskId}`, { cache: "no-store" });
      const json = (await res.json()) as { evidence?: Evidence; error?: string };
      if (!res.ok || !json.evidence) throw new Error(json.error ?? "evidence unavailable");
      setEvidence(json.evidence);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [evalTaskId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !evidence && !loading) void load();
  };

  return (
    <div className="border-t pt-2">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Evidence — findings &amp; how each score was produced
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> loading eval report…
            </div>
          )}
          {error && <div className="p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">{error}</div>}
          {evidence && (
            <>
              {evidence.notes.length > 0 && (
                <div className="space-y-1">
                  {evidence.notes.map((n, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{n.issue}</span>
                    </div>
                  ))}
                </div>
              )}
              {evidence.dimensions.map((d) => (
                <div key={d.dimension} className="rounded-md border p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide">{d.dimension}</span>
                      <ModeBadge mode={d.mode} />
                      {d.screenshotUrl && (
                        <a
                          href={d.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                        >
                          <Camera className="h-3 w-3" /> screenshot
                        </a>
                      )}
                    </div>
                    <ScoreText score={d.score} className="text-sm" />
                  </div>
                  {d.findings.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No findings.</p>
                  ) : (
                    <ul className="space-y-1">
                      {d.findings.map((f, i) => (
                        <li key={i} className="text-[11px] leading-snug flex items-start gap-1.5">
                          <span
                            className={`shrink-0 rounded border px-1 text-[9px] font-semibold uppercase ${SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info}`}
                          >
                            {f.severity}
                          </span>
                          <span>
                            {f.issue}
                            {f.recommendation && f.severity !== "info" && (
                              <span className="text-muted-foreground"> — {f.recommendation}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BranchCard({ b }: { b: BranchResult }) {
  const running = b.state === "running";
  return (
    <Card className={b.state === "failed" ? "border-red-200" : running ? "border-blue-200" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            branch {b.branch}
            {running && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
          </CardTitle>
          <div className="flex items-center gap-3">
            {b.confidence !== undefined && (
              <span className="text-xs text-muted-foreground">
                conf <span className="font-semibold text-foreground">{b.confidence}</span>
              </span>
            )}
            {b.overallScore !== undefined && <ScoreText score={b.overallScore} className="text-lg" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {b.stages.map((s) => (
            <StageChip key={s.stage} stage={s.stage} state={s.state} durationMs={s.durationMs} />
          ))}
        </div>
        {b.dimensionScores && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {Object.entries(b.dimensionScores).map(([dim, score]) => (
              <div key={dim} className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{dim}</p>
                <ScoreText score={score} />
              </div>
            ))}
          </div>
        )}
        {b.target && (
          <a
            href={b.target}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all"
          >
            <ExternalLink className="h-3 w-3 shrink-0" /> {b.target}
          </a>
        )}
        {b.error && <div className="p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">{b.error}</div>}
        {b.evalTaskId && <EvidencePanel evalTaskId={b.evalTaskId} />}
      </CardContent>
    </Card>
  );
}

export function RunDetail({ id }: { id: string }) {
  const router = useRouter();
  const [terminal, setTerminal] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const { data, error, lastUpdated } = usePoll<{ run: RunView }>(`/api/runs/${id}`, terminal ? null : 2000);
  const run = data?.run;
  const running = run?.status === "running";
  const elapsed = useElapsed(run?.createdAt ?? null, Boolean(running));
  const feedRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    if (run && run.status !== "running") setTerminal(true);
  }, [run]);

  // Follow the feed only while the reader is at the bottom — scrolling up to
  // read must not be yanked back down by the next note.
  useEffect(() => {
    if (stickToBottom.current) feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [run?.progress.length]);

  const onFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const downloadJson = () => {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rerun = async () => {
    if (!run) return;
    setRerunning(true);
    setRerunError(null);
    try {
      const c = run.config;
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: c.goal,
          topic: c.topic,
          targets: c.targets,
          sourceLocation: c.sourceLocation,
          fanOut: c.fanOut,
          legacyStyle: c.legacyStyle,
          backend: c.backend,
          site: c.site,
          owner: c.owner,
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error ?? "re-run submitted but no run id yet — check the dashboard");
      router.push(`/runs/${json.runId}`);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : String(err));
      setRerunning(false);
    }
  };

  if (error && !run) {
    const notFound = error.includes("not found") || error.includes("404");
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          {notFound ? "Run not found — it may belong to a different store or was never created." : error}
        </div>
      </div>
    );
  }
  if (!run)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> loading run…
      </div>
    );

  const stats = run.stats;
  // after completion the durable branchResults take over; while running the
  // live snapshots drive the same grid
  const branches = stats?.branchResults ?? run.liveBranches ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
        <div className="flex justify-between items-center mt-2">
          <div>
            <h1 className="text-3xl font-bold">{run.config.topic ?? run.config.targets?.[0] ?? run.kind}</h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm">
              {stats?.route ?? run.config.goal ?? run.kind} · run {run.id.slice(0, 8)} · started {fmtLocal(run.createdAt)}
              {running ? ` · ${elapsed}` : ` · finished ${fmtLocal(run.completedAt)}`}
            </p>
            {run.batchId && (
              <Link
                href={`/batch/${run.batchId}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Layers className="h-3 w-3" /> part of batch {run.batchId.slice(0, 8)}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={downloadJson}>
              <Download className="h-3 w-3" /> Download JSON
            </Button>
            {!running && (
              <Button variant="outline" size="sm" onClick={rerun} disabled={rerunning}>
                {rerunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Run again
              </Button>
            )}
            <StatusBadge status={run.status} />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Refresh failing ({error}) — showing data from {lastUpdated ? lastUpdated.toLocaleTimeString() : "an earlier poll"}.
        </div>
      )}
      {rerunError && <div className="p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">{rerunError}</div>}

      {run.status === "failed" && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Run failed</p>
            <p className="mt-1">{run.error ?? "No failure reason was recorded — check the live activity feed and server logs."}</p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              backend <span className="font-medium">{run.config.backend ?? "—"}</span>
            </span>
            <span>
              fan-out <span className="font-medium">{run.config.fanOut ?? 1}</span>
            </span>
            {run.config.legacyStyle ? (
              <span>
                legacy style <span className="font-medium">{run.config.legacyStyle}</span>
              </span>
            ) : null}
            {run.config.site ? (
              <span>
                target <span className="font-medium">{run.config.owner}/{run.config.site}</span>
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {stats?.overall && (
        <Card>
          <CardHeader>
            <CardTitle>Overall</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-sm text-muted-foreground mb-2">score μ ± σ</p>
                <p className="text-4xl font-bold">
                  <ScoreText score={stats.overall.mean} className="text-4xl" />{" "}
                  <span className="text-lg text-muted-foreground font-normal">± {stats.overall.stddev}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">pass rate</p>
                <p className="text-4xl font-bold">{Math.round((stats.passRate ?? 0) * 100)}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">branches</p>
                <p className="text-4xl font-bold">
                  {stats.completed}
                  <span className="text-lg text-muted-foreground font-normal">/{stats.branches}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">migration conf μ</p>
                <p className="text-4xl font-bold">{stats.migrationConfidence ? stats.migrationConfidence.mean : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {branches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Branches
            {running && <span className="text-xs font-normal text-muted-foreground">(live — stages update as agents report)</span>}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {branches.map((b) => (
              <BranchCard key={b.branch} b={b} />
            ))}
          </div>
        </div>
      )}

      {run.progress.length > 0 && (
        <Card className={running ? "border-l-4 border-l-blue-500" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {running && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />} Live activity
            </CardTitle>
            <CardDescription>
              Working notes streamed from the agents — including the migration backend&apos;s tool and skill calls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              ref={feedRef}
              onScroll={onFeedScroll}
              className="max-h-72 overflow-y-auto space-y-1 p-3 bg-gray-50 rounded-lg border font-mono text-xs"
            >
              {run.progress.map((n, i) => (
                <div key={`${n.ts}-${i}`} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{n.ts.slice(11, 19)}</span>
                  <span className={i === run.progress.length - 1 && running ? "text-foreground font-semibold" : ""}>{n.note}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.perDimension && Object.keys(stats.perDimension).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Variance per dimension</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>dimension</TableHead>
                    <TableHead className="text-right">mean</TableHead>
                    <TableHead className="text-right">stddev</TableHead>
                    <TableHead className="text-right">min</TableHead>
                    <TableHead className="text-right">max</TableHead>
                    <TableHead className="w-1/3">distribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(stats.perDimension).map(([dim, s]) => (
                    <TableRow key={dim}>
                      <TableCell className="font-medium">{dim}</TableCell>
                      <TableCell className="text-right">
                        <ScoreText score={s.mean} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{s.stddev}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{s.min}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{s.max}</TableCell>
                      <TableCell>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                          <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, s.mean)}%` }} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
