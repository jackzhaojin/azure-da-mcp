import * as Logger from './Logger.js';

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const IMS_SCOPES = 'openid,AdobeID,read_organizations,additional_info.projectedProductContext,aem.frontend.all';
const REFRESH_MARGIN_MS = 60_000;

// Module-scope cache — survives across invocations on the same Function instance.
// Lost on instance recycle / cold start (acceptable: re-mint costs one IMS round-trip).
let cached = null;            // { accessToken, expiresAt }
let pendingMint = null;       // Promise — dedupes concurrent first-callers

export async function getServerToken(context) {
  const clientId = process.env.ADOBE_DEVELOPER_CONSOLE_CLIENT_ID;
  const clientSecret = process.env.ADOBE_DEVELOPER_CONSOLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    const ttlSec = Math.round((cached.expiresAt - Date.now()) / 1000);
    Logger.info('[IMS] cache hit', { ttlSec }, context);
    return cached.accessToken;
  }

  if (pendingMint) {
    Logger.info('[IMS] dedupe: awaiting in-flight mint', {}, context);
    return pendingMint;
  }

  Logger.info('[IMS] cache miss → minting fresh', {}, context);
  pendingMint = mintFresh(clientId, clientSecret, context)
    .then((tok) => {
      cached = tok;
      pendingMint = null;
      return tok.accessToken;
    })
    .catch((err) => {
      pendingMint = null;
      throw err;
    });

  return pendingMint;
}

async function mintFresh(clientId, clientSecret, context) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: IMS_SCOPES,
  });

  const startedAt = Date.now();
  const res = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const msg = `IMS token mint failed: ${res.status} ${res.statusText} — ${errBody.slice(0, 300)}`;
    Logger.error('[IMS] mint failed', { status: res.status, body: errBody.slice(0, 300) }, context);
    throw new Error(msg);
  }

  const json = await res.json();
  const expiresAt = Date.now() + Number(json.expires_in) * 1000;
  Logger.info('[IMS] mint succeeded', {
    elapsedMs: Date.now() - startedAt,
    expiresInSec: Number(json.expires_in),
    tokenLength: json.access_token.length,
  }, context);

  return { accessToken: json.access_token, expiresAt };
}

// Test helper — clears cache. Not exported in production paths.
export function _resetForTests() {
  cached = null;
  pendingMint = null;
}
