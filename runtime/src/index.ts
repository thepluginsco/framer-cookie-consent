/**
 * Runtime entry point — the single file the published site loads.
 *
 * It wires together every runtime module in a strict, compliance-driven order
 * (see {@link boot}) and boots automatically on load. The whole thing is wrapped
 * so it can NEVER throw on the host page: a bug in the banner must not break the
 * customer's site.
 *
 * The bundled artifact is a self-contained IIFE (`dist/consent.min.js`) with no
 * runtime dependencies, served from a free CDN (jsDelivr) and loaded by the tiny
 * loader the Framer plugin injects.
 */

import { parse, mergeConfig, type CookieConsentConfig, type DeepPartial } from '@framer-cookie-consent/shared';
import { installConsentApi, readConsent, onConsentChange, type CookieConsentApi } from './consent-state.ts';
import { bootstrapConsentDefaults, updateConsent } from './consent-mode.ts';
import { installScriptBlocker } from './script-blocker.ts';
import {
  shouldShowBanner,
  isDoNotTrackEnabled,
  isGpcEnabled,
  gpcGrantedCategories,
  shouldApplyImpliedConsent,
  impliedConsentGrants,
  detectRegion,
  resolveRegion,
  createEndpointResolver,
  regionBucket,
} from './geo.ts';
import { mountBanner } from './banner.ts';
import { resolveBannerConfig } from './license-gate.ts';
import { resolveEntitlement } from './entitlement.ts';
import { installConsentAnalytics, type AnalyticsContext } from './analytics.ts';
import { resolveActiveVariant } from './variant.ts';
import { reportError } from './error-logger.ts';

/** Manual-control surface added to `window.CookieConsent`. */
type BootableApi = CookieConsentApi & { boot: typeof boot };

declare global {
  interface Window {
    /**
     * Serialized (or plain-object) config injected by the plugin's loader. A
     * string is parsed with {@link parse}; an object is merged with
     * {@link mergeConfig}. Absent → falls back to a `data-config` attribute,
     * then to defaults.
     */
    __CC_CONFIG__?: string | DeepPartial<CookieConsentConfig>;
  }
}

/* -------------------------------------------------------------------------- */
/* Config discovery                                                           */
/* -------------------------------------------------------------------------- */

/** Read a `data-cc-config` / `data-config` attribute from anywhere in the DOM. */
function readDataConfigAttr(): string | null {
  try {
    const nodes = document.querySelectorAll('[data-cc-config],script[data-config]');
    for (const node of Array.from(nodes)) {
      const value = node.getAttribute('data-cc-config') ?? node.getAttribute('data-config');
      if (value) return value;
    }
  } catch {
    /* DOM unavailable */
  }
  return null;
}

/**
 * Resolve the active config from the environment. Precedence:
 * `window.__CC_CONFIG__` (string → {@link parse}, object → {@link mergeConfig}),
 * then a `data-config` attribute, then defaults. Every path runs through the
 * shared merge so partial or older-schema configs still boot safely.
 *
 * @returns A complete, valid {@link CookieConsentConfig}.
 */
export function readEmbeddedConfig(): CookieConsentConfig {
  const raw = typeof window !== 'undefined' ? window.__CC_CONFIG__ : undefined;
  if (typeof raw === 'string') return parse(raw);
  if (raw && typeof raw === 'object') return mergeConfig(raw);

  const attr = readDataConfigAttr();
  if (attr) return parse(attr);

  return mergeConfig();
}

/* -------------------------------------------------------------------------- */
/* Readiness helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Run `fn` once the DOM is parsed enough to have a `<body>` to mount into. */
function whenDomReady(fn: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/**
 * Non-fatal error log — the host page must never see us throw. Routed through
 * the optional {@link reportError} logger: a concise `console.error` by default,
 * plus a site-supplied sink if (and only if) the owner opted in. Never external.
 */
function logError(err: unknown, context = 'boot'): void {
  reportError(err, context);
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Warn (once) that an unlicensed site is running the free fallback. Non-fatal
 * and best-effort — purely a nudge in the console for the site owner.
 */
function warnUnlicensed(): void {
  try {
    // eslint-disable-next-line no-console
    console.warn(
      '[cookie-consent] No valid license — showing the basic free banner ' +
        '(visitors stay protected). Add your license key in the Framer plugin ' +
        'to unlock the full styled + white-label banner.',
    );
  } catch {
    /* console unavailable */
  }
}

/**
 * Boot the entire consent runtime. Ordering is deliberate and MUST NOT be
 * reshuffled — Consent Mode defaults have to be set before any tracker can run:
 *
 * 1. Read the embedded config (partial/old configs are merged forward).
 * 2. License gate — kick off {@link resolveEntitlement} (fetch + offline-verify a
 *    domain-scoped token). CRUCIALLY this NEVER skips the compliance machinery:
 *    an unlicensed site still gets Consent Mode denials + script blocking (steps
 *    3–4), so an unpaid site is never *less* safe than a paid one. Only the
 *    banner UI degrades (step 5). The fetch runs in parallel with geo and is
 *    awaited just before the mount.
 * 3. `bootstrapConsentDefaults` — push Consent Mode v2 defaults ASAP.
 * 4. Install the script blocker: read existing consent and activate the scripts
 *    of already-consented categories (also starts the MutationObserver).
 * 5. Mount the banner UI once the DOM is ready — through
 *    {@link resolveBannerConfig} with the awaited entitlement: a verified-token
 *    site gets the full (optionally white-labelled) banner; an unlicensed site
 *    degrades to a basic branded fallback bar rather than nothing.
 *
 * Never throws: everything is wrapped so a failure degrades to "no banner"
 * rather than a broken host page.
 */
export async function boot(): Promise<void> {
  try {
    // (a) Config. Then resolve the A/B variant (Phase 4.1): pick a sticky,
    //     weighted variant and apply ONLY its presentation overrides, so the
    //     banner a visitor sees is their variant. Compliance sections are
    //     unchanged by construction (see applyVariant), so every variant is
    //     equally protective. `variantId` is null when no test is running.
    const base = readEmbeddedConfig();
    const active = resolveActiveVariant(base);
    const config = active.config;

    // A live analytics context (Phase 4.1): the assigned variant now, the coarse
    // region once geo resolves (step e). installConsentAnalytics reads it at each
    // report, so a visitor's real decision carries both dimensions.
    const analyticsCtx: AnalyticsContext = {};
    if (active.variantId) analyticsCtx.variant = active.variantId;

    // (b) License gate — start the entitlement fetch NOW so it resolves in
    //     parallel with the geo lookup below, and awaits together with it before
    //     the single banner mount (step f). The runtime is authoritative: it asks
    //     the licensing API (by hostname) for a domain-scoped signed token and
    //     verifies it offline — the injected config.license is NOT trusted. This
    //     only affects the *banner presentation*; the compliance machinery below
    //     runs regardless of the verdict, so an unlicensed site is never *less*
    //     safe. Fails closed (→ free banner) on any error/timeout.
    const host = typeof location !== 'undefined' ? location.hostname : '';
    const apiBaseOverride = config.license.portalApiBaseUrl;
    const entitlementPromise = resolveEntitlement(
      host,
      apiBaseOverride ? { apiBase: apiBaseOverride } : {},
    );

    // (c) Consent Mode defaults — MUST precede any tracker. Then keep the
    //     signals in sync on every future consent change. Always runs, licensed
    //     or not: we never leave an unpaid site's trackers ungated.
    bootstrapConsentDefaults(config);
    onConsentChange((state) => updateConsent(config, state));

    // Anonymous consent analytics (Pro). No-op unless an endpoint is configured;
    // reports only the decision type + granted categories (+ optional A/B variant
    // and coarse region), never any identifier.
    installConsentAnalytics(config, analyticsCtx);

    // Imperative API on window.CookieConsent (banner + host site drive this).
    const api = installConsentApi(config);
    exposeBoot(api);

    // (d) Read existing consent and activate already-consented scripts. This
    //     also wires up the MutationObserver + consent-change subscription.
    //     Always runs — unlicensed sites still block trackers until consent.
    installScriptBlocker(config);

    // (d.5) Honour Do Not Track as an expressed preference. When the author opts
    //     to respect it and no decision is on record yet, persist a
    //     reject-by-default (necessary categories only) rather than prompting —
    //     so the visitor is neither tracked nor nagged. This flows through the
    //     API, so Consent Mode + the blocker reconcile automatically and the
    //     banner (below) sees a valid decision and stays hidden. Matches the
    //     documented geo policy (see shouldShowBanner step 2).
    try {
      if (config.behavior.respectDoNotTrack && isDoNotTrackEnabled() && !readConsent(config)) {
        api.rejectAll('dnt');
      }
    } catch (err) {
      logError(err, 'dnt');
    }

    // (d.6) Honour Global Privacy Control as an opt-out of sale/sharing. Unlike
    //     DNT (a blanket reject above), GPC targets only the ad/marketing
    //     categories — analytics and other non-ad categories keep the author's
    //     defaults (see gpcGrantedCategories). Only applied when no decision is
    //     already on record, so an explicit choice — or the DNT reject above —
    //     always wins. When applied, the banner (below) shows a small
    //     confirmation badge if the author left `gpcShowBadge` on.
    let gpcHonored = false;
    try {
      if (config.behavior.respectGpc && isGpcEnabled() && !readConsent(config)) {
        api.accept(gpcGrantedCategories(config), 'gpc');
        gpcHonored = true;
      }
    } catch (err) {
      logError(err, 'gpc');
    }

    // (e) Resolve the visitor's region. When an accurate geo endpoint is
    //     configured (Pro), ask it for the real country; otherwise use the free,
    //     offline time-zone heuristic (NO network call). Either way trackers are
    //     already blocked above, so awaiting an accurate answer is safe — and the
    //     resolver self-times-out so a slow endpoint never withholds the banner.
    const region = config.geo.endpoint
      ? await resolveRegion(createEndpointResolver(config.geo.endpoint))
      : detectRegion();

    // Fill the region dimension so any subsequent consent event (the visitor's
    // actual choice, made after the banner mounts below) is bucketed by region.
    analyticsCtx.region = regionBucket(region);

    // (e.5) Region-aware consent model. In an opt-out region (CCPA-style, or the
    //     author choosing `consentModel: 'opt-out'` outright) and with no valid
    //     decision on record, apply IMPLIED consent: grant the author's default
    //     categories so trackers run immediately, exactly as if the pre-checked
    //     defaults had been accepted. The visitor keeps an opt-out path via the
    //     floating "cookie settings" button / preferences. This runs AFTER region
    //     resolution (it needs the region) but AFTER DNT/GPC too, so an expressed
    //     signal always wins. In opt-in regions this is a no-op and the banner
    //     (below) prompts as usual. Persisting a decision here makes the banner's
    //     shouldShowBanner verdict fall through to "already decided" → no prompt.
    try {
      if (shouldApplyImpliedConsent(config, readConsent(config), region)) {
        api.accept(impliedConsentGrants(config), 'implied');
      }
    } catch (err) {
      logError(err, 'implied-consent');
    }

    // (f) Await the entitlement (started in step b, resolved alongside geo) and
    //     render the banner ONCE with the resolved presentation: full banner when
    //     a valid domain token verified, basic branded fallback (+ console nudge)
    //     otherwise. Awaiting here — rather than mounting free then re-mounting on
    //     the token — avoids a visible flash; the blocker above already keeps
    //     trackers gated while we wait, and resolveEntitlement is time-bounded.
    const entitlement = await entitlementPromise;
    if (!entitlement) warnUnlicensed();
    const bannerConfig = resolveBannerConfig(config, entitlement);
    whenDomReady(() => {
      try {
        const state = readConsent(config);
        mountBanner(bannerConfig, {
          api,
          autoShow: shouldShowBanner(config, state, region),
          gpcHonored,
        });
      } catch (err) {
        logError(err, 'mount');
      }
    });
  } catch (err) {
    logError(err);
  }
}

/** Expose `boot` on `window.CookieConsent` for manual re-initialisation. */
function exposeBoot(api: CookieConsentApi): void {
  try {
    if (typeof window !== 'undefined' && window.CookieConsent) {
      (window.CookieConsent as BootableApi).boot = boot;
    } else if (typeof window !== 'undefined') {
      (api as BootableApi).boot = boot;
      window.CookieConsent = api;
    }
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Auto-init                                                                  */
/* -------------------------------------------------------------------------- */

// Boot automatically on load. `boot` is also exposed on window.CookieConsent
// (see exposeBoot) for manual control. Errors are swallowed inside boot().
void boot();
