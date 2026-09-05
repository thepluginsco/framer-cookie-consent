/**
 * Consentful — accurate geo Worker (Cloudflare).
 *
 * A tiny, free (Workers free tier) endpoint that tells the consent runtime the
 * visitor's real country, so "EU / EEA only" and "By region" show-modes are
 * accurate instead of relying on the browser time-zone heuristic.
 *
 * It reads Cloudflare's edge geo signals — `request.cf.country` (ISO-3166-1
 * alpha-2) and `request.cf.regionCode` — and returns them as JSON. It stores
 * NOTHING, sets no cookies, and sends no PII: just the coarse region the banner
 * needs. The IP never leaves Cloudflare's edge.
 *
 * ── Deploy ────────────────────────────────────────────────────────────────
 *   1. `npm i -g wrangler` (or use the Cloudflare dashboard editor).
 *   2. Put this file at `src/index.js` of a Worker project (see wrangler.toml
 *      next to it), then `wrangler deploy`.
 *   3. Copy the deployed URL (e.g. https://consent-geo.<you>.workers.dev) into
 *      the plugin's Style/Behavior → "Accurate geo endpoint" field (Pro).
 *
 * ── CORS ──────────────────────────────────────────────────────────────────
 * The runtime fetches this cross-origin from every published site, so we allow
 * any origin. The response is trivially cacheable per-country if you want to add
 * a `Cache-Control` header, but it's already sub-millisecond at the edge.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  /**
   * @param {Request} request
   * @returns {Response}
   */
  fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const cf = /** @type {{ country?: string; regionCode?: string }} */ (
      /** @type {any} */ (request).cf ?? {}
    );
    const country = typeof cf.country === "string" ? cf.country.toUpperCase() : "";
    const regionCode = typeof cf.regionCode === "string" ? cf.regionCode.toUpperCase() : "";

    // Flag California specifically (CCPA/CPRA) so the runtime can treat it as a
    // regulated region even though it isn't a country.
    const region = country === "US" && regionCode === "CA" ? "US-CA" : "";

    const body = JSON.stringify({ country, region });
    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        // Short edge cache; the visitor's country rarely changes mid-session.
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
