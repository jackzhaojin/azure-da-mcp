import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AGENTS = () => [
  { id: "content-gen", url: process.env.CONTENT_GEN_URL ?? "http://localhost:4002" },
  { id: "migration", url: process.env.MIGRATION_AGENT_URL ?? "http://localhost:4003" },
  { id: "eval", url: process.env.EVAL_AGENT_URL ?? "http://localhost:4001" },
];

/** GET /api/mesh — health of the downstream agents the coordinator fans out to. */
export async function GET() {
  const checks = await Promise.all(
    AGENTS().map(async (a) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(`${a.url}/health`, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        return { ...a, up: res.ok };
      } catch {
        return { ...a, up: false };
      }
    })
  );
  return NextResponse.json({ coordinator: { id: "coordinator", up: true }, agents: checks });
}
