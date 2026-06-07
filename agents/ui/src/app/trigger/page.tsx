"use client";

import { useState } from "react";
import Link from "next/link";

export default function TriggerPage() {
  const [targets, setTargets] = useState("https://example.com");
  const [fanOut, setFanOut] = useState(1);
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult("");
    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: targets.split("\n").map((t) => t.trim()).filter(Boolean),
          fanOut,
        }),
      });
      const body = (await res.json()) as { taskId?: string; error?: string };
      setResult(res.ok ? `submitted — task ${body.taskId}` : `error: ${body.error}`);
    } catch (err) {
      setResult(`error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Trigger an eval batch</h2>
      <p className="dim">
        Submits <code>coordinate.run</code> (goal: evaluate) to the coordinator via this app&apos;s server-side A2A
        client. Watch progress on <Link href="/runs">Runs</Link>.
      </p>
      <form className="stack" onSubmit={submit}>
        <label>
          Target URLs (one per line)
          <textarea
            rows={4}
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            style={{ width: "100%", font: "inherit", background: "#1a1e26", color: "#eceff4", border: "1px solid #4c566a", borderRadius: 6, padding: "0.5rem" }}
          />
        </label>
        <label>
          Fan-out (runs per target):{" "}
          <input type="number" min={1} max={10} value={fanOut} onChange={(e) => setFanOut(Number(e.target.value))} style={{ width: 80 }} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "submitting…" : "Run batch"}
        </button>
        {result && <span className={result.startsWith("error") ? "status-failed" : "status-completed"}>{result}</span>}
      </form>
    </div>
  );
}
