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
 * ⚠️ Before shipping a runtime that turns licensing ON, set
 * {@link PORTAL_PUBLISHABLE_KEY} to the real publishable key (tracked in DEPLOY.md §1).
 */

/**
 * Production licensing-API origin (no trailing slash). Deployed on Render.
 * A site config MAY override this per-site (see `config.license.portalApiBaseUrl`)
 * to point at staging; this is the production default.
 */
export const PORTAL_API_BASE = 'https://consentful-api.onrender.com';

/**
 * Publishable (non-secret) API key sent as `x-api-key` to the public portal
 * endpoints. Same key for every Consentful site.
 *
 * ⚠️ PLACEHOLDER — replace with the real publishable key at deploy time.
 */
export const PORTAL_PUBLISHABLE_KEY = 'PUBLISHABLE_KEY_PLACEHOLDER';

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
