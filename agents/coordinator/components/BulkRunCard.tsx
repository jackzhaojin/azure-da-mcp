"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers, Loader2, AlertTriangle, Upload, Download, FileJson } from "lucide-react";

type Mode = "evaluate" | "full-loop";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const SAMPLES: Record<Mode, { file: string; label: string }> = {
  evaluate: { file: "/samples/evaluate-urls.json", label: "evaluate-urls.json" },
  "full-loop": { file: "/samples/full-loop-topics.json", label: "full-loop-topics.json" },
};

/** Accept either the clean `{items:[...]}` shape or a v1-style `{pages:[{webUrl|sourceUrl}]}`. */
function itemsFromJson(json: unknown): { mode?: Mode; items: string[] } {
  const obj = (json ?? {}) as Record<string, unknown>;
  const mode = obj.mode === "evaluate" || obj.mode === "full-loop" ? (obj.mode as Mode) : undefined;
  if (Array.isArray(obj.items)) return { mode, items: obj.items.map(String) };
  if (Array.isArray(obj.pages)) {
    const items = (obj.pages as Array<Record<string, unknown>>)
      .map((p) => p.webUrl ?? p.sourceUrl ?? p.url ?? p.topic ?? p.title)
      .filter(Boolean)
      .map(String);
    return { mode, items };
  }
  if (Array.isArray(json)) return { items: (json as unknown[]).map(String) };
  return { items: [] };
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

export function BulkRunCard() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("evaluate");
  const [text, setText] = useState("");
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
  const items = text
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const loadJson = (json: unknown) => {
    const parsed = itemsFromJson(json);
    if (parsed.mode) setMode(parsed.mode);
    setText(parsed.items.join("\n"));
    setError(parsed.items.length ? null : "no items found in that file (expected { items: [...] } or { pages: [...] })");
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError(mode === "evaluate" ? "add at least one URL (one per line)" : "add at least one topic (one per line)");
      return;
    }
    if (mode === "evaluate") {
      const bad = items.find((u) => !/^https?:\/\//.test(u));
      if (bad) {
        setError(`invalid URL: ${bad}`);
        return;
      }
    }
    setSubmitting(true);
    setSubmitted(0);
    const batchId = crypto.randomUUID();
    const failures: string[] = [];
    try {
      await runPool(
        items,
        3,
        async (item) => {
          const body: Record<string, unknown> = { goal: mode, fanOut, batchId };
          if (mode === "evaluate") {
            body.targets = [item];
          } else {
            body.topic = item;
            body.legacyStyle = legacyStyle;
            body.backend = backend;
            if (realBackend) {
              body.site = site;
              body.owner = owner;
            }
          }
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
      if (failures.length === items.length) {
        throw new Error(`all ${items.length} items failed to submit — ${failures[0]}`);
      }
      router.push(`/batch/${batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
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
          retry, and export.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mode">Mode</Label>
              <select id="mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="evaluate">Evaluate URLs — score existing pages</option>
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
                  ? "https://example.com\nhttps://example.org"
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
              {items.length} item{items.length === 1 ? "" : "s"} · drop a `.json` batch here or paste a list.
            </p>
          </div>

          {realBackend && items.length > 3 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {items.length} full-loop runs on the <span className="font-semibold">{backend}</span> backend will author real
                pages and can be slow/costly. Start small.
              </span>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting {submitted}/{items.length}…
                </>
              ) : (
                `Run batch (${items.length})`
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
