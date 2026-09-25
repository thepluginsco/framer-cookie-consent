/**
 * The Wix Data Client Worker — the credential-holding half of the Phase 3.5 App
 * shell, deployed as a Cloudflare Worker (our existing "+worker" pattern).
 *
 * It owns the two things a browser dashboard page cannot: the OAuth
 * `client_secret` + the app-instance tokens, AND — because Wix is NOT ∅-infra —
 * the **per-site config store** the published site's bootstrap fetches from. Its
 * routes:
 *
 *   GET  /authorize?site=<id>          → redirect the user to Wix's install screen
 *   GET  /callback?code&instanceId&state → exchange the code, store the token
 *   POST /api/install                  → {siteId, config} → store config +
 *                                        installWixLoader(...) (embed + opt-in default)
 *   POST /api/config                   → {siteId, config} → store config only
 *                                        (a config edit never needs to touch Wix)
 *   POST /api/remove                   → {siteId} → removeWixLoader + drop config
 *   GET  /api/status?site=<id>         → whether we hold a token for the site
 *   GET  /api/wix/config/<id>          → PUBLIC: the site's config JSON (the
 *                                        bootstrap fetches this; CORS-open)
 *
 * The install/remove routes build a {@link WixApiClient} from the stored token and
 * hand it to the SAME `installWixLoader`/`removeWixLoader` the core exposes — so
 * the loader parameters written to a Wix site are byte-identical in behaviour to
 * every other platform's loader.
 *
 * Security note: `/api/*` trusts a `token` looked up by `siteId`. A production
 * deploy should additionally verify the dashboard's Wix instance identity (the
 * signed instance token from the Dashboard SDK) before honouring a write. That
 * verification is a drop-in guard on {@link handleApi}; it is intentionally left
 * as a marked TODO rather than faked.
 */

import type { CookieConsentConfig, DeepPartial } from "@framer-cookie-consent/shared";
import {
  installWixLoader,
  mergeConfig,
  normalizeWixSiteId,
  removeWixLoader,
  parse,
  serialize,
  toPublishedConfig,
  WIX_CONFIG_PATH,
} from "@framer-cookie-consent/shared";
import { buildInstallUrl, exchangeCodeForToken } from "./oauth.js";
import { WixApiClient } from "./wix-api-client.js";

/** Minimal KV namespace surface (avoids a hard dep on @cloudflare/workers-types). */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Environment bindings the Worker expects (set as Wrangler secrets/vars). */
export interface Env {
  /** Wix app id (public; the OAuth `client_id`). */
  WIX_APP_ID: string;
  /** Wix app secret (secret; the OAuth `client_secret`). */
  WIX_APP_SECRET: string;
  /** The `/callback` URL registered on the Wix app. */
  WIX_REDIRECT_URL: string;
  /** Where to bounce the user after a successful install (the dashboard origin). */
  APP_ORIGIN?: string;
  /** KV storing `token:<siteId>` → JSON {access_token, refresh_token}. */
  TOKENS: KVNamespace;
  /** KV storing `config:<siteId>` → serialized config JSON (served to the runtime). */
  CONFIGS: KVNamespace;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** CORS for the dashboard iframe calling `/api/*`. */
function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** CORS for the PUBLIC config endpoint — any origin (it's a published site). */
const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.APP_ORIGIN;

    // The public config endpoint (`/api/wix/config/<id>`) is matched by prefix.
    if (url.pathname.startsWith(`${WIX_CONFIG_PATH}/`)) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: PUBLIC_CORS });
      }
      return handleServeConfig(url, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      switch (url.pathname) {
        case "/authorize":
          return handleAuthorize(url, env);
        case "/callback":
          return handleCallback(url, env);
        case "/api/install":
          return handleApi(request, env, "install");
        case "/api/config":
          return handleApi(request, env, "config");
        case "/api/remove":
          return handleApi(request, env, "remove");
        case "/api/status":
          return handleStatus(url, env);
        default:
          return json({ error: "not_found" }, 404, corsHeaders(origin));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: "internal_error", message }, 500, corsHeaders(origin));
    }
  },
};

/** Redirect the user to Wix's app-install / consent screen. */
function handleAuthorize(url: URL, env: Env): Response {
  const site = url.searchParams.get("site") ?? "";
  // `state` carries the target site so `/callback` knows what to key the token by.
  // In production sign/verify this (e.g. HMAC) to make it a real CSRF guard.
  const installUrl = buildInstallUrl({
    appId: env.WIX_APP_ID,
    redirectUrl: env.WIX_REDIRECT_URL,
    state: site,
  });
  return new Response(null, { status: 302, headers: { Location: installUrl } });
}

/** Exchange the returned code for tokens and stash them keyed by site. */
async function handleCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  const site = url.searchParams.get("state") ?? "";
  if (!code) return json({ error: "missing_code" }, 400);

  const token = await exchangeCodeForToken({
    clientId: env.WIX_APP_ID,
    clientSecret: env.WIX_APP_SECRET,
    code,
  });

  if (site) {
    const key = `token:${normalizeWixSiteId(site)}`;
    await env.TOKENS.put(
      key,
      JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token }),
    );
  }

  const back = env.APP_ORIGIN;
  if (back) {
    return new Response(null, { status: 302, headers: { Location: `${back}?connected=1` } });
  }
  return new Response("Consentful connected to Wix. You can close this window.", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

/** Report whether we hold a token for a site (drives the dashboard's connect UI). */
async function handleStatus(url: URL, env: Env): Promise<Response> {
  const site = url.searchParams.get("site") ?? "";
  const token = site ? await env.TOKENS.get(`token:${safeNormalize(site)}`) : null;
  return json({ connected: Boolean(token) }, 200, corsHeaders(env.APP_ORIGIN));
}

/** Serve a site's stored config to the published-site bootstrap (public, CORS-*). */
async function handleServeConfig(url: URL, env: Env): Promise<Response> {
  const raw = url.pathname.slice(`${WIX_CONFIG_PATH}/`.length);
  const siteId = safeNormalize(decodeURIComponent(raw));
  if (!siteId) return json({ error: "missing_site" }, 400, PUBLIC_CORS);

  const stored = await env.CONFIGS.get(`config:${siteId}`);
  if (!stored) return json({ error: "not_found" }, 404, PUBLIC_CORS);
  // Served to every visitor: strip the editor-only license fields (the key must
  // never be public; the runtime verifies a domain token instead).
  return new Response(serialize(toPublishedConfig(parse(stored))), {
    status: 200,
    headers: { ...JSON_HEADERS, ...PUBLIC_CORS, "Cache-Control": "public, max-age=60" },
  });
}

/** Body shape for `/api/install`, `/api/config` and `/api/remove`. */
interface ApiBody {
  siteId?: string;
  config?: unknown;
}

/**
 * Run install / config-save / remove. Install and config both persist the config
 * to the store (the runtime reads it there); install additionally embeds the
 * loader + sets the opt-in default via the shared engine.
 */
async function handleApi(
  request: Request,
  env: Env,
  action: "install" | "config" | "remove",
): Promise<Response> {
  const cors = corsHeaders(env.APP_ORIGIN);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const body = (await request.json().catch(() => ({}))) as ApiBody;
  const rawSite = body.siteId;
  if (!rawSite) return json({ error: "missing_site" }, 400, cors);
  const siteId = safeNormalize(rawSite);
  if (!siteId) return json({ error: "invalid_site" }, 400, cors);

  // TODO(prod): verify the dashboard's signed Wix instance token here and assert
  // it resolves to `siteId` before writing.

  if (action === "config") {
    await storeConfig(env, siteId, body.config);
    return json({ stored: true }, 200, cors);
  }

  if (action === "remove") {
    const token = await readToken(env, siteId);
    if (!token) return json({ error: "not_connected" }, 401, cors);
    const client = new WixApiClient({ token });
    const result = await removeWixLoader(client);
    await env.CONFIGS.delete(`config:${siteId}`);
    return json(result, 200, cors);
  }

  // install: persist config first (so the runtime can fetch it), then embed.
  await storeConfig(env, siteId, body.config);
  const token = await readToken(env, siteId);
  if (!token) return json({ error: "not_connected" }, 401, cors);
  const client = new WixApiClient({ token });
  const result = await installWixLoader(client, siteId);
  return json(result, 200, cors);
}

/** Merge a config partial to a full config and persist it as serialized JSON. */
async function storeConfig(env: Env, siteId: string, config: unknown): Promise<void> {
  const full: CookieConsentConfig = mergeConfig((config ?? {}) as DeepPartial<CookieConsentConfig>);
  await env.CONFIGS.put(`config:${siteId}`, serialize(full));
}

/** Read + parse the stored access token for a site (or `null`). */
async function readToken(env: Env, siteId: string): Promise<string | null> {
  const stored = await env.TOKENS.get(`token:${siteId}`);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

/** Normalize a site id, returning "" instead of throwing on a bad value. */
function safeNormalize(raw: string): string {
  try {
    return normalizeWixSiteId(raw);
  } catch {
    return "";
  }
}
