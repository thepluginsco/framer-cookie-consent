/**
 * Google Consent Mode v2 engine.
 *
 * Emits consent SIGNALS only — it never loads, unblocks, or executes any
 * Google/marketing script (that is the script blocker's job). Everything here
 * is safe when GA/gtag is never used: the shim just parks commands in
 * `dataLayer`, where they harmlessly wait for a tag that may never load.
 *
 * @see https://developers.google.com/tag-platform/security/guides/consent
 */

import type { CookieConsentConfig } from '@framer-cookie-consent/shared';
import { readConsent, onConsentChange, type ConsentState } from './consent-state.ts';

/** A single Consent Mode signal value. */
export type ConsentSignalState = 'granted' | 'denied';

/** The four category-controlled Consent Mode v2 signals. */
export type SignalMap = {
  ad_storage: ConsentSignalState;
  analytics_storage: ConsentSignalState;
  ad_user_data: ConsentSignalState;
  ad_personalization: ConsentSignalState;
};

/** The `gtag()` command function signature. */
type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

/** Guards so defaults are pushed once and identical updates are not duplicated. */
let defaultsSet = false;
let lastUpdateKey: string | null = null;

/* --------------------------------- mapping -------------------------------- */

/**
 * Map a category grant map to the four Consent Mode signals. Pure and
 * unit-testable: every signal starts `denied`, then each granted category
 * flips its mapped signals (from the config's category→signal mapping) to
 * `granted`.
 *
 * @param config - The active configuration (source of the category→signal map).
 * @param categories - Grant map keyed by category id.
 * @returns A fully-populated {@link SignalMap}.
 */
export function mapCategoriesToSignals(
  config: CookieConsentConfig,
  categories: Record<string, boolean>,
): SignalMap {
  const signals: SignalMap = {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
  for (const category of config.categories) {
    if (categories[category.id]) {
      for (const signal of category.signals) {
        // Only the four ad/analytics signals are broadcast granted/denied;
        // security_storage is always granted and the rest are UI-only.
        if (
          signal === 'ad_storage' ||
          signal === 'analytics_storage' ||
          signal === 'ad_user_data' ||
          signal === 'ad_personalization'
        ) {
          signals[signal] = 'granted';
        }
      }
    }
  }
  return signals;
}

/* --------------------------------- gtag ----------------------------------- */

/** Ensure `window.dataLayer` and a `gtag()` shim exist, returning the shim. */
function ensureGtag(): GtagFn {
  const w = window;
  if (!w.dataLayer) w.dataLayer = [];
  const existing = w.gtag;
  if (typeof existing === 'function') return existing;
  // Canonical gtag shim: push the raw `arguments` object onto the dataLayer.
  const shim: GtagFn = function gtag(): void {
    (w.dataLayer as unknown[]).push(arguments);
  };
  w.gtag = shim;
  return shim;
}

/* ------------------------------- bootstrap -------------------------------- */

/**
 * Bootstrap Consent Mode defaults. MUST run as early as possible — before any
 * Google tag — so signals are `denied` by default before tags can fire.
 *
 * Reads any existing valid consent first, so returning visitors who already
 * granted a category do not flash `denied`. Sets `security_storage` to
 * `granted`, honours `waitForUpdateMs`, and applies url-passthrough /
 * ads-data-redaction. Idempotent (defaults are pushed at most once per page).
 * No-op when Consent Mode is disabled or there is no `window`.
 *
 * @param config - The active configuration.
 */
export function bootstrapConsentDefaults(config: CookieConsentConfig): void {
  if (defaultsSet || !config.consentMode.enableConsentMode || typeof window === 'undefined') return;
  const gtag = ensureGtag();
  const prior = readConsent(config);
  const signals = mapCategoriesToSignals(config, prior ? prior.categories : {});
  gtag('consent', 'default', {
    ad_storage: signals.ad_storage,
    analytics_storage: signals.analytics_storage,
    ad_user_data: signals.ad_user_data,
    ad_personalization: signals.ad_personalization,
    // Security-related storage (e.g. anti-fraud) is always allowed under CMv2.
    security_storage: 'granted',
    wait_for_update: config.consentMode.waitForUpdateMs,
  });
  if (config.consentMode.enableUrlPassthrough) gtag('set', 'url_passthrough', true);
  if (config.consentMode.enableAdsDataRedaction) gtag('set', 'ads_data_redaction', true);
  if (config.advanced.googleTagId) injectBlockedGtagLoader(config, config.advanced.googleTagId);
  defaultsSet = true;
}

/**
 * Convenience: inject the gtag.js loader in the BLOCKED form the script blocker
 * understands (`type="text/plain"` + `data-cc-src` + `data-cc-category`), so it
 * does not load until the visitor consents. This never activates the script.
 */
function injectBlockedGtagLoader(config: CookieConsentConfig, tagId: string): void {
  try {
    if (
      document.querySelector('script[data-cc-gtag]') ||
      document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
    ) {
      return;
    }
    const category = pickGatingCategory(config);
    const parent = document.head || document.documentElement;

    const loader = document.createElement('script');
    loader.type = 'text/plain'; // inert until the blocker rewrites it
    loader.setAttribute('data-cc-category', category);
    loader.setAttribute('data-cc-src', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`);
    loader.setAttribute('data-cc-gtag', '');
    loader.async = true;
    parent.appendChild(loader);

    const init = document.createElement('script');
    init.type = 'text/plain';
    init.setAttribute('data-cc-category', category);
    init.setAttribute('data-cc-gtag', '');
    init.text =
      `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
      `gtag('js',new Date());gtag('config',${JSON.stringify(tagId)});`;
    parent.appendChild(init);
  } catch {
    /* DOM unavailable — convenience only, never fatal */
  }
}

/** Choose the category that should gate gtag.js (prefers analytics, then ads). */
function pickGatingCategory(config: CookieConsentConfig): string {
  const analytics = config.categories.find((c) => c.signals.includes('analytics_storage'));
  if (analytics) return analytics.id;
  const ads = config.categories.find((c) => c.signals.includes('ad_storage'));
  if (ads) return ads.id;
  const optional = config.categories.find((c) => !c.required);
  return optional ? optional.id : 'analytics';
}

/* --------------------------------- update --------------------------------- */

/**
 * Emit a Consent Mode `update` reflecting the visitor's current choices.
 * Idempotent: an identical consecutive signal set is not re-pushed. No-op when
 * Consent Mode is disabled or there is no `window`.
 *
 * @param config - The active configuration.
 * @param state - The current consent state.
 */
export function updateConsent(config: CookieConsentConfig, state: ConsentState): void {
  if (!config.consentMode.enableConsentMode || typeof window === 'undefined') return;
  const signals = mapCategoriesToSignals(config, state.categories);
  const key = `${signals.ad_storage}|${signals.analytics_storage}|${signals.ad_user_data}|${signals.ad_personalization}`;
  if (key === lastUpdateKey) return;
  lastUpdateKey = key;
  ensureGtag()('consent', 'update', {
    ad_storage: signals.ad_storage,
    analytics_storage: signals.analytics_storage,
    ad_user_data: signals.ad_user_data,
    ad_personalization: signals.ad_personalization,
  });
}

/* ---------------------------------- init ---------------------------------- */

/**
 * Wire Consent Mode into the consent lifecycle: push defaults now (if not
 * already), then re-emit an `update` on every future consent change.
 *
 * @param config - The active configuration.
 * @returns An unsubscribe function that stops future automatic updates.
 */
export function initConsentMode(config: CookieConsentConfig): () => void {
  bootstrapConsentDefaults(config);
  return onConsentChange((state) => updateConsent(config, state));
}
