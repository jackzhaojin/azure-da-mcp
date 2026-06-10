import { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Auth.js derives the OAuth redirect_uri from request.url, but behind the
 * custom Express server (and the cloudflared tunnel / Cloudflare Worker) that
 * URL carries the internal origin. Rebuild it from the request headers so the
 * SAME server serves Google sign-in on http://localhost:4004 AND the public
 * hostname (x-forwarded-* set by the proxy; trustHost is on in auth.ts).
 * Same trick as next-auth's own reqWithEnvURL, minus pinning one AUTH_URL.
 */
function withRequestOrigin(req: NextRequest): NextRequest {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return req;
  const proto = (req.headers.get("x-forwarded-proto") ?? "http").replace(/:$/, "");
  const url = new URL(req.url);
  return new NextRequest(`${proto}://${host}${url.pathname}${url.search}`, req);
}

export const GET = (req: NextRequest) => handlers.GET(withRequestOrigin(req));
export const POST = (req: NextRequest) => handlers.POST(withRequestOrigin(req));
