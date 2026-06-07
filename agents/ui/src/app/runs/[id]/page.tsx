"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface StageInfo {
  stage: string;
  agent: string;
  state: string;
  durationMs: number;
  taskId?: string;
  error?: string;
}

interface RunDetail {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  config: { goal?: string; topic?: string; targets?: string[]; fanOut?: number; legacyStyle?: string; backend?: string };
  stats: {
    route?: string;
    branches?: number;
    completed?: number;
    failed?: number;
    passRate?: number;
    overall?: { mean: number; stddev: number; min: number; max: number };
    migrationConfidence?: { mean: number; stddev: number };
    perDimension?: Record<string, { mean: number; stddev: number; min: number; max: number; n: number }>;
    branchResults?: Array<{
      branch: number;
      state: string;
      sourceUrl?: string;
      target?: string;
      overallScore?: number;
      confidence?: number;
      error?: string;
      stages: StageInfo[];
    }>;
  } | null;
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    async function load() {
      try {
        const res = await fetch(`/api/runs/${id}`);
        if (!res.ok) {
          setError(`run not found (${res.status})`);
          return;
        }
        const body = (await res.json()) as { run: RunDetail };
        if (!live) return;
        setRun(body.run);
        if (body.run.status !== "running" && timer) clearInterval(timer); // stop polling once terminal
      } catch {
        /* next poll */
      }
    }
    void load();
    timer = setInterval(load, 3000);
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [id]);

  if (error) return <p className="status-failed">{error}</p>;
  if (!run) return <p className="dim">loading…</p>;

  const s = run.stats;
  return (
    <>
      <p className="dim">
        <Link href="/runs">← Runs</Link>
      </p>
      <h2>
        {s?.route ?? run.kind} <span className={`status-${run.status}`}>{run.status}</span>
      </h2>
      <p className="dim">
        run <code>{run.id}</code> · started {run.createdAt?.slice(0, 19).replace("T", " ")}
        {run.completedAt ? ` · finished ${run.completedAt.slice(0, 19).replace("T", " ")}` : ""}
      </p>

      {run.config && (
        <div className="card">
          {run.config.topic && (
            <>
              topic: <strong>{run.config.topic}</strong>{" "}
              {run.config.legacyStyle && <span className="dim">({run.config.legacyStyle} markup)</span>}
              <br />
            </>
          )}
          {run.config.targets && <span className="dim">targets: {run.config.targets.join(", ")}</span>}
          {run.config.backend && <span className="dim"> · backend: {run.config.backend}</span>}
          {run.config.fanOut && <span className="dim"> · fan-out: {run.config.fanOut}</span>}
        </div>
      )}

      {s?.overall && (
        <div className="card">
          <strong>
            score {s.overall.mean} ± {s.overall.stddev}
          </strong>{" "}
          <span className="dim">
            (min {s.overall.min} / max {s.overall.max}) · pass {Math.round((s.passRate ?? 0) * 100)}% · {s.completed}/{s.branches}{" "}
            branches{s.failed ? ` · ${s.failed} failed` : ""}
            {s.migrationConfidence ? ` · migration confidence ${s.migrationConfidence.mean}` : ""}
          </span>
        </div>
      )}

      {s?.branchResults && (
        <div className="card">
          <strong>Branches</strong>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>stages</th>
                <th>score</th>
                <th>conf</th>
                <th>page</th>
              </tr>
            </thead>
            <tbody>
              {s.branchResults.map((b) => (
                <tr key={b.branch}>
                  <td className={`status-${b.state}`}>{b.branch}</td>
                  <td>
                    {b.stages.map((st) => (
                      <span key={st.stage} className={`status-${st.state}`} title={st.error ?? `${st.durationMs}ms`}>
                        {st.stage}
                        {st.state !== "completed" ? "✗" : "✓"}{" "}
                      </span>
                    ))}
                  </td>
                  <td>{b.overallScore ?? "—"}</td>
                  <td>{b.confidence ?? "—"}</td>
                  <td>
                    {b.target ? (
                      <a href={b.target} target="_blank" rel="noreferrer" className="dim">
                        {b.target.length > 48 ? b.target.slice(0, 48) + "…" : b.target}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s?.perDimension && Object.keys(s.perDimension).length > 0 && (
        <div className="card">
          <strong>Variance per dimension</strong>
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
              {Object.entries(s.perDimension).map(([dim, d]) => (
                <tr key={dim}>
                  <td>{dim}</td>
                  <td>{d.mean}</td>
                  <td>{d.stddev}</td>
                  <td>{d.min}</td>
                  <td>{d.max}</td>
                  <td>{d.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
