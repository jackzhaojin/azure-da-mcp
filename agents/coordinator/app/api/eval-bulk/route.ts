import { NextResponse } from "next/server";
import { coordinatorPost } from "@/lib/coordinator-api";
import { sessionEmail } from "@/auth";

export const dynamic = "force-dynamic";

// The bulk lane: the dashboard POSTs the WHOLE parsed batch once; the A2A layer's
// /store/eval-bulk mints the batch and fans out per-item eval-direct runs (source →
// target comparison, exactly like v1). Heavy lifting is backend-owned — the browser
// neither mints the batchId nor loops. Same DB-free Next pattern as /api/eval-direct:
// loopback to Express, edge token + SSO identity injected server-side.

interface BulkItem {
  targetUrl?: string;
  sourceType?: "pdf" | "webpage" | "none";
  sourceLocation?: string;
  dimensions?: string[];
  title?: string;
}

interface EvalBulkBody {
  items?: BulkItem[];
  fanOut?: number;
  dimensions?: string[];
  batchId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as EvalBulkBody;
  const items = Array.isArray(body.items) ? body.items : [];
  // Sanitize each item to the eval-direct shape; drop empties. Source is forwarded
  // only when a non-"none" type carries a location, so the engine compares against it.
  const cleanItems = items
    .map((it) => {
      const targetUrl = it.targetUrl?.trim();
      if (!targetUrl) return null;
      const sourceType = it.sourceType ?? "none";
      const out: Record<string, unknown> = { targetUrl, sourceType };
      if (sourceType !== "none" && it.sourceLocation?.trim()) out.sourceLocation = it.sourceLocation.trim();
      if (it.dimensions?.length) out.dimensions = it.dimensions;
      if (it.title?.trim()) out.title = it.title.trim();
      return out;
    })
    .filter(Boolean);

  if (cleanItems.length === 0) {
    return NextResponse.json({ error: "no valid items (each needs a targetUrl)" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    items: cleanItems,
    fanOut: Math.max(1, Number(body.fanOut ?? 1) || 1),
  };
  if (body.dimensions?.length) payload.dimensions = body.dimensions;
  if (body.batchId?.trim()) payload.batchId = body.batchId.trim();
  // SSO identity → runs.user_email; from the session, never the client body.
  const requestedBy = await sessionEmail();
  if (requestedBy) payload.requestedBy = requestedBy;

  try {
    const { status, body: out } = await coordinatorPost<{ batchId?: string; runIds?: string[]; error?: string }>(
      "/store/eval-bulk",
      payload
    );
    return NextResponse.json(out, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
