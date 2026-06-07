/**
 * Shared-secret auth (scaffold — PRD part-6 open question #6 picks the real
 * mechanism by M4: Cloudflare Access vs Auth.js vs this). Cookie carries a
 * SHA-256 of the password; auth is disabled entirely when UI_PASSWORD is unset.
 */
export const AUTH_COOKIE = "ui-auth";

export async function expectedToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`agents-ui:${password}`));
  return Buffer.from(digest).toString("hex");
}

export function authEnabled(): boolean {
  return Boolean(process.env.UI_PASSWORD);
}
