/**
 * The Shopify **consent bridge** — the storefront runtime hook (Phase 3.4 App
 * shell, browser half).
 *
 * Shopify's own checkout, Web Pixels and first-party pixel read consent from
 * `window.Shopify.customerPrivacy`, NOT from our banner. So on a Shopify store a
 * banner is not enough on its own: every decision must be relayed into Shopify's
 * Customer Privacy / Consent Tracking API, or Shopify keeps its tags gated
 * independently of what the visitor chose. This tiny asset is that relay.
 *
 * It is the SAME engine — the translation from our category grants to Shopify's
 * four buckets is the shared, pure {@link mapToShopifyConsent}; this file only
 * (a) reads the config the loader already put on `window.__CC_CONFIG__`,
 * (b) reads each decision from the runtime's `cookieconsent:change` event (and
 *     the current `window.CookieConsent.getState()` on boot), and
 * (c) calls `Shopify.customerPrivacy.setTrackingConsent(...)`.
 *
 * Bundled by esbuild into `extension/assets/consentful-consent-bridge.js` and
 * loaded (deferred) by the app-embed block. The pure pieces are exported so the
 * relay logic is unit-testable without a storefront.
 */

import type { CookieConsentConfig, DeepPartial, ShopifyVisitorConsent } from "@framer-cookie-consent/shared";
import { mapToShopifyConsent, mergeConfig } from "@framer-cookie-consent/shared";

/* -------------------------------------------------------------------------- */
/* The minimal shapes we touch on `window`                                    */
/* -------------------------------------------------------------------------- */

/** A persisted decision as carried by `cookieconsent:change` / `getState()`. */
export interface ConsentStateLike {
  /** Per-category grant map keyed by category id (`true` = granted). */
  categories?: Record<string, boolean>;
}

/** Shopify's `setTrackingConsent` signature (callback optional). */
export type SetTrackingConsent = (
  consent: ShopifyVisitorConsent,
  callback?: (result: unknown) => void,
) => void;

/** The slice of `window.Shopify.customerPrivacy` we call. */
export interface ShopifyCustomerPrivacy {
  setTrackingConsent: SetTrackingConsent;
}

/** The slice of `window.Shopify` we read. */
export interface ShopifyGlobal {
  customerPrivacy?: ShopifyCustomerPrivacy;
}

/** The subset of the consent runtime API we read. */
export interface CookieConsentApiLike {
  getState(): ConsentStateLike | null;
}

/** The window surface the bridge reads. Kept loose so tests can supply a fake. */
export interface BridgeWindow {
  __CC_CONFIG__?: DeepPartial<CookieConsentConfig>;
  Shopify?: ShopifyGlobal;
  CookieConsent?: CookieConsentApiLike;
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
  setTimeout?: (handler: () => void, timeout: number) => unknown;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** The ids of every granted category in a decision (`[]` when none / no state). */
export function grantedCategoryIds(state: ConsentStateLike | null | undefined): string[] {
  const categories = state?.categories;
  if (!categories || typeof categories !== "object") return [];
  return Object.keys(categories).filter((id) => categories[id] === true);
}

/**
 * Resolve the active config the loader baked onto the page. Always run through
 * the shared {@link mergeConfig} so categories carry their Consent Mode signals
 * (the mapper needs them) even if `__CC_CONFIG__` is a sparse override.
 */
export function resolveConfig(win: BridgeWindow): CookieConsentConfig {
  return mergeConfig(win.__CC_CONFIG__ ?? {});
}

/**
 * Relay one decision into Shopify. Pure apart from the single
 * `setTrackingConsent` call it makes on the passed-in `customerPrivacy`.
 */
export function relayConsent(
  customerPrivacy: ShopifyCustomerPrivacy,
  config: CookieConsentConfig,
  state: ConsentStateLike | null | undefined,
): ShopifyVisitorConsent {
  const consent = mapToShopifyConsent(config, grantedCategoryIds(state));
  customerPrivacy.setTrackingConsent(consent);
  return consent;
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

/** How many times, and how often, to poll for Shopify's customerPrivacy. */
const READY_MAX_ATTEMPTS = 40;
const READY_INTERVAL_MS = 250;

/**
 * Resolve `window.Shopify.customerPrivacy`, which may load after our deferred
 * script, then invoke `onReady` once. Bounded polling (Shopify exposes no
 * reliable "ready" promise across all surfaces); gives up silently after
 * ~10 s so the bridge never leaks timers.
 */
export function whenCustomerPrivacyReady(
  win: BridgeWindow,
  onReady: (cp: ShopifyCustomerPrivacy) => void,
  attempt = 0,
): void {
  const cp = win.Shopify?.customerPrivacy;
  if (cp && typeof cp.setTrackingConsent === "function") {
    onReady(cp);
    return;
  }
  if (attempt >= READY_MAX_ATTEMPTS) return;
  win.setTimeout?.(() => whenCustomerPrivacyReady(win, onReady, attempt + 1), READY_INTERVAL_MS);
}

/**
 * Start the bridge: once Shopify's Customer Privacy API is ready, relay the
 * current decision and every subsequent `cookieconsent:change`.
 *
 * @param win - The window (defaults to the real one; injectable for tests).
 */
export function startConsentBridge(win: BridgeWindow = window as unknown as BridgeWindow): void {
  const config = resolveConfig(win);

  whenCustomerPrivacyReady(win, (cp) => {
    // Relay whatever decision already exists (deny-by-default when none yet).
    relayConsent(cp, config, win.CookieConsent?.getState() ?? null);

    // Relay every future decision the runtime emits.
    win.addEventListener?.("cookieconsent:change", (event: Event) => {
      const detail = (event as CustomEvent<ConsentStateLike>).detail ?? null;
      relayConsent(cp, config, detail);
    });
  });
}
