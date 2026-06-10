import { NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";

/**
 * Gates the dashboard pages + /api/* behind Google SSO when auth is configured
 * (no AUTH_GOOGLE_* env = open, local dev). The Express A2A surface (/a2a,
 * /hooks, /store, /health, agent card) never reaches this middleware — those
 * routes are handled before the Next catch-all and keep their bearer tokens.
 */
export default auth((req) => {
  if (!authEnabled || req.auth) return;
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized: sign in required" }, { status: 401 });
  }
  const login = new URL("/login", req.nextUrl);
  if (pathname !== "/") login.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
