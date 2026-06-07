import { NextResponse } from "next/server";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import { randomUUID } from "node:crypto";

const COORDINATOR_URL = process.env.COORDINATOR_URL ?? "http://localhost:4004";

/**
 * The UI is an A2A client with a browser face (PRD part-6): this API route
 * submits coordinate.run server-side — the mesh token never reaches the browser.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    targets?: string[];
    fanOut?: number;
  };
  const targets = (body.targets ?? []).map((t) => t.trim()).filter(Boolean);
  if (!targets.length) {
    return NextResponse.json({ error: "at least one target URL required" }, { status: 400 });
  }

  const token = process.env.A2A_MESH_TOKEN;
  const fetchImpl: typeof fetch = token
    ? (input, init = {}) =>
        fetch(input, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })
    : fetch;

  try {
    const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl })] });
    const client = await factory.createFromUrl(COORDINATOR_URL);
    const task = await client.sendMessage({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { goal: "evaluate", targets, fanOut: body.fanOut ?? 1 } }],
      },
      configuration: { blocking: false },
    });
    const t = task as { id: string; contextId: string; status?: { state: string } };
    return NextResponse.json({ taskId: t.id, contextId: t.contextId, state: t.status?.state ?? "submitted" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
