import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  D1_PROBE_CONTAINER: DurableObjectNamespace<D1ProbeContainer>;
  DB: D1Database;
  D1_PROXY_SECRET: string;
}

/**
 * Container backed by a Durable Object. The container process does NOT receive
 * the D1 binding (Cloudflare Containers get no native bindings — only string env
 * vars). We therefore inject the Worker's own public URL + the shared secret as
 * env vars so the container can call BACK into this Worker's /d1/query endpoint.
 */
export class D1ProbeContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "5m";

  // These string env vars ARE visible inside the container (process.env).
  // BASE_URL is populated per-request (see worker fetch) because the container
  // needs to know its own Worker's public hostname to call back.
  envVars: Record<string, string> = {};

  override onStart() {
    console.log(`[worker] D1ProbeContainer onStart ${new Date().toISOString()}`);
  }
  override onError(error: unknown) {
    console.log(`[worker] D1ProbeContainer onError`, error);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- /health: served by the Worker itself, never touches the container ---
    if (url.pathname === "/health") {
      return json({ ok: true, worker: "cf-d1-container-poc", at: new Date().toISOString() });
    }

    // --- /d1/query: the secret-gated D1 proxy the CONTAINER calls back into. ---
    // This runs in the Worker, which HAS the D1 binding (env.DB).
    if (url.pathname === "/d1/query" && request.method === "POST") {
      const auth = request.headers.get("x-d1-secret");
      if (!auth || auth !== env.D1_PROXY_SECRET) {
        return json({ error: "forbidden: bad or missing x-d1-secret" }, 403);
      }
      let payload: { sql?: string; params?: unknown[] };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "bad json body" }, 400);
      }
      if (!payload.sql) return json({ error: "missing sql" }, 400);
      try {
        const stmt = env.DB.prepare(payload.sql).bind(...(payload.params ?? []));
        const result = await stmt.all();
        return json({
          success: result.success,
          results: result.results,
          meta: result.meta, // includes D1-side timings
        });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e) }, 500);
      }
    }

    // --- /proxy-test and everything else → proxied into the container ---
    // We inject WORKER_BASE_URL (this Worker's public origin) + the secret so
    // the container's /run-test can call back to /d1/query without hardcoding
    // the workers.dev hostname at build time.
    //
    // NOTE: container env vars are only consumed at container START. We set them
    // on the stub (used on cold start) AND explicitly start() the container with
    // the same startOptions so the very first boot of a fresh deploy gets them.
    // (If the container is already running, start() is a no-op and the running
    // process keeps whatever env it booted with — pass ?base=&secret= to
    // /run-test to override per-request, which is the robust measurement path.)
    const container = getContainer(env.D1_PROBE_CONTAINER, "singleton");
    const startOptions = {
      envVars: {
        WORKER_BASE_URL: url.origin,
        D1_PROXY_SECRET: env.D1_PROXY_SECRET,
      },
    };
    container.envVars = startOptions.envVars;
    try {
      await container.startAndWaitForPorts({ ports: [8080], startOptions });
    } catch {
      // already running / race — ignore, fetch below still works
    }
    return container.fetch(request);
  },
};
