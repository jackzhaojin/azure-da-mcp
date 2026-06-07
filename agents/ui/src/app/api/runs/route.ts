import { NextResponse } from "next/server";
import { readRuns } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = readRuns().map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    config: safeParse(r.config),
    stats: r.stats ? safeParse(r.stats) : null,
  }));
  return NextResponse.json({ runs });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
