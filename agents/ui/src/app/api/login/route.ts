import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, authEnabled } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true, note: "auth disabled" });

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== "string" || password !== process.env.UI_PASSWORD) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await expectedToken(password), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
