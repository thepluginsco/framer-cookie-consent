/**
 * Framer Marketplace rule: the plugin may only talk to fixed, documented
 * endpoints. The shared config schema has three user-configurable URLs (an
 * accurate-geo endpoint, a consent-analytics endpoint and a licensing-API
 * override) that other platforms expose; the Framer build hides their inputs
 * and this clears any value an older version may have saved, both when the
 * config is loaded and before it is written into the site's custom code.
 */

import type { CookieConsentConfig } from "../types"

/** `config` with every user-configurable endpoint cleared. */
export function withoutCustomEndpoints(config: CookieConsentConfig): CookieConsentConfig {
  if (!config.geo.endpoint && !config.analytics.endpoint && !config.license.portalApiBaseUrl) return config
  return {
    ...config,
    geo: { ...config.geo, endpoint: "" },
    analytics: { ...config.analytics, endpoint: "" },
    license: { ...config.license, portalApiBaseUrl: "" },
  }
}
