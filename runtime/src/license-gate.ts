/**
 * License gate — turns a runtime-verified {@link VerifiedEntitlement} into the
 * banner-shaping decisions (full vs. basic banner, white-label on/off).
 *
 * The AUTHORITATIVE source of licensing truth is the domain-scoped ES256 token
 * fetched + verified at boot ({@link module:entitlement}), NOT the injected
 * `config.license`. A visitor can read and forge the injected config; a
 * domain-locked signed token cannot be forged or moved between domains. So this
 * module takes the *verified entitlement* (or `null` when unlicensed / offline /
 * on a dev host) and never inspects `config.license.tier`/`key`.
 *
 * This module is **dependency-free** (only type imports) and does **zero network
 * I/O** — the fetch/verify happens once in {@link module:entitlement}; here we
 * only shape the banner config from its result.
 *
 * @see ./entitlement.ts   (fetch + verify)
 * @see ./license-token.ts (ES256/JWKS verifier)
 * @see ../../ARCHITECTURE.md § "Licensing model"
 */

import type { CookieConsentConfig } from '@framer-cookie-consent/shared';
import type { FeatureSet, VerifiedEntitlement } from './license-token.ts';

/* -------------------------------------------------------------------------- */
/* Feature helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Feature id in the entitlement's `features` map that grants white-label. */
const WHITE_LABEL_FEATURE = 'white_label';

/** Whether a boolean `flag` feature is present and enabled. */
function flagEnabled(features: FeatureSet, id: string): boolean {
  const f = features[id];
  return !!f && f.kind === 'flag' && f.value === true;
}

/**
 * Neutral theme the basic fallback banner uses (mirrors the shared schema's
 * default theme). Inlined rather than imported so this module stays a pure
 * TYPE-only consumer of the shared package — keeping the runtime bundle and the
 * test runner free of any value dependency on it.
 */
const NEUTRAL_THEME: CookieConsentConfig['theme'] = {
  accent: '#2F6FED',
  mode: 'light',
  borderRadius: 16,
  fontFamily: 'inherit',
};

/* -------------------------------------------------------------------------- */
/* Verdict                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whether the current site is entitled to run the paid banner. Licensed when —
 * and only when — a valid, domain-scoped entitlement token was verified for this
 * host at boot. `null` (no seat, offline, dev host, or a failed/expired/copied
 * token) is unlicensed.
 *
 * @param entitlement - The verified entitlement, or `null` (see {@link module:entitlement}).
 * @returns `true` when the site may render the full paid banner.
 */
export function isLicensed(entitlement: VerifiedEntitlement | null): boolean {
  return entitlement !== null;
}

/**
 * Whether the "powered by" credit may be hidden (white-label). Entitled only
 * when the verified token carries the {@link WHITE_LABEL_FEATURE} flag. The
 * runtime is authoritative here — it never trusts the injected
 * `config.license.whiteLabel`; {@link resolveBannerConfig} re-derives it from
 * this function.
 *
 * @param entitlement - The verified entitlement, or `null`.
 * @returns `true` when white-label is entitled.
 */
export function hasWhiteLabel(entitlement: VerifiedEntitlement | null): boolean {
  if (!entitlement) return false;
  return flagEnabled(entitlement.features, WHITE_LABEL_FEATURE);
}

/* -------------------------------------------------------------------------- */
/* Banner config resolution (graceful degradation)                            */
/* -------------------------------------------------------------------------- */

/**
 * Downgrade a config to a **basic, branded** fallback banner used when a site is
 * unlicensed. The philosophy (see ARCHITECTURE.md) is: degrade to a plain
 * compliant bar rather than showing nothing, so an unpaid site's visitors stay
 * protected — while the missing premium styling + forced credit nudge the owner
 * to license.
 *
 * Compliance-relevant content (categories, copy, Consent Mode wiring, behaviour,
 * and the gated `scripts`) is preserved untouched. Only *premium presentation*
 * is stripped:
 * - layout forced to an unobtrusive bottom `bar` with no blocking overlay;
 * - theme reset to the neutral default (no custom accent / radius / font);
 * - author custom CSS and the persistent floating button removed;
 * - white-label forced OFF and the "powered by" credit forced ON.
 *
 * @param config - The full (licensed-intent) configuration.
 * @returns A fresh config shaped for the basic branded fallback banner.
 */
export function basicBannerConfig(config: CookieConsentConfig): CookieConsentConfig {
  return {
    ...config,
    banner: { ...config.banner, layout: 'bar', overlay: false },
    theme: { ...NEUTRAL_THEME },
    advanced: { ...config.advanced, customCss: '', floatingButton: false },
    strings: { ...config.strings, poweredByHidden: false },
    license: { ...config.license, whiteLabel: false },
  };
}

/**
 * Resolve the config the banner should actually render, applying the license
 * gate + white-label entitlement from the runtime-verified token:
 *
 * - **Licensed** (`entitlement != null`) → the full banner, with
 *   `license.whiteLabel` re-derived from {@link hasWhiteLabel} (the verified
 *   token, not the injected flag, is authoritative).
 * - **Unlicensed** (`entitlement == null`) → the {@link basicBannerConfig} fallback.
 *
 * NOTE: this only shapes the *banner UI*. The compliance machinery (Consent Mode
 * denials + script blocking) always runs on the ORIGINAL config regardless of
 * licensing — see {@link module:index~boot}. An unlicensed site is never *less*
 * safe than a licensed one.
 *
 * @param config - The active configuration.
 * @param entitlement - The verified entitlement, or `null` (unlicensed).
 * @returns The config to hand to {@link module:banner~mountBanner}.
 */
export function resolveBannerConfig(
  config: CookieConsentConfig,
  entitlement: VerifiedEntitlement | null,
): CookieConsentConfig {
  if (!isLicensed(entitlement)) return basicBannerConfig(config);
  return {
    ...config,
    license: { ...config.license, whiteLabel: hasWhiteLabel(entitlement) },
  };
}
