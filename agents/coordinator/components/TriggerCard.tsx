"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rocket, Loader2 } from "lucide-react";
import type { HistoryEntry } from "@/lib/types";

const GOALS = [
  { value: "full-loop", label: "Full loop — generate → migrate → evaluate" },
  { value: "generate+migrate", label: "Generate + migrate (no eval)" },
  { value: "evaluate", label: "Evaluate URLs only" },
  { value: "auto", label: "Auto — infer the route" },
] as const;

const BACKENDS = [
  { value: "dryrun", label: "dryrun — instant, no real writes" },
  { value: "opencode", label: "opencode — Kimi K2.6 authors real da.live pages" },
  { value: "makecom", label: "makecom — Make.com scenario" },
  { value: "sdk", label: "sdk — Claude Agent SDK (stub)" },
] as const;

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function TriggerCard({ onTriggered }: { onTriggered: (entry: HistoryEntry) => void }) {
  const [goal, setGoal] = useState<string>("full-loop");
  const [topic, setTopic] = useState("");
  const [targets, setTargets] = useState("");
  const [backend, setBackend] = useState("dryrun");
  const [legacyStyle, setLegacyStyle] = useState("dated");
  const [fanOut, setFanOut] = useState(1);
  const [site, setSite] = useState("da-live-postal-2025-07");
  const [owner, setOwner] = useState("jackzhaojin");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluateOnly = goal === "evaluate";
  const realBackend = backend !== "dryrun" && !evaluateOnly;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { goal, fanOut, backend: evaluateOnly ? undefined : backend };
      if (evaluateOnly) {
        body.targets = targets.split(/\n+/).map((t) => t.trim()).filter(Boolean);
      } else {
        body.topic = topic;
        body.legacyStyle = legacyStyle;
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
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error ?? "trigger failed (no run id)");
      onTriggered({
        runId: json.runId,
        goal,
        label: evaluateOnly ? targets.split(/\n+/)[0]?.trim() ?? "evaluation" : topic || "untitled run",
        backend: evaluateOnly ? undefined : backend,
        fanOut,
        triggeredAt: new Date().toISOString(),
        status: "running",
      });
      setTopic("");
      setTargets("");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  };

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
                <div className="space-y-2">
                  <Label htmlFor="style">Legacy source style</Label>
                  <select id="style" className={selectClass} value={legacyStyle} onChange={(e) => setLegacyStyle(e.target.value)}>
                    <option value="clean">clean</option>
                    <option value="dated">dated</option>
                    <option value="messy">messy</option>
                  </select>
                </div>
              </div>
              {realBackend && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="space-y-2">
                    <Label htmlFor="owner">da.live owner</Label>
                    <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="site">da.live site</Label>
                    <Input id="site" value={site} onChange={(e) => setSite(e.target.value)} required />
                  </div>
                  <p className="text-sm text-muted-foreground md:col-span-2">
                    Real pages will be authored and preview-published under this site.
                  </p>
                </div>
              )}
            </>
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
