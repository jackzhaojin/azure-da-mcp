"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, ScoreText } from "@/components/StatusBadge";
import { usePoll } from "@/lib/hooks";
import { fmtLocal } from "@/lib/utils";
import type { RunView } from "@/lib/types";
import { ArrowLeft, Download, RotateCcw, Loader2, Layers } from "lucide-react";

const TERMINAL = new Set(["completed", "completed_with_failures", "failed", "canceled"]);

const GRADE_CLS: Record<string, string> = {
  excellent: "bg-green-100 text-green-800",
  good: "bg-blue-100 text-blue-800",
  acceptable: "bg-yellow-100 text-yellow-800",
  "needs work": "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

function gradeOf(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "acceptable";
  if (score >= 40) return "needs work";
  return "critical";
}

function label(run: RunView): string {
  return run.config.title ?? run.config.topic ?? run.config.targets?.[0] ?? run.config.targetUrl ?? run.id.slice(0, 8);
}

function sourceLabel(run: RunView): string {
  const t = run.config.sourceType;
  if (!t || t === "none") return "—";
  return run.config.sourceLocation ? `${t} · ${run.config.sourceLocation}` : t;
}

function isEvalDirect(run: RunView): boolean {
  return run.kind === "eval-direct" || run.config.goal === "eval-direct";
}

function isFailed(run: RunView): boolean {
  return run.status === "failed" || run.status === "completed_with_failures";
}

export function BatchDetail({ batchId }: { batchId: string }) {
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Poll fast while anything is in flight (or still landing), then back off to a
  // heartbeat once every item is terminal — don't hammer the store on an idle
  // finished batch. Never stops, so a "Retry failed" (or a late-landing item)
  // still gets picked up; the effect re-arms the fast cadence when work resumes.
  const [pollMs, setPollMs] = useState(2500);
  const { data, error } = usePoll<{ runs: RunView[] }>(`/api/runs?batchId=${encodeURIComponent(batchId)}`, pollMs);
  const runs = data?.runs ?? [];

  const total = runs.length;
  const running = runs.filter((r) => !TERMINAL.has(r.status)).length;
  const failed = runs.filter(isFailed).length;
  // settled = rows present and none in flight → drop to a heartbeat; otherwise
  // (running, or rows still landing) keep the fast cadence.
  useEffect(() => {
    setPollMs(total > 0 && running === 0 ? 15000 : 2500);
  }, [total, running]);
  const completed = runs.filter((r) => r.status === "completed").length;
  const scores = runs.map((r) => r.stats?.overall?.mean).filter((s): s is number => typeof s === "number");
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  const dist = { excellent: 0, good: 0, acceptable: 0, "needs work": 0, critical: 0 } as Record<string, number>;
  for (const s of scores) dist[gradeOf(s)] += 1;

  const retryFailed = async () => {
    setRetrying(true);
    setActionError(null);
    setPollMs(2500); // re-arm fast polling: the retried items are about to run

    try {
      const failures = runs.filter(isFailed);
      for (const run of failures) {
        const c = run.config;
        // eval-direct items re-run through the direct-eval lane (carrying their
        // source); full-loop/coordinate items re-run through /api/trigger.
        if (isEvalDirect(run)) {
          await fetch("/api/eval-direct", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetUrl: c.targetUrl ?? c.targets?.[0],
              sourceType: c.sourceType ?? "none",
              sourceLocation: c.sourceLocation,
              dimensions: c.dimensions,
              fanOut: c.fanOut,
              batchId,
            }),
          });
        } else {
          await fetch("/api/trigger", {
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
              batchId,
            }),
          });
        }
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  };

  const exportJson = async () => {
    setExporting(true);
    setActionError(null);
    try {
      const details = await Promise.all(
        runs.map(async (r) => {
          const res = await fetch(`/api/runs/${r.id}`, { cache: "no-store" });
          const j = (await res.json().catch(() => null)) as { run?: RunView } | null;
          return j?.run ?? r;
        })
      );
      const blob = new Blob([JSON.stringify({ batchId, exportedAt: new Date().toISOString(), runs: details }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch-${batchId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/bulk" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Bulk
        </Link>
        <div className="flex justify-between items-center mt-2">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Layers className="h-6 w-6" /> Batch
            </h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm">batch {batchId.slice(0, 8)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={retryFailed} disabled={retrying || failed === 0}>
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Retry failed ({failed})
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={exporting || total === 0}>
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Export JSON
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Refresh failing ({error}) — showing the last data received.
        </div>
      )}
      {actionError && <div className="p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">{actionError}</div>}

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground mb-1">items</p>
              <p className="text-3xl font-bold">{total}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">running</p>
              <p className="text-3xl font-bold text-blue-600">{running}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">completed</p>
              <p className="text-3xl font-bold text-green-600">{completed}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">failed</p>
              <p className="text-3xl font-bold text-red-600">{failed}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">avg score</p>
              <p className="text-3xl font-bold">{avg ?? "—"}</p>
            </div>
          </div>
          {scores.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {Object.entries(dist)
                .filter(([, n]) => n > 0)
                .map(([g, n]) => (
                  <span key={g} className={`rounded-full px-3 py-1 text-xs font-semibold ${GRADE_CLS[g]}`}>
                    {g}: {n}
                  </span>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Each item is an independent run — click through to its branch grid and evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {data ? "No runs found for this batch yet — they may still be landing." : "loading…"}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>started</TableHead>
                    <TableHead>item</TableHead>
                    <TableHead>source</TableHead>
                    <TableHead>route</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead className="text-right">score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{fmtLocal(r.createdAt)}</TableCell>
                      <TableCell className="max-w-72 truncate">
                        <Link href={`/runs/${r.id}`} className="hover:underline font-medium">
                          {label(r)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground" title={sourceLabel(r)}>
                        {sourceLabel(r)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.stats?.route ?? r.config.goal ?? r.kind}</TableCell>
                      <TableCell title={r.error ?? undefined}>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.stats?.overall ? <ScoreText score={r.stats.overall.mean} /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
