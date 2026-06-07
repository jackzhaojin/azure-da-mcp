"use client";

import { useEffect, useState } from "react";

interface Run {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  config: { targets?: string[]; fanOut?: number } | string;
  stats: {
    branches?: number;
    completed?: number;
    failed?: number;
    passRate?: number;
    overall?: { mean: number; stddev: number; min: number; max: number };
    perDimension?: Record<string, { mean: number; stddev: number; min: number; max: number; n: number }>;
  } | null;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string>("");

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const res = await fetch("/api/runs");
        if (res.ok && live) {
          setRuns(((await res.json()) as { runs: Run[] }).runs);
          setLastFetch(new Date().toLocaleTimeString());
        }
      } catch {
        /* next poll */
      }
    }
    void load();
    const timer = setInterval(load, 3000); // v1 is polling (PRD part-6)
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <h2>
        Runs <span className="dim">auto-refresh 3s{lastFetch ? ` · last ${lastFetch}` : ""}</span>
      </h2>
      {runs.length === 0 && <p className="dim">No runs yet — submit one from Trigger.</p>}
      <table>
        <thead>
          <tr>
            <th>started</th>
            <th>kind</th>
            <th>targets</th>
            <th>status</th>
            <th>score μ±σ</th>
            <th>pass</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <RunRow key={r.id} run={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
          ))}
        </tbody>
      </table>
    </>
  );
}

function RunRow({ run, expanded, onToggle }: { run: Run; expanded: boolean; onToggle: () => void }) {
  const cfg = typeof run.config === "object" ? run.config : {};
  const targets = cfg.targets?.length ?? 0;
  const fanOut = cfg.fanOut ?? 1;
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <td>{run.createdAt?.slice(0, 19).replace("T", " ")}</td>
        <td>{run.kind}</td>
        <td>
          {targets} × {fanOut}
        </td>
        <td className={`status-${run.status}`}>{run.status}</td>
        <td>{run.stats?.overall ? `${run.stats.overall.mean} ± ${run.stats.overall.stddev}` : "—"}</td>
        <td>{run.stats?.passRate !== undefined ? `${Math.round(run.stats.passRate * 100)}%` : "—"}</td>
      </tr>
      {expanded && run.stats?.perDimension && (
        <tr>
          <td colSpan={6}>
            <div className="card">
              <strong>Variance per dimension</strong> <span className="dim">({run.stats.completed}/{run.stats.branches} branches)</span>
              <table>
                <thead>
                  <tr>
                    <th>dimension</th>
                    <th>mean</th>
                    <th>stddev</th>
                    <th>min</th>
                    <th>max</th>
                    <th>n</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(run.stats.perDimension).map(([dim, s]) => (
                    <tr key={dim}>
                      <td>{dim}</td>
                      <td>{s.mean}</td>
                      <td>{s.stddev}</td>
                      <td>{s.min}</td>
                      <td>{s.max}</td>
                      <td>{s.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dim">
                run <code>{run.id}</code>
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
