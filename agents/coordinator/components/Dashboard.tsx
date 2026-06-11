"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, ScoreText } from "@/components/StatusBadge";
import { TriggerCard } from "@/components/TriggerCard";
import { usePoll, useRunHistory, useElapsed } from "@/lib/hooks";
import { fmtLocal } from "@/lib/utils";
import type { RunView, MeshStatus, HistoryEntry } from "@/lib/types";
import { Activity, History, Trash2, ArrowRight, CheckCircle, XCircle, Loader2, Rocket } from "lucide-react";

function MeshChips() {
  const { data } = usePoll<MeshStatus>("/api/mesh", 10000);
  const agents = [{ id: "coordinator", up: true }, ...(data?.agents ?? [])];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {agents.map((a) => (
        <span
          key={a.id}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${
            a.up ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${a.up ? "bg-green-600" : "bg-red-600"}`} />
          {a.id}
        </span>
      ))}
    </div>
  );
}

/** Compact per-branch stage pipeline for the running card (from runs.live). */
function LiveStageRows({ run }: { run: RunView }) {
  const branches = run.liveBranches ?? [];
  if (branches.length === 0) return null;
  return (
    <div className="mb-3 space-y-1.5">
      {branches.map((b) => (
        <div key={b.branch} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 font-mono text-muted-foreground">branch {b.branch}</span>
          <div className="flex flex-wrap gap-1.5">
            {b.stages.map((s) => {
              const ok = s.state === "completed";
              const failed = s.state === "failed" || s.state === "canceled" || s.state === "rejected";
              return (
                <span
                  key={s.stage}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                    ok
                      ? "bg-green-50 text-green-700 border-green-200"
                      : failed
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {ok ? <CheckCircle className="h-2.5 w-2.5" /> : failed ? <XCircle className="h-2.5 w-2.5" /> : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  {s.stage}
                </span>
              );
            })}
          </div>
          {b.overallScore !== undefined && <ScoreText score={b.overallScore} className="text-xs ml-auto" />}
        </div>
      ))}
    </div>
  );
}

function RunningCard({ run }: { run: RunView }) {
  const elapsed = useElapsed(run.createdAt, true);
  const tail = run.progress.slice(-6);
  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            <Link href={`/runs/${run.id}`} className="hover:underline">
              {run.config.topic ?? run.config.targets?.[0] ?? run.kind}
            </Link>
          </CardTitle>
          <StatusBadge status="running" />
        </div>
        <CardDescription>
          {run.config.goal ?? run.kind} · backend {run.config.backend ?? "—"} · fan-out {run.config.fanOut ?? 1} ·{" "}
          <span className="font-mono">{elapsed}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LiveStageRows run={run} />
        <div className="space-y-1 p-3 bg-white rounded-md border font-mono text-xs text-muted-foreground">
          {tail.length === 0 && <div>starting…</div>}
          {tail.map((n, i) => (
            <div key={`${n.ts}-${i}`} className={i === tail.length - 1 ? "text-foreground" : ""}>
              {n.note}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={`/runs/${run.id}`}>
              Watch live <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { data, error, lastUpdated } = usePoll<{ runs: RunView[] }>("/api/runs", 2500);
  const runs = data?.runs ?? [];
  const running = runs.filter((r) => r.status === "running");
  const { history, add, update, clear } = useRunHistory();
  const loading = !data && !error;

  // Reconcile browser history with store outcomes (terminal status + score).
  useEffect(() => {
    for (const h of history) {
      if (h.status === "running") {
        const live = runs.find((r) => r.id === h.runId);
        if (live && live.status !== "running") {
          update(h.runId, { status: live.status, score: live.stats?.overall?.mean });
        }
      }
    }
  }, [runs, history, update]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Coordinator</h1>
          <p className="text-muted-foreground mt-2">Trigger pipeline runs, watch them live, and compare results across the mesh.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MeshChips />
          <span className="text-[11px] text-muted-foreground font-mono">
            {error ? "refresh failing" : lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : "loading…"} · auto-refresh 2.5s
          </span>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Can&apos;t reach the coordinator ({error}) — showing the last data received
          {lastUpdated ? ` at ${lastUpdated.toLocaleTimeString()}` : ""}.
        </div>
      )}

      {running.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" /> Running now
          </h2>
          {running.map((r) => (
            <RunningCard key={r.id} run={r} />
          ))}
        </div>
      ) : null}

      <TriggerCard onTriggered={(e: HistoryEntry) => add(e)} />

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Everything the coordinator has executed (from the store — survives restarts).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 rounded-md bg-gray-100" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Rocket className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-medium">No runs yet</p>
              <p className="text-sm text-muted-foreground">
                Start one above — try a full loop with the dryrun backend for an instant end-to-end demo.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>started</TableHead>
                    <TableHead>run</TableHead>
                    <TableHead>route</TableHead>
                    <TableHead>backend</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead className="text-right">score μ±σ</TableHead>
                    <TableHead className="text-right">pass</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{fmtLocal(r.createdAt)}</TableCell>
                      <TableCell className="max-w-64 truncate">
                        <Link href={`/runs/${r.id}`} className="hover:underline font-medium">
                          {r.config.topic ?? r.config.targets?.[0] ?? r.kind}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.stats?.route ?? r.config.goal ?? r.kind}</TableCell>
                      <TableCell className="text-xs">{r.config.backend ?? "—"}</TableCell>
                      <TableCell title={r.error ?? undefined}>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.stats?.overall ? (
                          <>
                            <ScoreText score={r.stats.overall.mean} /> <span className="text-muted-foreground text-xs">± {r.stats.overall.stddev}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.stats?.passRate !== undefined ? `${Math.round((r.stats.passRate ?? 0) * 100)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-4 w-4" /> My history
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={clear}>
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            </div>
            <CardDescription>Runs you triggered from this browser (saved locally).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.runId} className="flex items-center justify-between gap-4 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/runs/${h.runId}`} className="font-medium hover:underline truncate block">
                      {h.label}
                    </Link>
                    <span className="text-xs text-muted-foreground font-mono">
                      {fmtLocal(h.triggeredAt)} · {h.goal}
                      {h.backend ? ` · ${h.backend}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {h.score !== undefined && <ScoreText score={h.score} className="text-sm" />}
                    <StatusBadge status={h.status ?? "running"} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
