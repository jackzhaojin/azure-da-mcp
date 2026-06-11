import { NextResponse } from "next/server";
import { coordinatorGet } from "@/lib/coordinator-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/evidence/:taskId — the eval report behind a branch score (findings,
 * per-dimension mode, screenshot URL). Pure proxy to the A2A layer's
 * /store/evidence/:taskId, which fetches the artifact from the eval agent via
 * tasks/get. Loaded on demand when a branch's evidence panel is expanded.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const { status, body } = await coordinatorGet<Record<string, unknown>>(
      `/store/evidence/${encodeURIComponent(taskId)}`
    );
    return NextResponse.json(body, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
