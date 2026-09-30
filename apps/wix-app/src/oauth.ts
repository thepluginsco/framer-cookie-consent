/**
 * Wix app authentication — OAuth client credentials + the signed app instance.
 *
 * Wix apps authenticate with the **OAuth client-credentials** flow (Wix's
 * default; the old authorization-code redirect is "custom authentication
 * (legacy)"): the Worker mints a short-lived access token for a site from the
 * app id + secret + that site's `instanceId`. Nothing is stored per site.
 *
 * The Worker learns — and trusts — the `instanceId` from the **signed app
 * instance** Wix appends to the dashboard page's iframe URL (`?instance=…`):
 * `<signature>.<payload>`, where signature = base64url(HMAC-SHA256(appSecret,
 * payload)) and payload = base64url(JSON { instanceId, … }). Verifying it with
 * the app secret proves the request comes from that site's dashboard, so a
 * write can never target another site.
 *
 * Pure apart from the injected `fetch` and Web Crypto (Workers + Node 18+).
 *
 * Sources (Wix, verified 2026-09-30):
 *   dev.wix.com/docs/api-reference/app-management/oauth-2/create-access-token
 *   dev.wix.com/docs/build-apps/develop-your-app/access/app-instances/parse-the-app-instance-query-parameter
 */

/** Wix's OAuth 2 token endpoint (client credentials). */
export const WIX_TOKEN_URL = "https://www.wixapis.com/oauth2/token";

/** Inputs for {@link createAccessToken}. */
export interface CreateAccessTokenParams {
  /** The app id (OAuth `client_id`). */
  appId: string;
  /** The app secret (OAuth `client_secret`). */
  appSecret: string;
  /** The site's app instance id (from the verified signed instance). */
  instanceId: string;
  /** Injected fetch (the Worker's global `fetch`); overridable in tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Mint an access token for one site's app instance (valid ~4 hours).
 *
 * @throws Error with the HTTP status + body when Wix rejects the request.
 */
export async function createAccessToken(params: CreateAccessTokenParams): Promise<string> {
  const doFetch = params.fetchImpl ?? fetch.bind(globalThis);
  const res = await doFetch(WIX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: params.appId,
      client_secret: params.appSecret,
      instance_id: params.instanceId,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Wix token request failed (${res.status}): ${detail}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Wix token response had no access_token");
  return body.access_token;
}

/** The fields we use from a verified app instance payload. */
export interface WixInstance {
  instanceId: string;
  [key: string]: unknown;
}

/** base64url → bytes (Wix omits `=` padding). */
function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time byte comparison. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Verify a signed app instance (`?instance=` value) with the app secret and
 * return its payload, or `null` when it's malformed or the signature is wrong.
 */
export async function verifyInstance(instance: string, appSecret: string): Promise<WixInstance | null> {
  const dot = instance.indexOf(".");
  if (dot <= 0 || !appSecret) return null;
  const signature = instance.slice(0, dot);
  const payload = instance.slice(dot + 1);
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
    if (!equalBytes(expected, fromBase64Url(signature))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Partial<WixInstance>;
    return typeof data.instanceId === "string" && data.instanceId ? (data as WixInstance) : null;
  } catch {
    return null;
  }
}
