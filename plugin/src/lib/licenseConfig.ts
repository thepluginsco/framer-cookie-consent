/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  LEMON SQUEEZY LICENSE CONFIG — FILL IN YOUR IDS HERE                       │
 * │                                                                            │
 * │  This is the ONE place that hard-codes your Lemon Squeezy store and        │
 * │  product identifiers. Nothing else in the plugin references them.          │
 * │                                                                            │
 * │  Where to find these (Lemon Squeezy dashboard):                            │
 * │   • STORE_ID   → Settings → Stores (the numeric id, e.g. 12345)            │
 * │   • productId  → Products → your product → the numeric id in the URL       │
 * │   • variantId  → Products → your product → Variants → the numeric id       │
 * │   • PRODUCT_URL→ the public checkout/product page a buyer lands on          │
 * │                                                                            │
 * │  The license VALIDATE / ACTIVATE endpoints are safe to call from the       │
 * │  browser — they need NO secret API key. Do NOT put any secret key here.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import type { LicenseTier } from "../types"

/* -------------------------------------------------------------------------- */
/* ⬇️  CONFIGURE THESE — via env vars (preferred) or by editing the fallbacks  */
/* -------------------------------------------------------------------------- */

/*
 * The real ids can be supplied WITHOUT editing this file, by setting the
 * matching `VITE_LS_*` variables in `plugin/.env.local` (see `.env.example`).
 * That keeps store-specific ids out of source control and makes rotating them a
 * config change, not a code change. The literals below are the fallbacks used
 * when an env var is absent — replace them if you'd rather hard-code.
 */

/** Parse a numeric env var, falling back to `fallback` when unset/invalid. */
function numEnv(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Your Lemon Squeezy **store id** (numeric). A validated key is rejected unless
 * its `meta.store_id` matches this, so a key minted in someone else's store can
 * never unlock your plugin.
 *
 * Set `VITE_LS_STORE_ID`, or replace the `0` fallback. While it is `0`, NO key
 * can validate — {@link isConfigured} reports the plugin as unconfigured.
 */
export const STORE_ID: number = numEnv(import.meta.env.VITE_LS_STORE_ID, 0)

/**
 * The paid tiers and the Lemon Squeezy product/variant that grants each one.
 *
 * A validated key resolves to the tier whose `variantId` (preferred) or
 * `productId` matches the key's `meta`. `trial` is intentionally absent: it is
 * the un-licensed default, not something you sell.
 *
 * Set the `VITE_LS_*` vars, or replace the `0` fallbacks. Leave a tier `0` only
 * if it does not exist in your store yet (it simply won't match).
 */
export const PRODUCT_IDS: Readonly<Record<PaidTier, ProductRef>> = {
  /** One-time purchase, perpetual, tied to a single site. */
  lifetime: {
    productId: numEnv(import.meta.env.VITE_LS_LIFETIME_PRODUCT_ID, 0),
    variantId: numEnv(import.meta.env.VITE_LS_LIFETIME_VARIANT_ID, 0),
  },
  /** Subscription, single site, white-label + Pro features. */
  pro: {
    productId: numEnv(import.meta.env.VITE_LS_PRO_PRODUCT_ID, 0),
    variantId: numEnv(import.meta.env.VITE_LS_PRO_VARIANT_ID, 0),
  },
  /** Subscription, unlimited sites, multi-site/agency behaviours. */
  agency: {
    productId: numEnv(import.meta.env.VITE_LS_AGENCY_PRODUCT_ID, 0),
    variantId: numEnv(import.meta.env.VITE_LS_AGENCY_VARIANT_ID, 0),
  },
}

/**
 * Friendly URL a buyer is sent to from the "Buy a license" button. Point it at
 * your Lemon Squeezy product / checkout page.
 *
 * Set `VITE_LS_PRODUCT_URL`, or replace the fallback.
 */
export const PRODUCT_URL: string =
  (import.meta.env.VITE_LS_PRODUCT_URL as string | undefined) || "https://your-store.lemonsqueezy.com"

/**
 * Whether the store/product ids have actually been filled in. When `false`, the
 * License API is still callable but every real key resolves to "not one of
 * ours" (store id `0` matches nothing), so the plugin runs trial-only. The
 * License panel uses this to warn that licensing isn't wired up yet.
 */
export function isConfigured(): boolean {
  return STORE_ID > 0
}

/* -------------------------------------------------------------------------- */
/* ⬇️  Rarely need editing                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Base URL of the Lemon Squeezy License API. The `validate`/`activate`/
 * `deactivate` endpoints below are public (no secret key required).
 * @see https://docs.lemonsqueezy.com/help/licensing/license-api
 */
export const LICENSE_API_BASE = "https://api.lemonsqueezy.com/v1/licenses" as string

/**
 * How long a successful validation is trusted before we re-hit the API, in ms.
 * Defaults to 7 days: long enough to avoid a network call on every plugin load,
 * short enough to notice a refund/cancellation within a week.
 */
export const VALIDATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** The tiers that correspond to an actual purchasable product (everything but `trial`). */
export type PaidTier = Exclude<LicenseTier, "trial">

/** A Lemon Squeezy product + variant pair that grants a tier. */
export interface ProductRef {
  /** Numeric Lemon Squeezy product id. */
  productId: number
  /** Numeric Lemon Squeezy variant id (more specific than the product). */
  variantId: number
}
