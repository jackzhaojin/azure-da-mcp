import { NextResponse } from "next/server";
import { listRuns, findRunByContext } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/runs — recent runs (light). ?contextId= resolves a trigger's contextId to its run. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const contextId = url.searchParams.get("contextId");
  if (contextId) {
    const run = findRunByContext(contextId);
    return NextResponse.json({ run });
  }
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30) || 30, 100);
  return NextResponse.json({ runs: listRuns(limit) });
}
