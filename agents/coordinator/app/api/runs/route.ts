import { NextResponse } from "next/server";
import { coordinatorGet } from "@/lib/coordinator-api";
import type { RunView } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/runs — recent runs; ?contextId= resolves a trigger to its run.
 * Pure proxy to the A2A layer's /runs (loopback) — no database access here.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  try {
    const { status, body } = await coordinatorGet<{ runs?: RunView[]; run?: RunView | null; error?: string }>(
      `/store/runs${qs ? `?${qs}` : ""}`
    );
    return NextResponse.json(body, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
