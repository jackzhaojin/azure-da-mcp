import { NextResponse } from "next/server";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import { randomUUID } from "node:crypto";
import { findRunByContext } from "@/lib/store";

export const dynamic = "force-dynamic";

// The Next.js backend is an A2A client of our own Express side (same process,
// same port) — all transactions go through coordinate.run; the browser never
// talks A2A and the mesh token never leaves the server.
const SELF_A2A = () => process.env.COORDINATOR_URL ?? `http://localhost:${process.env.PORT ?? 4004}`;

interface TriggerBody {
  goal?: string;
  topic?: string;
  targets?: string[];
  sourceLocation?: string;
  fanOut?: number;
  legacyStyle?: string;
  backend?: string;
  site?: string;
  owner?: string;
}

/** POST /api/trigger — submit coordinate.run (non-blocking), then resolve the run id. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as TriggerBody;
  const goal = body.goal ?? "full-loop";

  const data: Record<string, unknown> = { goal, fanOut: Math.max(1, Number(body.fanOut ?? 1) || 1) };
  if (body.topic?.trim()) data.topic = body.topic.trim();
  if (body.sourceLocation?.trim()) data.sourceLocation = body.sourceLocation.trim();
  const targets = (body.targets ?? []).map((t) => t.trim()).filter(Boolean);
  if (targets.length) data.targets = targets;
  if (body.legacyStyle) data.legacyStyle = body.legacyStyle;
  if (body.backend) data.backend = body.backend;
  if (body.site?.trim()) data.site = body.site.trim();
  if (body.owner?.trim()) data.owner = body.owner.trim();

  const token = process.env.A2A_MESH_TOKEN;
  const fetchImpl: typeof fetch = token
    ? (input, init = {}) =>
        fetch(input, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })
    : fetch;

  try {
    const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl })] });
    const client = await factory.createFromUrl(SELF_A2A());
    const task = await client.sendMessage({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data }],
      },
      configuration: { blocking: false },
    });
    const t = task as { id: string; contextId: string; status?: { state: string } };

    // The executor inserts the runs row almost immediately — give it a moment
    // so the UI gets a runId back in one round-trip.
    let runId: string | undefined;
    for (let i = 0; i < 10 && !runId; i++) {
      await new Promise((r) => setTimeout(r, 150));
      runId = findRunByContext(t.contextId)?.id;
    }

    return NextResponse.json({ taskId: t.id, contextId: t.contextId, state: t.status?.state ?? "submitted", runId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
