"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "./types";

/** Poll a JSON endpoint on an interval (paused when intervalMs is null). */
export function usePoll<T>(
  url: string,
  intervalMs: number | null
): { data: T | null; error: string | null; lastUpdated: Date | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          // keep the human-readable reason when the API provides one
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `request failed (HTTP ${res.status})`);
        }
        const json = (await res.json()) as T;
        if (alive) {
          setData(json);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    if (intervalMs === null) return () => void (alive = false);
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data, error, lastUpdated };
}

const HISTORY_KEY = "coordinator-history-v1";
const HISTORY_MAX = 50;

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * Browser-local run history (v1 decision: localStorage). The store stays the
 * durable source of truth; this is "what I ran from this browser".
 */
export function useRunHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => setHistory(readHistory()), []);

  const persist = useCallback((entries: HistoryEntry[]) => {
    setHistory(entries);
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch {
      /* quota/private mode — history is best-effort */
    }
  }, []);

  const add = useCallback(
    (entry: HistoryEntry) => persist([entry, ...readHistory().filter((e) => e.runId !== entry.runId)].slice(0, HISTORY_MAX)),
    [persist]
  );

  /** Update outcome fields once a run reaches a terminal state. */
  const update = useCallback(
    (runId: string, patch: Partial<HistoryEntry>) =>
      persist(readHistory().map((e) => (e.runId === runId ? { ...e, ...patch } : e))),
    [persist]
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { history, add, update, clear };
}

/** Live elapsed label for running rows. */
export function useElapsed(sinceIso: string | null, running: boolean): string {
  const [, force] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);
  if (!sinceIso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(sinceIso + (sinceIso.endsWith("Z") ? "" : "Z")).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
