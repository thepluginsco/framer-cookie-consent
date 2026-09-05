/**
 * License gate — the real, client-side licensing check (replacing the Prompt 7
 * stub).
 *
 * Licensing is uniform across every origin: a site is licensed when — and only
 * when — the injected `config.license` carries a paid tier and a present key.
 * There is no "free on staging" special case; the same rules apply to Framer
 * preview domains, `localhost`, and custom domains alike.
 *
 * This module is **dependency-free** (its only imports are types) and does
 * **zero network I/O**. That is a deliberate architectural decision, not a
 * shortcut:
 *
 * - The *heavy* license validation (calling Lemon Squeezy, resolving the tier
 *   from the store/product/variant, checking activation status) happens ONCE, in
 *   the Framer editor, at purchase / activation time. The verdict is baked into
 *   the config that the plugin injects into the published page.
 * - The runtime therefore only performs a *lightweight presence / format* check
 *   on the injected `config.license` block. This keeps the runtime at $0 infra
 *   and zero added latency on every visitor's page load — we never phone home.
 *
 * Because the check is client-side it is a deterrent + licensing mechanism, not
 * a DRM fortress. That trade-off is intentional and documented in ARCHITECTURE.md.
 *
 * @see ../../ARCHITECTURE.md § "Licensing model"
 */

import type { CookieConsentConfig, LicenseTier } from '@framer-cookie-consent/shared';

/* -------------------------------------------------------------------------- */
/* Lightweight license verdict                                                */
/* -------------------------------------------------------------------------- */

/** Paid tiers that entitle a site to run the full banner. */
const PAID_TIERS: readonly LicenseTier[] = ['lifetime', 'pro', 'agency'];

/** Tiers entitled to hide the "powered by" credit (white-label). */
const WHITE_LABEL_TIERS: readonly LicenseTier[] = ['pro', 'agency'];

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

/**
 * Lightweight presence/format check on a license key. We do NOT contact Lemon
 * Squeezy here (that happened in the editor); we only require a plausibly-real,
 * non-trivial token so an empty/placeholder value cannot pass as a license.
 *
 * @param key - The key from `config.license.key` (may be `null`).
 * @returns `true` when the key looks like a real, present license key.
 */
function hasPresentKey(key: string | null): boolean {
  if (typeof key !== 'string') return false;
  // Lemon Squeezy keys are UUID-ish (36 chars); require a modest minimum so a
  // stray "x" or whitespace never counts. This is a format guard, not a checksum.
  return key.trim().length >= 8;
}

/**
 * Whether the current site is entitled to run the paid banner. Licensed only
 * when the injected `config.license` has a paid `tier` (lifetime / pro / agency)
 * AND a present, well-formed key. This is the deliberate lightweight check
 * documented at the top of this file, and it applies to every origin equally.
 *
 * Synchronous by design: no network, no promises, no per-visitor latency.
 *
 * @param config - The active configuration (its `license` block is inspected).
 * @returns `true` when the site may render the full paid banner.
 */
export function isLicensed(config: CookieConsentConfig): boolean {
  const { tier, key } = config.license;
  return PAID_TIERS.includes(tier) && hasPresentKey(key);
}

/**
 * Whether the "powered by" credit may be hidden (white-label). Entitled ONLY
 * when the tier is pro/agency AND the site is actually licensed.
 *
 * The runtime is authoritative here: it does not trust `config.license.whiteLabel`
 * blindly — {@link resolveBannerConfig} re-derives it from this function.
 *
 * @param config - The active configuration.
 * @returns `true` when white-label is entitled.
 */
export function hasWhiteLabel(config: CookieConsentConfig): boolean {
  if (!isLicensed(config)) return false;
  return WHITE_LABEL_TIERS.includes(config.license.tier);
}

/* -------------------------------------------------------------------------- */
/* Optional periodic revalidation seam (DISABLED)                             */
/* -------------------------------------------------------------------------- */

/**
 * OFF by default. Flip to `true` only alongside a real {@link revalidateLicense}
 * implementation. Kept a `const false` so the dead branch tree-shakes away and
 * the shipped runtime makes zero network calls (preserving $0 infra / zero
 * latency).
 */
export const REVALIDATION_ENABLED = false as const;

/**
 * Periodic revalidation seam — STUBBED and DISABLED.
 *
 * A future Pro-tier feature could, on a long interval, phone home to a
 * Cloudflare Worker to catch refunded/deactivated keys. We intentionally do NOT
 * ship that: it would add infrastructure and per-visitor latency for negligible
 * benefit over the editor-time validation. This hook exists only to mark the
 * seam; it performs NO network I/O and simply echoes the local verdict.
 *
 * @param config - The active configuration.
 * @returns A promise resolving to the current lightweight {@link isLicensed} verdict.
 */
export async function revalidateLicense(config: CookieConsentConfig): Promise<boolean> {
  // DISABLED: no fetch, no Worker call. See REVALIDATION_ENABLED and the docs above.
  return isLicensed(config);
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
 * gate and white-label entitlement:
 *
 * - **Licensed** → the full banner, with `license.whiteLabel` re-derived from
 *   {@link hasWhiteLabel} (the runtime, not the injected flag, is authoritative).
 * - **Unlicensed** → the {@link basicBannerConfig} fallback.
 *
 * NOTE: this only shapes the *banner UI*. The compliance machinery (Consent Mode
 * denials + script blocking) always runs on the ORIGINAL config regardless of
 * licensing — see {@link module:index~boot}. An unlicensed site is never *less*
 * safe than a licensed one.
 *
 * @param config - The active configuration.
 * @returns The config to hand to {@link module:banner~mountBanner}.
 */
export function resolveBannerConfig(config: CookieConsentConfig): CookieConsentConfig {
  if (!isLicensed(config)) return basicBannerConfig(config);
  return {
    ...config,
    license: { ...config.license, whiteLabel: hasWhiteLabel(config) },
  };
}
