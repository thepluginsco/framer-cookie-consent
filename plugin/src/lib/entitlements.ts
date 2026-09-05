/**
 * Entitlements — the pure mapping from a {@link LicenseTier} to the set of
 * features it unlocks.
 *
 * This module is deliberately dependency-free (only a type-only import, which is
 * erased at build/test time) so the tier → feature logic can be unit-tested in
 * isolation without touching the network, Framer, or React.
 */

import type { LicenseTier } from "../types"

/* -------------------------------------------------------------------------- */
/* Entitlements                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The concrete capabilities a license unlocks. Derived solely from the tier via
 * {@link entitlementsFor} — never stored, so it can't drift from the tier.
 */
export interface Entitlements {
  /** Hide the "Powered by" credit on the banner (white-label). */
  whiteLabel: boolean
  /** Use the same license across multiple sites / domains (agency). */
  multiSite: boolean
  /** Accurate IP-based geo-targeting (vs. the free timezone heuristic). */
  accurateGeo: boolean
  /** Multiple banner languages + A/B copy. */
  multiLanguage: boolean
  /** Consent analytics dashboard. */
  analytics: boolean
  /**
   * How many sites this tier may activate the key on. `Infinity` means
   * unlimited (agency). The free trial cannot activate a production site, so its
   * count is `0`.
   */
  maxSites: number
}

/** The entitlements granted to a site with **no** paid license (free trial). */
const TRIAL_ENTITLEMENTS: Entitlements = {
  whiteLabel: false,
  multiSite: false,
  accurateGeo: false,
  multiLanguage: false,
  analytics: false,
  maxSites: 0,
}

/**
 * Single-site paid entitlements, shared by `pro` (subscription) and `lifetime`
 * (one-time). Both unlock everything except multi-site/agency behaviours.
 */
const SINGLE_SITE_PAID: Omit<Entitlements, "multiSite" | "maxSites"> = {
  whiteLabel: true,
  accurateGeo: true,
  multiLanguage: true,
  analytics: true,
}

/** The full entitlement table, keyed by tier. */
const ENTITLEMENTS: Readonly<Record<LicenseTier, Entitlements>> = {
  trial: TRIAL_ENTITLEMENTS,
  // Lifetime = perpetual single-site: same feature set as Pro, just never expires.
  lifetime: { ...SINGLE_SITE_PAID, multiSite: false, maxSites: 1 },
  pro: { ...SINGLE_SITE_PAID, multiSite: false, maxSites: 1 },
  // Agency unlocks multi-site and everything else.
  agency: { ...SINGLE_SITE_PAID, multiSite: true, maxSites: Infinity },
}

/**
 * Resolve the {@link Entitlements} a tier unlocks. Pure and total: any tier maps
 * to a defined entitlement set (unknown values fall back to the trial's, so a
 * corrupt saved tier can never accidentally grant paid features).
 *
 * @param tier - The entitlement tier resolved from the license key.
 * @returns The features that tier unlocks.
 */
export function entitlementsFor(tier: LicenseTier): Entitlements {
  return ENTITLEMENTS[tier] ?? TRIAL_ENTITLEMENTS
}

/* -------------------------------------------------------------------------- */
/* Feature catalogue (for the License panel UI)                               */
/* -------------------------------------------------------------------------- */

/** A user-facing feature row shown in the License panel, tied to an entitlement. */
export interface FeatureInfo {
  /** The entitlement flag that gates this feature. */
  key: keyof Entitlements
  /** Friendly label shown in the panel. */
  label: string
  /** One-line description of what it does. */
  description: string
}

/**
 * The features surfaced in the License panel, in display order. `maxSites` is
 * intentionally omitted here — it's shown separately as a count, not a checkmark.
 */
export const LICENSE_FEATURES: readonly FeatureInfo[] = [
  { key: "whiteLabel", label: "Remove “Powered by”", description: "Hide the credit link on your banner." },
  { key: "accurateGeo", label: "Accurate geo-targeting", description: "IP-based EU/EEA detection, not just timezone." },
  { key: "multiLanguage", label: "Multi-language & A/B copy", description: "Auto-translate the banner to the visitor's locale." },
  { key: "analytics", label: "Consent analytics", description: "See accept / reject rates over time." },
  { key: "multiSite", label: "Unlimited sites", description: "Use one license across every project you own." },
]

/**
 * Whether a given feature is unlocked for a tier. Small convenience wrapper so
 * the panel can render a lock/checkmark per {@link LICENSE_FEATURES} row.
 *
 * @param tier - The active tier.
 * @param key - The entitlement flag to check.
 */
export function hasFeature(tier: LicenseTier, key: keyof Entitlements): boolean {
  const value = entitlementsFor(tier)[key]
  return typeof value === "number" ? value > 0 : value === true
}
