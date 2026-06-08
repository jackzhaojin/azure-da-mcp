import { Container, getContainer } from "@cloudflare/containers";
// @ts-ignore — wrangler Text rule turns this into a string
import PAGE from "./page.html";

export class SseTestContainer extends Container {
  defaultPort = 8080;
  // DELIBERATELY aggressive. The experiment: does an OPEN SSE stream keep the
  // container alive past this timeout? (cloudflare/containers #147 / #162)
  // If the stream survives 10 min with sleepAfter=2m → in-flight streams block sleep.
  // If it dies at ~2m → we must manage sleepAfter >= task duration (or renew).
  sleepAfter = "2m";

  override onStart() {
    console.log(`[worker] container onStart ${new Date().toISOString()}`);
  }
  override onStop() {
    console.log(`[worker] container onStop ${new Date().toISOString()}`);
  }
  override onError(error: unknown) {
    console.log(`[worker] container onError`, error);
  }
}

interface Env {
  SSE_TEST_CONTAINER: DurableObjectNamespace<SseTestContainer>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Test page — served by the Worker directly, never touches the container,
    // so loading/refreshing the page does NOT renew container activity.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const container = getContainer(env.SSE_TEST_CONTAINER, "singleton");

    // Mitigation escape hatch: explicitly renew the container's activity timeout.
    if (url.pathname === "/renew") {
      await container.renewActivityTimeout();
      return new Response(JSON.stringify({ renewed: true, at: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // /sse, /stats, /health → proxied into the container
    return container.fetch(request);
  },
};
