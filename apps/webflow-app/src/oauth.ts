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
   * match exactly. Webflow validates this.
   */
  redirectUri: string;
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
      redirect_uri: params.redirectUri,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Webflow token exchange failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as WebflowTokenResponse;
}
