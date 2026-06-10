/**
 * Server-only loopback client for the Express/A2A side of this same process.
 * The Next.js backend owns NO database — all reads go through the A2A layer's
 * /runs endpoints and all writes through /a2a (see app/api/trigger).
 */

export const COORDINATOR_BASE = () => process.env.COORDINATOR_URL ?? `http://localhost:${process.env.PORT ?? 4004}`;

/** Edge token gates /runs (and /hooks); mirrors a2a-common's fallback chain. */
function edgeToken(): string | undefined {
  return process.env.A2A_EDGE_TOKEN || process.env.A2A_MESH_TOKEN || undefined;
}

export async function coordinatorGet<T>(path: string): Promise<{ status: number; body: T }> {
  const token = edgeToken();
  const res = await fetch(`${COORDINATOR_BASE()}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** Bearer-injecting fetch for a2a-js clients (mesh token, not edge token). */
export function meshFetch(): typeof fetch {
  const token = process.env.A2A_MESH_TOKEN;
  return token
    ? (input, init = {}) =>
        fetch(input, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })
    : fetch;
}
