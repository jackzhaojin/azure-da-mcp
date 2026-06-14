import { NextResponse } from "next/server";
import { coordinatorPost } from "@/lib/coordinator-api";
import { sessionEmail } from "@/auth";

export const dynamic = "force-dynamic";

// The deterministic lane: the dashboard addresses the EVAL AGENT directly (via the
// A2A layer's /store/eval-direct, which calls the eval agent — NOT coordinate.run).
// Same DB-free Next backend pattern as /api/trigger: loopback to Express, edge
// token + SSO identity injected server-side; the browser never sees a token.

interface EvalDirectBody {
  targetUrl?: string;
  sourceType?: "pdf" | "webpage" | "none";
  sourceLocation?: string;
  dimensions?: string[];
  fanOut?: number;
  batchId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as EvalDirectBody;
  const payload: Record<string, unknown> = {
    targetUrl: body.targetUrl?.trim(),
    sourceType: body.sourceType ?? "none",
    fanOut: Math.max(1, Number(body.fanOut ?? 1) || 1),
  };
  if (body.sourceLocation?.trim()) payload.sourceLocation = body.sourceLocation.trim();
  if (body.dimensions?.length) payload.dimensions = body.dimensions;
  if (body.batchId?.trim()) payload.batchId = body.batchId.trim();
  // SSO identity → runs.user_email; from the session, never the client body.
  const requestedBy = await sessionEmail();
  if (requestedBy) payload.requestedBy = requestedBy;

  try {
    const { status, body: out } = await coordinatorPost<{ runId?: string; error?: string }>("/store/eval-direct", payload);
    return NextResponse.json(out, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
