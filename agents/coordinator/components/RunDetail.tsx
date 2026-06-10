"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, ScoreText } from "@/components/StatusBadge";
import { usePoll, useElapsed } from "@/lib/hooks";
import type { RunView, BranchResult } from "@/lib/types";
import { ArrowLeft, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";

function fmt(ts: string | null): string {
  return ts ? ts.replace("T", " ").slice(0, 19) : "—";
}

function StageChip({ stage, state, durationMs }: { stage: string; state: string; durationMs?: number }) {
  const ok = state === "completed";
  const failed = state === "failed" || state === "canceled" || state === "rejected";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
        ok
          ? "bg-green-50 text-green-700 border-green-200"
          : failed
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      {ok ? <CheckCircle className="h-3 w-3" /> : failed ? <XCircle className="h-3 w-3" /> : null}
      {stage}
      {durationMs !== undefined && <span className="font-mono text-[10px] opacity-70">{(durationMs / 1000).toFixed(1)}s</span>}
    </span>
  );
}

function BranchCard({ b }: { b: BranchResult }) {
  return (
    <Card className={b.state === "completed" ? "" : "border-red-200"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">branch {b.branch}</CardTitle>
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
      </CardContent>
    </Card>
  );
}

export function RunDetail({ id }: { id: string }) {
  const [terminal, setTerminal] = useState(false);
  const { data, error } = usePoll<{ run: RunView }>(`/api/runs/${id}`, terminal ? null : 2000);
  const run = data?.run;
  const running = run?.status === "running";
  const elapsed = useElapsed(run?.createdAt ?? null, Boolean(running));
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (run && run.status !== "running") setTerminal(true);
  }, [run]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [run?.progress.length]);

  if (error && !run) return <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>;
  if (!run)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> loading run…
      </div>
    );

  const stats = run.stats;
  const branches = stats?.branchResults ?? [];

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
              {stats?.route ?? run.config.goal ?? run.kind} · run {run.id.slice(0, 8)} · started {fmt(run.createdAt)}
              {running ? ` · ${elapsed}` : ` · finished ${fmt(run.completedAt)}`}
            </p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      </div>

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
            <div ref={feedRef} className="max-h-72 overflow-y-auto space-y-1 p-3 bg-gray-50 rounded-lg border font-mono text-xs">
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

      {branches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Branches</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {branches.map((b) => (
              <BranchCard key={b.branch} b={b} />
            ))}
          </div>
        </div>
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
