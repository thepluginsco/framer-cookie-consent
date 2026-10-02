/**
 * Webflow OAuth 2.0 — the authorization-code flow the Data Client half of the
 * Webflow App shell (Phase 3.2) runs to obtain a site access token.
 *
 * These are the PURE, testable pieces of OAuth: building the authorize URL a
 * merchant is redirected to, and exchanging the returned `code` for an access
 * token. The impure surroundings — where the `client_secret` lives, the redirect
 * handling, and where the token is stored — belong to {@link ./worker.ts}, the
 * credential-holding Cloudflare Worker. Keeping the URL/param building here makes
 * the exact request shape unit-testable without a live Webflow app.
 *
 * Endpoints (Webflow v2, verified against the live docs 2026-09-18):
 *   - authorize:  GET  https://webflow.com/oauth/authorize
 *   - token:      POST https://api.webflow.com/oauth/access_token
 */

/** Webflow's OAuth authorization endpoint (user-facing consent screen). */
export const WEBFLOW_AUTHORIZE_URL = "https://webflow.com/oauth/authorize";

/** Webflow's OAuth token-exchange endpoint. */
export const WEBFLOW_TOKEN_URL = "https://api.webflow.com/oauth/access_token";

/**
 * The scopes the app needs. Custom code register/apply needs
 * `custom_code:read`+`custom_code:write`; publishing the site needs
 * `sites:read`+`sites:write`; `authorized_user:read` lets the Designer extension
 * confirm who authorized. Space-separated per the OAuth spec.
 */
export const WEBFLOW_SCOPES = [
  "sites:read",
  "sites:write",
  "custom_code:read",
  "custom_code:write",
  "authorized_user:read",
] as const;

/** Inputs for {@link buildAuthorizeUrl}. */
export interface AuthorizeUrlParams {
  /** The app's public client id. */
  clientId: string;
  /** Must exactly match a redirect URI registered on the Webflow app. */
  redirectUri: string;
  /** Opaque anti-CSRF token echoed back to the callback. Strongly recommended. */
  state?: string;
  /** Override the default {@link WEBFLOW_SCOPES}. */
  scopes?: readonly string[];
}

/**
 * Build the URL to redirect a user to so they authorize the app on a site.
 *
 * @returns An absolute `https://webflow.com/oauth/authorize?…` URL.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(WEBFLOW_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", (params.scopes ?? WEBFLOW_SCOPES).join(" "));
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

/** The token payload Webflow returns from a successful exchange. */
export interface WebflowTokenResponse {
  access_token: string;
  token_type: string;
  /** Space-separated granted scopes (present on newer responses). */
  scope?: string;
}

/** Inputs for {@link exchangeCodeForToken}. */
export interface ExchangeCodeParams {
  clientId: string;
  clientSecret: string;
  /** The single-use authorization code from the callback (valid ~15 min). */
  code: string;
  /**
   * Required if a `redirect_uri` was sent to the authorize endpoint — it must
   * match exactly. Webflow validates this. Omit it when the flow did not start
   * at our `/authorize` (an install straight from Webflow sends none).
   */
  redirectUri?: string;
  /** Injected fetch (the Worker's global `fetch`); overridable in tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Exchange an authorization `code` for an access token.
 *
 * The only impurity is the injected {@link ExchangeCodeParams.fetchImpl}, so the
 * request shape (JSON body, `grant_type=authorization_code`) and error handling
 * are fully testable.
 *
 * @throws Error with the HTTP status + body when Webflow rejects the exchange.
 */
export async function exchangeCodeForToken(
  params: ExchangeCodeParams,
): Promise<WebflowTokenResponse> {
  const doFetch = params.fetchImpl ?? fetch;
  const res = await doFetch(WEBFLOW_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      grant_type: "authorization_code",
      ...(params.redirectUri ? { redirect_uri: params.redirectUri } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Webflow token exchange failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as WebflowTokenResponse;
}

/** How long a signed `state` stays valid — the user has this long to approve. */
export const STATE_TTL_SECONDS = 600;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/**
 * Build the OAuth `state` for an authorize redirect: the target site and an
 * expiry, HMAC-signed so `/callback` only accepts a state this Worker issued
 * recently. Format: `v1.<base64url site>.<expiry epoch seconds>.<signature>`.
 */
export async function signState(site: string, secret: string, nowMs: number = Date.now()): Promise<string> {
  const payload = `v1.${toBase64Url(encoder.encode(site))}.${Math.floor(nowMs / 1000) + STATE_TTL_SECONDS}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verify a `state` from {@link signState}. Returns the site it carries (possibly
 * empty), or `null` when it is malformed, forged or expired.
 */
export async function verifyState(state: string, secret: string, nowMs: number = Date.now()): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [version, site, expiry, signature] = parts as [string, string, string, string];
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(`${version}.${site}.${expiry}`),
    );
    if (!valid) return null;
    if (!/^\d+$/.test(expiry) || Number(expiry) * 1000 < nowMs) return null;
    return new TextDecoder().decode(fromBase64Url(site));
  } catch {
    return null;
  }
}

/** Webflow's "list sites" endpoint — returns the sites a token was authorized for. */
export const WEBFLOW_SITES_URL = "https://api.webflow.com/v2/sites";

/**
 * The ids of the sites an access token can act on (needs `sites:read`). This is
 * Webflow's own answer to "which sites did this user authorize", so it — not
 * anything the browser sent — decides which sites a token is stored for.
 *
 * @throws Error with the HTTP status when Webflow rejects the request.
 */
export async function listAuthorizedSiteIds(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(WEBFLOW_SITES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Webflow list sites failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { sites?: { id?: unknown }[] };
  return (data.sites ?? []).map((s) => s.id).filter((id): id is string => typeof id === "string" && id !== "");
}
