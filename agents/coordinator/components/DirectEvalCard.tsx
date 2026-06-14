"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Target, Loader2, AlertTriangle } from "lucide-react";
import { usePoll } from "@/lib/hooks";
import type { MeshStatus } from "@/lib/types";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const DIMENSIONS = ["structure", "accessibility", "content", "visual"] as const;

/**
 * Deterministic lane: scores a single URL by addressing the EVAL AGENT directly
 * (not via the coordinator's generate→migrate→evaluate routing). Lets you pick a
 * subset of dimensions — the v2 per-dimension capability.
 */
export function DirectEvalCard() {
  const router = useRouter();
  const [targetUrl, setTargetUrl] = useState("");
  const [sourceType, setSourceType] = useState<"none" | "webpage" | "pdf">("none");
  const [sourceLocation, setSourceLocation] = useState("");
  const [dims, setDims] = useState<string[]>([...DIMENSIONS]);
  const [fanOut, setFanOut] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: mesh } = usePoll<MeshStatus>("/api/mesh", 10000);
  const evalDown = mesh?.agents.some((a) => a.id === "eval" && !a.up);

  // content needs a source — disable + drop it when sourceType is none
  const contentDisabled = sourceType === "none";
  const effectiveDims = contentDisabled ? dims.filter((d) => d !== "content") : dims;

  const toggle = (d: string) =>
    setDims((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^https?:\/\//.test(targetUrl.trim())) {
      setError("enter a valid http(s) target URL");
      return;
    }
    if (effectiveDims.length === 0) {
      setError("select at least one dimension");
      return;
    }
    if (sourceType !== "none" && !sourceLocation.trim()) {
      setError(`a ${sourceType} source location is required for content comparison`);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        targetUrl: targetUrl.trim(),
        sourceType,
        fanOut,
        // all four selected = run them all (omit the subset)
        ...(effectiveDims.length < DIMENSIONS.length ? { dimensions: effectiveDims } : {}),
      };
      if (sourceType !== "none") body.sourceLocation = sourceLocation.trim();
      const res = await fetch("/api/eval-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error ?? `eval failed (HTTP ${res.status})`);
      router.push(`/runs/${json.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Direct eval
        </CardTitle>
        <CardDescription>
          Score one page deterministically by calling the <span className="font-medium">eval agent</span> directly — no
          generate/migrate orchestration. Pick the dimensions you want.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="targetUrl">Target URL</Label>
            <Input
              id="targetUrl"
              placeholder="https://main--site--owner.aem.page/path"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sourceType">Compare against</Label>
              <select
                id="sourceType"
                className={selectClass}
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
              >
                <option value="none">none — skip content fidelity</option>
                <option value="webpage">a source webpage</option>
                <option value="pdf">a source PDF</option>
              </select>
            </div>
            {sourceType !== "none" && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sourceLocation">Source location</Label>
                <Input
                  id="sourceLocation"
                  placeholder={sourceType === "pdf" ? "https://…/spec.pdf" : "https://…/original-page"}
                  value={sourceLocation}
                  onChange={(e) => setSourceLocation(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Dimensions</Label>
            <div className="flex flex-wrap gap-2">
              {DIMENSIONS.map((d) => {
                const disabled = d === "content" && contentDisabled;
                const on = effectiveDims.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => !disabled && toggle(d)}
                    disabled={disabled}
                    className={`rounded-md border px-3 py-1 text-sm font-medium capitalize transition-colors ${
                      disabled
                        ? "opacity-40 cursor-not-allowed border-input"
                        : on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent border-input hover:bg-gray-50"
                    }`}
                    title={disabled ? "content needs a source — pick a source above" : undefined}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              {effectiveDims.length} of 4 dimensions · omitted dimensions are excluded from the score, not failed.
            </p>
          </div>

          <div className="space-y-2 max-w-40">
            <Label htmlFor="eval-fanout">Fan-out (variance)</Label>
            <Input
              id="eval-fanout"
              type="number"
              min={1}
              max={8}
              value={fanOut}
              onChange={(e) => setFanOut(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          {evalDown && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>The eval agent is currently unreachable — this run will fail until it comes back.</span>
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
                "Evaluate"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
