/**
 * The Wix Data Client Worker — the credential-holding half of the Phase 3.5 App
 * shell, deployed as a Cloudflare Worker (our existing "+worker" pattern).
 *
 * One origin serves everything Wix needs:
 *   - the **dashboard page** (the built `dist/`, via Workers static assets) that
 *     Wix iframes with a signed `?instance=…`;
 *   - the **consent bridge** asset (`/consentful-wix-bridge.js`) the published
 *     site's bootstrap loads;
 *   - the **per-site config store** — Wix is NOT ∅-infra (embedded-script
 *     parameters are alphanumeric-only), so the bootstrap fetches config here;
 *   - the app **API**, authenticated by the signed instance.
 *
 *   POST /api/status   {instance}          → {connected, siteKey}
 *   POST /api/install  {instance, config}  → store config + installWixLoader
 *                                            (embed + opt-in default policy)
 *   POST /api/config   {instance, config}  → store config only (no Wix call)
 *   POST /api/remove   {instance}          → removeWixLoader + drop config
 *   GET  /api/wix/config/<siteKey>         → PUBLIC: the site's config JSON
 *   GET  /runtime.js                       → 302 to the pinned runtime bundle
 *
 * Auth: every `/api/*` write verifies the dashboard's signed app instance with
 * the app secret ({@link verifyInstance}) and derives the site from it — the
 * caller never names a site, so it can't write to anyone else's. Wix calls use
 * a token minted per request with OAuth client credentials
 * ({@link createAccessToken}); nothing is stored per site except its config.
 */

import type { CookieConsentConfig, DeepPartial } from "@framer-cookie-consent/shared";
import {
  installWixLoader,
  mergeConfig,
  normalizeWixSiteId,
  removeWixLoader,
  parse,
  runtimeScriptUrl,
  serialize,
  toPublishedConfig,
  WIX_CONFIG_PATH,
} from "@framer-cookie-consent/shared";
import { createAccessToken, verifyInstance } from "./oauth.js";
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
  /** Wix app secret (secret; signs instances + mints tokens). */
  WIX_APP_SECRET: string;
  /** KV storing `config:<siteKey>` → serialized config JSON (served to the runtime). */
  CONFIGS: KVNamespace;
  /** Workers static assets (the dashboard + bridge). Absent in unit tests. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Test seam: the fetch used for Wix calls. */
  fetchImpl?: typeof fetch;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Stable runtime URL for the bootstrap: 302 → the pinned jsDelivr bundle. */
export const RUNTIME_PATH = "/runtime.js";

/** CORS: the dashboard is same-origin, but keep `/api/*` callable cross-origin for local dev. */
const API_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** CORS for the PUBLIC config endpoint — any origin (it's a published site). */
const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200, extra: Record<string, string> = API_CORS): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The public config endpoint (`/api/wix/config/<key>`) is matched by prefix.
    if (url.pathname.startsWith(`${WIX_CONFIG_PATH}/`)) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
      return handleServeConfig(url, env);
    }

    // The bootstrap loads the runtime via this redirect, so a runtime release is
    // a Worker redeploy — never an edit to the Wix app's embedded-script code.
    if (url.pathname === RUNTIME_PATH) {
      return new Response(null, {
        status: 302,
        headers: { Location: runtimeScriptUrl(), "Cache-Control": "public, max-age=300" },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: API_CORS });
      try {
        switch (url.pathname) {
          case "/api/status":
            return await handleStatus(request, env);
          case "/api/install":
            return await handleApi(request, env, "install");
          case "/api/config":
            return await handleApi(request, env, "config");
          case "/api/remove":
            return await handleApi(request, env, "remove");
          default:
            return json({ error: "not_found" }, 404);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: "internal_error", message }, 500);
      }
    }

    // Everything else: the dashboard page + bridge (static assets).
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "not_found" }, 404);
  },
};

/** Body shape for `/api/*`. */
interface ApiBody {
  instance?: string;
  config?: unknown;
}

/** Verify the signed instance in `body` → the site key, or null. */
async function siteKeyFrom(body: ApiBody, env: Env): Promise<{ instanceId: string; siteKey: string } | null> {
  if (!body.instance) return null;
  const inst = await verifyInstance(body.instance, env.WIX_APP_SECRET);
  if (!inst) return null;
  try {
    return { instanceId: inst.instanceId, siteKey: normalizeWixSiteId(inst.instanceId) };
  } catch {
    return null;
  }
}

async function readBody(request: Request): Promise<ApiBody> {
  return (await request.json().catch(() => ({}))) as ApiBody;
}

/**
 * Is this a genuine dashboard session for a site? Drives the dashboard's
 * connected state, and — best-effort — reports the published site's URL and
 * name so activation can register the right domain automatically.
 */
async function handleStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const site = await siteKeyFrom(await readBody(request), env);
  if (!site) return json({ connected: false });
  const info = await siteInfo(env, site.instanceId);
  return json({ connected: true, siteKey: site.siteKey, ...info });
}

/** The published site's URL + display name (Get App Instance), or {} if unavailable. */
async function siteInfo(env: Env, instanceId: string): Promise<{ siteUrl?: string; siteName?: string }> {
  try {
    const token = await createAccessToken({
      appId: env.WIX_APP_ID,
      appSecret: env.WIX_APP_SECRET,
      instanceId,
      ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
    });
    const client = new WixApiClient({ token, ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}) });
    const s = await client.getSiteInfo();
    return { ...(s.url ? { siteUrl: s.url } : {}), ...(s.name ? { siteName: s.name } : {}) };
  } catch {
    return {};
  }
}

/** Serve a site's stored config to the published-site bootstrap (public, CORS-*). */
async function handleServeConfig(url: URL, env: Env): Promise<Response> {
  const raw = url.pathname.slice(`${WIX_CONFIG_PATH}/`.length);
  const siteKey = safeNormalize(decodeURIComponent(raw));
  if (!siteKey) return json({ error: "missing_site" }, 400, PUBLIC_CORS);

  const stored = await env.CONFIGS.get(`config:${siteKey}`);
  if (!stored) return json({ error: "not_found" }, 404, PUBLIC_CORS);
  // Served to every visitor: strip the editor-only license fields (the key must
  // never be public; the runtime verifies a domain token instead).
  return new Response(serialize(toPublishedConfig(parse(stored))), {
    status: 200,
    headers: { ...JSON_HEADERS, ...PUBLIC_CORS, "Cache-Control": "public, max-age=60" },
  });
}

/**
 * Run install / config-save / remove for the site the signed instance names.
 * Install and config both persist the config (the runtime reads it here);
 * install additionally embeds the loader + sets the opt-in default.
 */
async function handleApi(
  request: Request,
  env: Env,
  action: "install" | "config" | "remove",
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await readBody(request);
  const site = await siteKeyFrom(body, env);
  if (!site) return json({ error: "invalid_instance" }, 401);

  if (action === "config") {
    await storeConfig(env, site.siteKey, body.config);
    return json({ stored: true });
  }

  const token = await createAccessToken({
    appId: env.WIX_APP_ID,
    appSecret: env.WIX_APP_SECRET,
    instanceId: site.instanceId,
    ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
  });
  const client = new WixApiClient({ token, ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}) });

  if (action === "remove") {
    const result = await removeWixLoader(client);
    await env.CONFIGS.delete(`config:${site.siteKey}`);
    return json(result);
  }

  // install: persist config first (so the runtime can fetch it), then embed.
  await storeConfig(env, site.siteKey, body.config);
  const result = await installWixLoader(client, site.siteKey);
  return json(result);
}

/** Merge a config partial to a full config and persist it (license stripped). */
async function storeConfig(env: Env, siteKey: string, config: unknown): Promise<void> {
  const full: CookieConsentConfig = mergeConfig((config ?? {}) as DeepPartial<CookieConsentConfig>);
  await env.CONFIGS.put(`config:${siteKey}`, serialize(toPublishedConfig(full)));
}

/** Normalize a site key, returning "" instead of throwing on a bad value. */
function safeNormalize(raw: string): string {
  try {
    return normalizeWixSiteId(raw);
  } catch {
    return "";
  }
}
