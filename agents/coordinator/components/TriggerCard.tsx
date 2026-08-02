"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rocket, Loader2, AlertTriangle } from "lucide-react";
import { usePoll } from "@/lib/hooks";
import type { HistoryEntry, MeshStatus, RunView } from "@/lib/types";

const GOALS = [
  { value: "full-loop", label: "Full loop — generate → migrate → evaluate" },
  { value: "generate+migrate", label: "Generate + migrate (no eval)" },
  { value: "migrate", label: "Migrate a real page — source URL → da.live" },
  { value: "evaluate", label: "Evaluate URLs only" },
  { value: "auto", label: "Auto — infer the route" },
] as const;

const BACKENDS = [
  { value: "dryrun", label: "dryrun — instant, no real writes" },
  { value: "opencode", label: "opencode — Kimi (K3 / K2.7) authors real da.live pages" },
  { value: "makecom", label: "makecom — Make.com scenario" },
  { value: "sdk", label: "sdk — Claude Agent SDK (stub)" },
] as const;

/** Kimi model per run (opencode only) — ids must be declared in opencode's
 *  provider models map (same rule as the daily-loop workflow's dropdown). */
const KIMI_MODELS = [
  { value: "", label: "agent default (KIMI_MODEL_ID)" },
  { value: "k3", label: "k3 — Kimi K3" },
  { value: "kimi-for-coding", label: "kimi-for-coding — moving alias (K2.7 Coding)" },
] as const;

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Which downstream agents a route actually needs (mesh ids from /api/mesh). */
function requiredAgents(goal: string): string[] {
  switch (goal) {
    case "evaluate":
      return ["eval"];
    case "generate+migrate":
      return ["content-gen", "migration"];
    default: // full-loop, auto
      return ["content-gen", "migration", "eval"];
  }
}

export function TriggerCard({ onTriggered }: { onTriggered: (entry: HistoryEntry) => void }) {
  const [goal, setGoal] = useState<string>("full-loop");
  const [topic, setTopic] = useState("");
  const [targets, setTargets] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState("webpage");
  const [pageSlug, setPageSlug] = useState("");
  const [folder, setFolder] = useState("");
  const [evalAfter, setEvalAfter] = useState(true);
  const [backend, setBackend] = useState("dryrun");
  const [model, setModel] = useState("");
  const [legacyStyle, setLegacyStyle] = useState("dated");
  const [fanOut, setFanOut] = useState(1);
  const [site, setSite] = useState("adapt-to-2026-demo");
  const [owner, setOwner] = useState("jackzhaojin");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluateOnly = goal === "evaluate";
  const migrateLane = goal === "migrate";
  const realBackend = backend !== "dryrun" && !evaluateOnly;

  const { data: mesh } = usePoll<MeshStatus>("/api/mesh", 10000);
  const required = migrateLane ? ["migration", ...(evalAfter ? ["eval"] : [])] : requiredAgents(goal);
  const downAgents = required.filter((id) => mesh?.agents.some((a) => a.id === id && !a.up));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // migrate lane: 'auto' + sourceLocation resolves to migrate→evaluate; bare 'migrate' skips eval
      const submittedGoal = migrateLane && evalAfter ? "auto" : goal;
      const body: Record<string, unknown> = { goal: submittedGoal, fanOut, backend: evaluateOnly ? undefined : backend };
      if (evaluateOnly) {
        body.targets = targets.split(/\n+/).map((t) => t.trim()).filter(Boolean);
      } else if (migrateLane) {
        const urls = sourceUrl.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        if (urls.length > 1) body.sources = urls;
        else body.sourceLocation = urls[0] ?? "";
        body.sourceType = sourceType;
        // explicit slug is single-source only — multi-source slugs derive per URL
        if (urls.length === 1 && pageSlug.trim()) body.pageSlug = pageSlug.trim();
        if (folder.trim()) body.folder = folder.trim();
        if (realBackend) {
          body.site = site;
          body.owner = owner;
        }
      } else {
        body.topic = topic;
        body.legacyStyle = legacyStyle;
        if (realBackend) {
          body.site = site;
          body.owner = owner;
        }
      }
      if (realBackend && backend === "opencode" && model) body.model = model;
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { runId?: string; contextId?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `trigger failed (HTTP ${res.status})`);

      // The run was accepted (we have a contextId) — the runs row usually
      // resolves within the server's wait, but under load it can land late.
      // Keep resolving client-side instead of reporting a false failure.
      let runId = json.runId;
      if (!runId && json.contextId) {
        for (let i = 0; i < 10 && !runId; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const lookup = await fetch(`/api/runs?contextId=${encodeURIComponent(json.contextId)}`, { cache: "no-store" });
          const found = (await lookup.json().catch(() => null)) as { run?: RunView | null } | null;
          runId = found?.run?.id;
        }
      }
      if (!runId) throw new Error("run submitted but not yet visible — it should appear in Recent runs shortly");

      onTriggered({
        runId,
        goal: submittedGoal,
        label: evaluateOnly
          ? targets.split(/\n+/)[0]?.trim() ?? "evaluation"
          : migrateLane
            ? (() => {
                const urls = sourceUrl.split(/\n+/).map((s) => s.trim()).filter(Boolean);
                return urls.length > 1 ? `${urls[0]} +${urls.length - 1} more` : urls[0] || "migration";
              })()
            : topic || "untitled run",
        backend: evaluateOnly ? undefined : backend,
        fanOut,
        triggeredAt: new Date().toISOString(),
        status: "running",
      });
      setTopic("");
      setTargets("");
      setSourceUrl("");
      setPageSlug("");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  };

  const backendSelect = (
    <div className="space-y-2">
      <Label htmlFor="backend">Migration backend</Label>
      <select id="backend" className={selectClass} value={backend} onChange={(e) => setBackend(e.target.value)}>
        {BACKENDS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
    </div>
  );

  const siteOwnerBlock = realBackend && (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
      <div className="space-y-2">
        <Label htmlFor="owner">da.live owner</Label>
        <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="site">da.live site</Label>
        <Input id="site" value={site} onChange={(e) => setSite(e.target.value)} required />
      </div>
      {backend === "opencode" && (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="model">Kimi model</Label>
          <select id="model" className={selectClass} value={model} onChange={(e) => setModel(e.target.value)}>
            {KIMI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-sm text-muted-foreground md:col-span-2">
        Real pages will be authored and preview-published under this site.
      </p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          Start a run
        </CardTitle>
        <CardDescription>Submit a coordinate.run to the mesh — every transaction goes through the A2A backend.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal">Route</Label>
              <select id="goal" className={selectClass} value={goal} onChange={(e) => setGoal(e.target.value)}>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fanout">Fan-out (parallel branches)</Label>
              <Input
                id="fanout"
                type="number"
                min={1}
                max={8}
                value={fanOut}
                onChange={(e) => setFanOut(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          {evaluateOnly ? (
            <div className="space-y-2">
              <Label htmlFor="targets">Target URLs (one per line)</Label>
              <textarea
                id="targets"
                className={`${selectClass} min-h-20 py-2`}
                placeholder={"https://example.com/page-1\nhttps://example.com/page-2"}
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">Each URL is scored across structure, accessibility, content, and visual.</p>
            </div>
          ) : migrateLane ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="source">Source URLs (one per line)</Label>
                <textarea
                  id="source"
                  className={`${selectClass} min-h-20 py-2`}
                  placeholder={
                    "https://legacy-site.example.com/articles/page-one.html\nhttps://legacy-site.example.com/articles/page-two.html"
                  }
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Real legacy pages (or PDFs) to migrate into da.live — one branch per URL, no synthetic source. Paste a whole
                  site&apos;s article URLs to migrate the site.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sourcetype">Source type</Label>
                  <select id="sourcetype" className={selectClass} value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                    <option value="webpage">webpage</option>
                    <option value="pdf">pdf</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Page slug (optional, single URL only)</Label>
                  <Input id="slug" placeholder="derived from each source URL" value={pageSlug} onChange={(e) => setPageSlug(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {backendSelect}
                <div className="space-y-2">
                  <Label htmlFor="folder">Target folder (optional)</Label>
                  <Input
                    id="folder"
                    placeholder="site profile default — e.g. travel-journal-2026-08-02"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={evalAfter}
                  onChange={(e) => setEvalAfter(e.target.checked)}
                />
                <span>
                  Evaluate fidelity vs the source after migrating — route:{" "}
                  <span className="font-mono">{evalAfter ? "migrate → evaluate" : "migrate only"}</span>
                </span>
              </label>
              {siteOwnerBlock}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  placeholder="e.g. rooftop solar panel maintenance guide"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">content-gen synthesizes a legacy source page about this topic.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {backendSelect}
                <div className="space-y-2">
                  <Label htmlFor="style">Legacy source style</Label>
                  <select id="style" className={selectClass} value={legacyStyle} onChange={(e) => setLegacyStyle(e.target.value)}>
                    <option value="clean">clean</option>
                    <option value="dated">dated</option>
                    <option value="messy">messy</option>
                  </select>
                </div>
              </div>
              {siteOwnerBlock}
            </>
          )}

          {downAgents.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                This route needs <span className="font-semibold">{downAgents.join(", ")}</span> — currently unreachable. The run
                will fail at that stage unless the agent comes back.
              </span>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                "Run it"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
