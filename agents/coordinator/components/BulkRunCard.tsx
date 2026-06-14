"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, Loader2, AlertTriangle, Upload, Download, FileJson, X } from "lucide-react";

type Mode = "evaluate" | "full-loop";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const DIMENSIONS = ["structure", "accessibility", "content", "visual"] as const;

const SAMPLES: Record<Mode, { file: string; label: string }> = {
  evaluate: { file: "/samples/evaluate-pages.json", label: "evaluate-pages.json" },
  "full-loop": { file: "/samples/full-loop-topics.json", label: "full-loop-topics.json" },
};

/** One bulk eval item: a migrated target, optionally compared against a source. */
interface EvalItem {
  targetUrl: string;
  sourceType: "none" | "webpage" | "pdf";
  sourceLocation?: string;
  title?: string;
}

/** Map any source-type spelling (v1 uses 'html') to the eval agent's vocabulary. */
function normType(t: unknown): "none" | "webpage" | "pdf" {
  const s = String(t ?? "").toLowerCase();
  if (s === "pdf") return "pdf";
  if (s === "html" || s === "webpage" || s === "web") return "webpage";
  return "none";
}

/** Coerce a string (target-only) or object (v1 BatchPage / clean item) into an EvalItem. */
function toEvalItem(raw: unknown): EvalItem | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? { targetUrl: t, sourceType: "none" } : null;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const targetUrl = String(o.targetUrl ?? o.webUrl ?? o.url ?? o.target ?? "").trim();
    if (!targetUrl) return null;
    const srcRaw = o.sourceLocation ?? o.sourceUrl;
    const sourceLocation = srcRaw ? String(srcRaw).trim() : undefined;
    let sourceType = normType(o.sourceType);
    // infer type from the location when only a URL was given; drop type with no location
    if (sourceType === "none" && sourceLocation) {
      sourceType = sourceLocation.toLowerCase().endsWith(".pdf") ? "pdf" : "webpage";
    }
    if (sourceType !== "none" && !sourceLocation) sourceType = "none";
    const title = o.title ? String(o.title) : undefined;
    return sourceType === "none"
      ? { targetUrl, sourceType, ...(title ? { title } : {}) }
      : { targetUrl, sourceType, sourceLocation, ...(title ? { title } : {}) };
  }
  return null;
}

/** Accept the clean `{items:[...]}`, a v1-style `{pages:[{sourceUrl,sourceType,webUrl}]}`, or a bare array. */
function parseBatch(json: unknown): { mode?: Mode; items: EvalItem[] } {
  const obj = (json ?? {}) as Record<string, unknown>;
  const mode = obj.mode === "evaluate" || obj.mode === "full-loop" ? (obj.mode as Mode) : undefined;
  const rawList: unknown[] = Array.isArray(obj.pages)
    ? obj.pages
    : Array.isArray(obj.items)
      ? obj.items
      : Array.isArray(json)
        ? json
        : [];
  const items = rawList.map(toEvalItem).filter((x): x is EvalItem => Boolean(x));
  return { mode, items };
}

/** Run `worker` over `items` with bounded concurrency, reporting completion count. */
async function runPool<T>(items: T[], concurrency: number, worker: (item: T, i: number) => Promise<void>, onTick: () => void) {
  let cursor = 0;
  const next = async (): Promise<void> => {
    const i = cursor++;
    if (i >= items.length) return;
    try {
      await worker(items[i], i);
    } finally {
      onTick();
    }
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

const SRC_BADGE: Record<EvalItem["sourceType"], string> = {
  pdf: "bg-purple-100 text-purple-800",
  webpage: "bg-blue-100 text-blue-800",
  none: "bg-gray-100 text-gray-500",
};

export function BulkRunCard() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("evaluate");
  const [text, setText] = useState("");
  // When a source-bearing JSON is loaded, the parsed pages become the source of
  // truth (read-only table, v1-style); a plain URL list stays in the editable textarea.
  const [pages, setPages] = useState<EvalItem[] | null>(null);
  const [dims, setDims] = useState<string[]>([...DIMENSIONS]);
  const [backend, setBackend] = useState("dryrun");
  const [legacyStyle, setLegacyStyle] = useState("dated");
  const [fanOut, setFanOut] = useState(1);
  const [site, setSite] = useState("da-live-postal-2025-07");
  const [owner, setOwner] = useState("jackzhaojin");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const realBackend = mode === "full-loop" && backend !== "dryrun";
  const textItems = text
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  // The eval items that will actually be submitted: the loaded pages, or the textarea URLs.
  const evalItems: EvalItem[] = pages ?? textItems.map((t) => ({ targetUrl: t, sourceType: "none" as const }));
  const itemCount = mode === "full-loop" ? textItems.length : evalItems.length;
  const withSource = pages ? pages.filter((p) => p.sourceType !== "none").length : 0;

  const toggleDim = (d: string) => setDims((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const loadJson = (json: unknown) => {
    const parsed = parseBatch(json);
    const nextMode = parsed.mode ?? mode;
    if (parsed.mode) setMode(parsed.mode);
    if (nextMode === "full-loop") {
      setPages(null);
      setText(parsed.items.map((it) => it.targetUrl).join("\n"));
    } else if (parsed.items.some((it) => it.sourceType !== "none")) {
      // a real source→target batch → show the read-only pairing table
      setPages(parsed.items);
      setText("");
    } else {
      // plain URL list → keep the editable textarea quick path
      setPages(null);
      setText(parsed.items.map((it) => it.targetUrl).join("\n"));
    }
    setError(parsed.items.length ? null : "no items found (expected { items: [...] } or { pages: [...] })");
  };

  const onFile = async (file: File) => {
    try {
      loadJson(JSON.parse(await file.text()));
    } catch (err) {
      setError(`could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loadSample = async () => {
    try {
      const res = await fetch(SAMPLES[mode].file, { cache: "no-store" });
      loadJson(await res.json());
    } catch (err) {
      setError(`could not load sample: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const submitEvaluate = async () => {
    if (evalItems.length === 0) {
      setError("add at least one target URL (one per line), or upload a source→target batch");
      return;
    }
    const badTarget = evalItems.find((it) => !/^https?:\/\//.test(it.targetUrl));
    if (badTarget) {
      setError(`invalid target URL: ${badTarget.targetUrl}`);
      return;
    }
    const badSource = evalItems.find((it) => it.sourceType !== "none" && !/^https?:\/\//.test(it.sourceLocation ?? ""));
    if (badSource) {
      setError(`invalid source URL for ${badSource.targetUrl}: ${badSource.sourceLocation ?? "(missing)"}`);
      return;
    }
    if (dims.length === 0) {
      setError("select at least one dimension");
      return;
    }
    setSubmitting(true);
    setSubmitted(0);
    try {
      // ONE POST — the backend mints the batch and fans out per-item evals.
      const body: Record<string, unknown> = {
        items: evalItems,
        fanOut,
        // all four selected = run them all (omit the subset). content auto-excludes
        // itself per item when that item has no source — handled by the engine.
        ...(dims.length < DIMENSIONS.length ? { dimensions: dims } : {}),
      };
      const res = await fetch("/api/eval-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { batchId?: string; runIds?: string[]; error?: string };
      if (!res.ok || !json.batchId) throw new Error(json.error ?? `bulk eval failed (HTTP ${res.status})`);
      router.push(`/batch/${json.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const submitFullLoop = async () => {
    if (textItems.length === 0) {
      setError("add at least one topic (one per line)");
      return;
    }
    setSubmitting(true);
    setSubmitted(0);
    const batchId = crypto.randomUUID();
    const failures: string[] = [];
    try {
      await runPool(
        textItems,
        3,
        async (item) => {
          const body: Record<string, unknown> = {
            goal: "full-loop",
            topic: item,
            fanOut,
            batchId,
            legacyStyle,
            backend,
            ...(realBackend ? { site, owner } : {}),
          };
          const res = await fetch("/api/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            failures.push(`${item}: ${j.error ?? `HTTP ${res.status}`}`);
          }
        },
        () => setSubmitted((n) => n + 1)
      );
      if (failures.length === textItems.length) {
        throw new Error(`all ${textItems.length} items failed to submit — ${failures[0]}`);
      }
      router.push(`/batch/${batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "evaluate") void submitEvaluate();
    else void submitFullLoop();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Bulk run
        </CardTitle>
        <CardDescription>
          Fire a batch of runs at once — each item becomes its own durable run, grouped under one batch you can watch,
          retry, and export. Evaluate mode compares each migrated target against its source (PDF or webpage), just like v1.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mode">Mode</Label>
              <select id="mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="evaluate">Evaluate — score pages vs. their source</option>
                <option value="full-loop">Full-loop topics — generate → migrate → evaluate</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-fanout">Fan-out (per item)</Label>
              <Input
                id="bulk-fanout"
                type="number"
                min={1}
                max={8}
                value={fanOut}
                onChange={(e) => setFanOut(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-2">
              <Label>Sample batch</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={loadSample}>
                  <FileJson className="h-3 w-3" /> Load
                </Button>
                <a
                  href={SAMPLES[mode].file}
                  download
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <Download className="h-3 w-3" /> {SAMPLES[mode].label}
                </a>
              </div>
            </div>
          </div>

          {mode === "evaluate" && (
            <div className="space-y-2">
              <Label>Dimensions</Label>
              <div className="flex flex-wrap gap-2">
                {DIMENSIONS.map((d) => {
                  const on = dims.includes(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDim(d)}
                      className={`rounded-md border px-3 py-1 text-sm font-medium capitalize transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent border-input hover:bg-gray-50"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                {dims.length} of 4 · content is scored only on items that carry a source; otherwise it&apos;s excluded, not
                failed.
              </p>
            </div>
          )}

          {mode === "full-loop" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-backend">Migration backend</Label>
                <select id="bulk-backend" className={selectClass} value={backend} onChange={(e) => setBackend(e.target.value)}>
                  <option value="dryrun">dryrun — instant, no real writes</option>
                  <option value="opencode">opencode — Kimi K2.6 authors real da.live pages</option>
                  <option value="makecom">makecom — Make.com scenario</option>
                  <option value="sdk">sdk — Claude Agent SDK (stub)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-style">Legacy source style</Label>
                <select id="bulk-style" className={selectClass} value={legacyStyle} onChange={(e) => setLegacyStyle(e.target.value)}>
                  <option value="clean">clean</option>
                  <option value="dated">dated</option>
                  <option value="messy">messy</option>
                </select>
              </div>
            </div>
          )}

          {realBackend && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="space-y-2">
                <Label htmlFor="bulk-owner">da.live owner</Label>
                <Input id="bulk-owner" value={owner} onChange={(e) => setOwner(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-site">da.live site</Label>
                <Input id="bulk-site" value={site} onChange={(e) => setSite(e.target.value)} required />
              </div>
            </div>
          )}

          {/* Loaded source→target batch: a read-only pairing table (v1-style). */}
          {mode === "evaluate" && pages ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {pages.length} page{pages.length === 1 ? "" : "s"} · {withSource} with a source to compare against
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setPages(null)}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              </div>
              <div className="rounded-md border max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>target (migrated)</TableHead>
                      <TableHead>source (compare against)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pages.map((p, i) => (
                      <TableRow key={`${p.targetUrl}-${i}`}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="max-w-72">
                          {p.title && <div className="font-medium truncate">{p.title}</div>}
                          <div className="font-mono text-xs truncate text-muted-foreground">{p.targetUrl}</div>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SRC_BADGE[p.sourceType]}`}>
                            {p.sourceType === "none" ? "target-only" : p.sourceType}
                          </span>
                          {p.sourceLocation && (
                            <div className="font-mono text-xs truncate text-muted-foreground mt-1">{p.sourceLocation}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground">
                Uploaded batch is shown read-only. <button type="button" onClick={() => setPages(null)} className="text-blue-600 hover:underline">Clear</button> to paste a plain URL list instead.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulk-items">{mode === "evaluate" ? "Target URLs (one per line)" : "Topics (one per line)"}</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-3 w-3" /> Upload JSON
                  </Button>
                </div>
              </div>
              <textarea
                id="bulk-items"
                className={`${selectClass} min-h-32 py-2 font-mono`}
                placeholder={
                  mode === "evaluate"
                    ? "https://example.com\nhttps://example.org\n\n…or upload a source→target batch (JSON) to compare against PDFs/pages"
                    : "rooftop solar panel maintenance guide\nski wax temperature selection guide"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void onFile(f);
                }}
                onDragOver={(e) => e.preventDefault()}
              />
              <p className="text-sm text-muted-foreground">
                {itemCount} item{itemCount === 1 ? "" : "s"} · drop a `.json` batch here or paste a list.
                {mode === "evaluate" && " URLs pasted here are scored target-only (no source comparison)."}
              </p>
            </div>
          )}

          {realBackend && itemCount > 3 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {itemCount} full-loop runs on the <span className="font-semibold">{backend}</span> backend will author real
                pages and can be slow/costly. Start small.
              </span>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />{" "}
                  {mode === "full-loop" ? `Submitting ${submitted}/${itemCount}…` : "Submitting…"}
                </>
              ) : (
                `Run batch (${itemCount})`
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
