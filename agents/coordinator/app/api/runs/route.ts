import { NextResponse } from "next/server";
import { coordinatorGet } from "@/lib/coordinator-api";
import { authEnabled, sessionEmail } from "@/auth";
import type { RunView } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/runs — recent runs; ?contextId= resolves a trigger to its run.
 * Pure proxy to the A2A layer's /runs (loopback) — no database access here.
 * With SSO enabled, the list is pinned to the session user (their runs +
 * unowned system runs) — the user param always comes from the session.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (authEnabled) {
    const email = await sessionEmail();
    if (!email) return NextResponse.json({ error: "unauthorized: sign in required" }, { status: 401 });
    url.searchParams.set("user", email);
  } else {
    url.searchParams.delete("user");
  }
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
