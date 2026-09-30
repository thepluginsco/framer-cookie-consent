/**
 * The Webflow Data Client — the credential-holding half of the Phase 3.2 App
 * shell, deployed as a Cloudflare Worker (our existing "+worker" pattern).
 *
 * It owns the two things a browser Designer Extension cannot: the OAuth
 * `client_secret` and a site-scoped access token. Its job is small and it defers
 * every consent decision to the shared engine:
 *
 *   GET  /authorize?site=<id>   → redirect the user to Webflow's consent screen
 *   GET  /callback?code&state   → exchange the code, store the token, close popup
 *   POST /api/install           → {siteId, idToken, config} → installWebflowLoader(...)
 *   POST /api/remove            → {siteId, idToken}         → removeWebflowLoader(...)
 *   GET  /api/status?site=<id>  → whether we hold a token for the site
 *
 * The install/remove routes build a {@link WebflowApiClient} from the stored
 * token and hand it to the SAME `installWebflowLoader`/`removeWebflowLoader` the
 * core exposes — so the loader written to a Webflow site is byte-identical to
 * every other platform's.
 *
 * Security: install/remove require the Designer Extension's short-lived ID token
 * (`webflow.getIdToken()`), resolved with Webflow ({@link resolveIdTokenSite});
 * it must name the same site as `siteId`, so only an authorized designer of
 * that site can write to it — knowing a site id is not enough.
 */

import type { CookieConsentConfig, DeepPartial } from "@framer-cookie-consent/shared";
import {
  installWebflowLoader,
  mergeConfig,
  removeWebflowLoader,
  serialize,
} from "@framer-cookie-consent/shared";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./oauth.js";
import { WebflowApiClient } from "./webflow-api-client.js";

/** Minimal KV namespace surface (avoids a hard dep on @cloudflare/workers-types). */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Environment bindings the Worker expects (set as Wrangler secrets/vars). */
export interface Env {
  /** Webflow app client id (public). */
  WEBFLOW_CLIENT_ID: string;
  /** Webflow app client secret (secret). */
  WEBFLOW_CLIENT_SECRET: string;
  /** The `/callback` URL registered on the Webflow app. */
  WEBFLOW_REDIRECT_URI: string;
  /** Where to bounce the user after a successful auth (the Designer origin). */
  APP_ORIGIN?: string;
  /** KV namespace storing `token:<siteId>` → access token. */
  TOKENS: KVNamespace;
  /**
   * KV namespace storing `config:<siteId>` → serialized config, so the Designer
   * panel can reopen on the site's live banner instead of a fresh default.
   * Optional: without it, install/remove still work — the panel just can't
   * reload prior config (`/api/config` returns 404).
   */
  CONFIGS?: KVNamespace;
  /** Test seam: the fetch used for Webflow calls. */
  fetchImpl?: typeof fetch;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** CORS headers so the Designer Extension iframe can call `/api/*`. */
function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

/**
 * Which origin to echo in the CORS headers. The Designer Extension may be served
 * from `localhost:1337` (dev) or a `*.webflow-ext.com` host (production), so we
 * REFLECT the caller's own `Origin` header rather than pinning one. Falls back to
 * the configured {@link Env.APP_ORIGIN}, then to `*`. Safe because these routes
 * carry no cookies — they authorize via a server-side, site-keyed token.
 */
function resolveOrigin(request: Request, env: Env): string | undefined {
  return request.headers.get("Origin") ?? env.APP_ORIGIN;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolveOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      switch (url.pathname) {
        case "/authorize":
          return handleAuthorize(url, env);
        case "/callback":
          return await handleCallback(url, env);
        case "/api/install":
          return await handleApi(request, env, "install", origin);
        case "/api/remove":
          return await handleApi(request, env, "remove", origin);
        case "/api/status":
          return await handleStatus(url, env, origin);
        case "/api/config":
          return await handleConfig(url, env, origin);
        default:
          return json({ error: "not_found" }, 404, corsHeaders(origin));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: "internal_error", message }, 500, corsHeaders(origin));
    }
  },
};

/** Redirect the user to Webflow's OAuth consent screen. */
function handleAuthorize(url: URL, env: Env): Response {
  const site = url.searchParams.get("site") ?? "";
  // `state` carries the target site so `/callback` knows what to key the token by.
  // In production sign/verify this (e.g. HMAC) to make it a real CSRF guard.
  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.WEBFLOW_CLIENT_ID,
    redirectUri: env.WEBFLOW_REDIRECT_URI,
    state: site,
  });
  return new Response(null, { status: 302, headers: { Location: authorizeUrl } });
}

/** Exchange the returned code for a token and stash it keyed by site. */
async function handleCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  const site = url.searchParams.get("state") ?? "";
  if (!code) return json({ error: "missing_code" }, 400);

  const token = await exchangeCodeForToken({
    clientId: env.WEBFLOW_CLIENT_ID,
    clientSecret: env.WEBFLOW_CLIENT_SECRET,
    code,
    redirectUri: env.WEBFLOW_REDIRECT_URI,
  });

  if (site) await env.TOKENS.put(`token:${site}`, token.access_token);

  // Bounce back to the Designer extension (or show a minimal success page).
  const back = env.APP_ORIGIN;
  if (back) {
    return new Response(null, { status: 302, headers: { Location: `${back}?connected=1` } });
  }
  return new Response("Consentful connected to Webflow. You can close this window.", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

/** Report whether we hold a token for a site (drives the Designer's connect UI). */
async function handleStatus(url: URL, env: Env, origin: string | undefined): Promise<Response> {
  const site = url.searchParams.get("site") ?? "";
  const token = site ? await env.TOKENS.get(`token:${site}`) : null;
  return json({ connected: Boolean(token) }, 200, corsHeaders(origin));
}

/** Webflow's ID-token resolver (the Designer docs' "Resolve ID Token"). */
export const WEBFLOW_RESOLVE_ID_TOKEN_URL = "https://api.webflow.com/beta/token/resolve";

/**
 * Resolve a Designer Extension ID token to the site it was issued for, using
 * the site's stored access token (needs the `authorized_user:read` scope).
 * Returns null when Webflow rejects it (expired, forged, other app).
 */
export async function resolveIdTokenSite(
  idToken: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(WEBFLOW_RESOLVE_ID_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { siteId?: unknown };
    return typeof data.siteId === "string" && data.siteId ? data.siteId : null;
  } catch {
    return null;
  }
}

/** Body shape for `/api/install` and `/api/remove`. */
interface ApiBody {
  siteId?: string;
  /** The Designer user's ID token (`webflow.getIdToken()`). */
  idToken?: string;
  config?: unknown;
  /** Optional runtime URL override (self-hosting / staging). */
  runtimeUrl?: string;
}

/** Run install/remove against the shared engine using the stored site token. */
async function handleApi(
  request: Request,
  env: Env,
  action: "install" | "remove",
  origin: string | undefined,
): Promise<Response> {
  const cors = corsHeaders(origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const body = (await request.json().catch(() => ({}))) as ApiBody;
  const siteId = body.siteId;
  if (!siteId) return json({ error: "missing_site" }, 400, cors);

  const token = await env.TOKENS.get(`token:${siteId}`);
  if (!token) return json({ error: "not_connected" }, 401, cors);

  // Only an authorized Designer user of THIS site may write: resolve the
  // extension's short-lived ID token with Webflow and require it to name the
  // same site. Knowing a site id alone is no longer enough.
  const fetchImpl = env.fetchImpl ?? fetch.bind(globalThis);
  if (!body.idToken) return json({ error: "missing_id_token" }, 401, cors);
  const resolvedSite = await resolveIdTokenSite(body.idToken, token, fetchImpl);
  if (resolvedSite !== siteId) return json({ error: "invalid_id_token" }, 403, cors);

  const client = new WebflowApiClient({ token, siteId, fetchImpl });

  if (action === "remove") {
    const result = await removeWebflowLoader(client);
    if (env.CONFIGS) await env.CONFIGS.delete(`config:${siteId}`);
    return json(result, 200, cors);
  }

  const config: CookieConsentConfig = mergeConfig(
    (body.config ?? {}) as DeepPartial<CookieConsentConfig>,
  );
  const result = await installWebflowLoader(
    client,
    config,
    body.runtimeUrl ? { runtimeUrl: body.runtimeUrl } : {},
  );
  // Remember the config so the Designer panel can reopen on it (best-effort).
  if (env.CONFIGS) await env.CONFIGS.put(`config:${siteId}`, serialize(config));
  return json(result, 200, cors);
}

/** Serve a site's stored config back to the Designer panel (or 404). */
async function handleConfig(url: URL, env: Env, origin: string | undefined): Promise<Response> {
  const cors = corsHeaders(origin);
  const site = url.searchParams.get("site") ?? "";
  if (!site) return json({ error: "missing_site" }, 400, cors);
  const stored = env.CONFIGS ? await env.CONFIGS.get(`config:${site}`) : null;
  if (!stored) return json({ error: "not_found" }, 404, cors);
  // Stored value is already serialized config JSON — serve it verbatim.
  return new Response(stored, { status: 200, headers: { ...JSON_HEADERS, ...cors } });
}
