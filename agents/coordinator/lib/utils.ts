import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Store timestamps are UTC, sometimes without the trailing Z. */
function parseUtc(ts: string): Date {
  return new Date(ts.endsWith("Z") ? ts : `${ts}Z`);
}

/** Local-time display for store timestamps (previously shown as raw UTC). */
export function fmtLocal(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = parseUtc(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "3m ago"-style relative label; falls back to fmtLocal beyond a day. */
export function fmtRelative(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = parseUtc(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtLocal(ts);
}
