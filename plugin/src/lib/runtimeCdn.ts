/**
 * Where the published site loads the consent runtime from.
 *
 * This now lives in the platform-neutral core (`@framer-cookie-consent/shared`)
 * so every adapter — Framer, the universal embed, Webflow, WordPress, Shopify —
 * points at the identical version-pinned bundle. This module is a thin
 * re-export kept so existing plugin imports (`../lib/runtimeCdn`) stay valid;
 * bump the runtime tag in `shared/src/runtime-cdn.ts`.
 */
export {
  RUNTIME_GH_USER,
  RUNTIME_GH_REPO,
  RUNTIME_VERSION,
  RUNTIME_BUNDLE_PATH,
  runtimeScriptUrl,
} from "@framer-cookie-consent/shared"
