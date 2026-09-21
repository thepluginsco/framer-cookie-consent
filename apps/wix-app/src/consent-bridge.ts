/**
 * The Wix **consent bridge** — the published-site runtime hook (Phase 3.5 App
 * shell, browser half).
 *
 * Wix's own analytics, marketing and third-party embeds read consent from the
 * site's **Consent Policy**, NOT from our banner. So on a Wix site a banner is
 * not enough on its own: every decision must be relayed into Wix's Consent Policy
 * Manager, or Wix keeps its tags gated independently of what the visitor chose.
 * This tiny asset is that relay.
 *
 * It is the SAME engine — the translation from our category grants to Wix's five
 * buckets is the shared, pure {@link mapToWixConsent}; this file only
 * (a) reads the config the bootstrap already put on `window.__CC_CONFIG__`,
 * (b) reads each decision from the runtime's `cookieconsent:change` event (and
 *     the current `window.CookieConsent.getState()` on boot), and
 * (c) calls `window.consentPolicyManager.setConsentPolicy(...)`.
 *
 * Bundled by esbuild into `dist/consentful-wix-bridge.js` and loaded (deferred)
 * by the bootstrap when its `bridgeUrl` is set. The pure pieces are exported so
 * the relay logic is unit-testable without a live Wix site.
 */

import type { CookieConsentConfig, DeepPartial, WixConsentPolicy } from "@framer-cookie-consent/shared";
import { mapToWixConsent, mergeConfig } from "@framer-cookie-consent/shared";

/* -------------------------------------------------------------------------- */
/* The minimal shapes we touch on `window`                                    */
/* -------------------------------------------------------------------------- */

/** A persisted decision as carried by `cookieconsent:change` / `getState()`. */
export interface ConsentStateLike {
  /** Per-category grant map keyed by category id (`true` = granted). */
  categories?: Record<string, boolean>;
}

/** Wix's Consent Policy Manager `setConsentPolicy` signature (callback optional). */
export type SetConsentPolicy = (
  policy: WixConsentPolicy,
  callback?: (result: unknown) => void,
) => void;

/** The slice of `window.consentPolicyManager` we call. */
export interface WixConsentManager {
  setConsentPolicy: SetConsentPolicy;
}

/** The subset of the consent runtime API we read. */
export interface CookieConsentApiLike {
  getState(): ConsentStateLike | null;
}

/** The window surface the bridge reads. Kept loose so tests can supply a fake. */
export interface BridgeWindow {
  __CC_CONFIG__?: DeepPartial<CookieConsentConfig>;
  consentPolicyManager?: WixConsentManager;
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
 * Resolve the active config the bootstrap put on the page. Always run through the
 * shared {@link mergeConfig} so categories carry their Consent Mode signals (the
 * mapper needs them) even if `__CC_CONFIG__` is a sparse override.
 */
export function resolveConfig(win: BridgeWindow): CookieConsentConfig {
  return mergeConfig(win.__CC_CONFIG__ ?? {});
}

/**
 * Relay one decision into Wix. Pure apart from the single `setConsentPolicy`
 * call it makes on the passed-in `manager`.
 */
export function relayConsent(
  manager: WixConsentManager,
  config: CookieConsentConfig,
  state: ConsentStateLike | null | undefined,
): WixConsentPolicy {
  const policy = mapToWixConsent(config, grantedCategoryIds(state));
  manager.setConsentPolicy(policy);
  return policy;
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

/** How many times, and how often, to poll for the Consent Policy Manager. */
const READY_MAX_ATTEMPTS = 40;
const READY_INTERVAL_MS = 250;

/**
 * Resolve `window.consentPolicyManager`, which may load after our deferred
 * script, then invoke `onReady` once. Bounded polling (Wix exposes no reliable
 * "ready" promise to embedded scripts); gives up silently after ~10 s so the
 * bridge never leaks timers.
 */
export function whenConsentManagerReady(
  win: BridgeWindow,
  onReady: (manager: WixConsentManager) => void,
  attempt = 0,
): void {
  const manager = win.consentPolicyManager;
  if (manager && typeof manager.setConsentPolicy === "function") {
    onReady(manager);
    return;
  }
  if (attempt >= READY_MAX_ATTEMPTS) return;
  win.setTimeout?.(() => whenConsentManagerReady(win, onReady, attempt + 1), READY_INTERVAL_MS);
}

/**
 * Start the bridge: once Wix's Consent Policy Manager is ready, relay the current
 * decision and every subsequent `cookieconsent:change`.
 *
 * @param win - The window (defaults to the real one; injectable for tests).
 */
export function startConsentBridge(win: BridgeWindow = window as unknown as BridgeWindow): void {
  const config = resolveConfig(win);

  whenConsentManagerReady(win, (manager) => {
    // Relay whatever decision already exists (deny-by-default when none yet).
    relayConsent(manager, config, win.CookieConsent?.getState() ?? null);

    // Relay every future decision the runtime emits.
    win.addEventListener?.("cookieconsent:change", (event: Event) => {
      const detail = (event as CustomEvent<ConsentStateLike>).detail ?? null;
      relayConsent(manager, config, detail);
    });
  });
}
