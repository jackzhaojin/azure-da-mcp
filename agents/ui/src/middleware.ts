import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "ui-auth";

async function expectedToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`agents-ui:${password}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.UI_PASSWORD;
  if (!password) return NextResponse.next(); // auth disabled (local dev)

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === (await expectedToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
