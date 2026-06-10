import { NextResponse } from "next/server";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import { coordinatorGet, COORDINATOR_BASE, meshFetch } from "@/lib/coordinator-api";
import type { RunView } from "@/lib/types";

export const dynamic = "force-dynamic";

type RunDetail = RunView & { a2aTaskId?: string | null; a2aState?: string };

/**
 * GET /api/runs/:id — full run detail via the A2A layer's /runs/:id (loopback).
 * For in-flight runs we also tasks/get the coordinate.run task over a2a-js and
 * attach its live protocol state — the store row and the A2A task are two views
 * of the same run, and surfacing both keeps them honest.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { status, body } = await coordinatorGet<{ run?: RunDetail; error?: string }>(`/store/runs/${id}`);
    if (status !== 200 || !body.run) return NextResponse.json(body, { status });

    const run = body.run;
    if (run.status === "running" && run.a2aTaskId) {
      try {
        const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl: meshFetch() })] });
        const client = await factory.createFromUrl(COORDINATOR_BASE());
        const task = await client.getTask({ id: run.a2aTaskId });
        run.a2aState = task.status.state;
      } catch {
        /* enrichment only — the store view stands on its own */
      }
    }
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
