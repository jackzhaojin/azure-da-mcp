import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google SSO for the coordinator dashboard (Auth.js v5, JWT sessions — the
 * Next side stays database-free). Enabled only when Google credentials are
 * configured; unset = open dashboard (local dev / CI), same semantics as the
 * mesh/edge tokens. Env: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET,
 * optional AUTH_ALLOWED_EMAILS (comma-separated; unset = any Google account).
 */
export const authEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Served on localhost:4004 AND behind the tunnel (dash.xpri.ai) — derive the
  // callback origin from the request rather than a fixed AUTH_URL.
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? (authEnabled ? undefined : "auth-disabled-placeholder"),
  session: { strategy: "jwt" },
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ user }) {
      if (!allowedEmails.length) return true;
      return Boolean(user.email && allowedEmails.includes(user.email.toLowerCase()));
    },
  },
});

/** The signed-in user's email, or null when auth is disabled / signed out. */
export async function sessionEmail(): Promise<string | null> {
  if (!authEnabled) return null;
  const session = await auth();
  return session?.user?.email ?? null;
}
