/**
 * Wix OAuth 2.0 — the app-install / authorization-code flow the Worker half of
 * the Phase 3.5 App shell runs to obtain an app-instance access token.
 *
 * These are the PURE, testable pieces: building the install URL a Wix user is
 * sent to, and exchanging the returned `code` for an access + refresh token. The
 * impure surroundings — where the `client_secret` lives, the redirect handling,
 * and where the tokens are stored — belong to {@link ./worker.ts}, the
 * credential-holding Cloudflare Worker.
 *
 * Wix's flow differs slightly from Webflow's:
 *   - install:  GET  https://www.wix.com/installer/install?appId&redirectUrl&state
 *               → after the user grants, Wix redirects to the app's redirect URL
 *                 with `?code&instanceId&state`.
 *   - token:    POST https://www.wixapis.com/oauth/access
 *               → { access_token, refresh_token } (access tokens are short-lived;
 *                 refresh with grant_type=refresh_token).
 *
 * Sources (Wix, verified 2026-09-20):
 *   dev.wix.com/docs/build-apps/develop-your-app/access/authorization/…
 */

/** Wix's app-install endpoint (starts the user-facing consent + install). */
export const WIX_INSTALL_URL = "https://www.wix.com/installer/install";

/** Wix's OAuth token endpoint (code→token and refresh). */
export const WIX_TOKEN_URL = "https://www.wixapis.com/oauth/access";

/** Inputs for {@link buildInstallUrl}. */
export interface InstallUrlParams {
  /** The app's id (Wix's `appId`, the OAuth `client_id`). */
  appId: string;
  /** Must match a redirect URL registered on the Wix app. */
  redirectUrl: string;
  /** Opaque anti-CSRF token echoed back to the redirect. Strongly recommended. */
  state?: string;
}

/**
 * Build the URL to send a user to so they install/authorize the app.
 *
 * @returns An absolute `https://www.wix.com/installer/install?…` URL.
 */
export function buildInstallUrl(params: InstallUrlParams): string {
  const url = new URL(WIX_INSTALL_URL);
  url.searchParams.set("appId", params.appId);
  url.searchParams.set("redirectUrl", params.redirectUrl);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

/** The token payload Wix returns from a successful exchange / refresh. */
export interface WixTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Seconds until the access token expires (Wix access tokens are short-lived). */
  expires_in?: number;
  token_type?: string;
}

/** Inputs for {@link exchangeCodeForToken}. */
export interface ExchangeCodeParams {
  /** The app id (Wix's `client_id`). */
  clientId: string;
  /** The app secret (Wix's `client_secret`). */
  clientSecret: string;
  /** The single-use authorization code from the install redirect. */
  code: string;
  /** Injected fetch (the Worker's global `fetch`); overridable in tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Exchange an authorization `code` for access + refresh tokens.
 *
 * The only impurity is the injected {@link ExchangeCodeParams.fetchImpl}, so the
 * request shape (JSON body, `grant_type=authorization_code`) and error handling
 * are fully testable.
 *
 * @throws Error with the HTTP status + body when Wix rejects the exchange.
 */
export async function exchangeCodeForToken(
  params: ExchangeCodeParams,
): Promise<WixTokenResponse> {
  const doFetch = params.fetchImpl ?? fetch;
  const res = await doFetch(WIX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Wix token exchange failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as WixTokenResponse;
}

/** Inputs for {@link refreshAccessToken}. */
export interface RefreshTokenParams {
  clientId: string;
  clientSecret: string;
  /** The long-lived refresh token stored from a prior exchange. */
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Exchange a refresh token for a fresh access token. Wix access tokens are
 * short-lived, so the Worker refreshes before an API call when needed.
 *
 * @throws Error with the HTTP status + body when Wix rejects the refresh.
 */
export async function refreshAccessToken(
  params: RefreshTokenParams,
): Promise<WixTokenResponse> {
  const doFetch = params.fetchImpl ?? fetch;
  const res = await doFetch(WIX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Wix token refresh failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as WixTokenResponse;
}
