/**
 * Single source of truth for WHERE (and with what public key) both the runtime
 * and the plugin talk to the Consentful licensing portal.
 *
 * - The **runtime** (published site) calls {@link ENTITLEMENT_PATH} at boot,
 *   keyed by hostname, to fetch a domain-scoped ES256 token it verifies offline
 *   against {@link JWKS_PATH}.
 * - The **plugin** (Framer editor) calls {@link ACTIVATE_PATH} to register the
 *   site's published domain against a license key the user pastes (an
 *   "activation" — it creates/renews a site seat).
 *
 * Both hosts MUST agree on the API origin + publishable key, so they live here
 * rather than being duplicated. All values are global to Consentful (not
 * per-site) and safe to ship in the public runtime bundle: {@link PORTAL_PUBLISHABLE_KEY}
 * is a PUBLISHABLE (non-secret) key that only authorizes the public read/activate
 * endpoints, which act on a domain the caller already controls.
 *
 * {@link PORTAL_PUBLISHABLE_KEY} must equal the portal API's
 * `PLUGIN_PUBLIC_API_KEY` env var (DEPLOY.md §1).
 */

/**
 * Production licensing-API origin (no trailing slash). Deployed on Render.
 * A site config MAY override this per-site (see `config.license.portalApiBaseUrl`)
 * to point at staging; this is the production default.
 */
export const PORTAL_API_BASE = 'https://consentful-api.onrender.com';

/**
 * Publishable (non-secret) API key sent as `x-api-key` to the public portal
 * endpoints. Same key for every Consentful site; must match the API's
 * `PLUGIN_PUBLIC_API_KEY`. Not a secret — it only scopes requests to Consentful.
 */
export const PORTAL_PUBLISHABLE_KEY = 'cnsnt_pk_-u8h4YMytVe1RLH5MEqWyTFI';

/** Customer-facing portal/dashboard origin (where users buy + manage licenses). */
export const PORTAL_DASHBOARD_URL = 'https://consentful.theplugins.co';

/** Read-only entitlement endpoint (POST, `x-api-key`, `{ domain }` → token). */
export const ENTITLEMENT_PATH = '/public/site-entitlement';

/** Public JWKS the entitlement token is verified against (GET). */
export const JWKS_PATH = '/.well-known/jwks.json';

/**
 * Site-activation endpoint (POST, `x-api-key`, `{ licenseKey, domain }`) — the
 * plugin registers a published domain as a seat on the license. Returns
 * `{ ok, plan, tier, whiteLabel, reason }` (see the plugin's portal client).
 */
export const ACTIVATE_PATH = '/public/site-activate';

/**
 * Free preview / staging / local hosts. They run the FULL banner without a
 * license token and never use a site slot — so customers can build before their
 * real domain is live. Mirrors the portal's `normalizeDomain` dev list
 * (`consentful-portal/packages/utils/src/domain.ts`); keep the two in sync.
 */
const PREVIEW_SUFFIXES = [
  '.framer.app',
  '.framer.website',
  '.framer.media',
  '.webflow.io',
  '.wixsite.com',
  '.editorx.io',
  '.wixstudio.io',
  '.squarespace.com',
  '.myshopify.com',
  '.wpengine.com',
  '.wpenginepowered.com',
  '.local',
  '.test',
  '.localhost',
];
const PREVIEW_EXACT = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];

/**
 * Whether `host` is a free preview/staging/local host (see {@link PREVIEW_SUFFIXES}).
 * Bare IPv4 addresses count too (self-hosted staging boxes).
 *
 * @param host - A hostname as reported by `location.hostname` (any case).
 */
export function isPreviewHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (PREVIEW_EXACT.indexOf(h) !== -1) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  for (const s of PREVIEW_SUFFIXES) {
    if (h === s.slice(1) || h.endsWith(s)) return true;
  }
  return false;
}
