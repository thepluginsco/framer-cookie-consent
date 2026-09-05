/**
 * Typed, fully client-side client for the Lemon Squeezy **License API**.
 *
 * The `validate` / `activate` / `deactivate` endpoints are public — they need no
 * secret API key, so calling them straight from the plugin (which runs in the
 * browser) is safe. This module NEVER embeds a secret key.
 *
 * Design goals:
 * - **Strictly typed** request/response shapes for each endpoint.
 * - **Testable**: the tier-mapping ({@link resolveTierFrom}) is pure, and the
 *   client takes an injectable `fetch` so responses can be mocked in unit tests.
 * - **Graceful degradation**: transient failures (network down, HTTP 429 rate
 *   limit, 5xx) throw a {@link LicenseNetworkError} so the caller can fall back
 *   to the last known-good cached verdict instead of downgrading a paying user.
 *
 * @see https://docs.lemonsqueezy.com/help/licensing/license-api
 */

import {
  LICENSE_API_BASE,
  PRODUCT_IDS,
  STORE_ID,
  type PaidTier,
  type ProductRef,
} from "./licenseConfig.ts"
import { entitlementsFor } from "./entitlements.ts"
import type { LicenseTier } from "../types"

/* -------------------------------------------------------------------------- */
/* Lemon Squeezy wire types                                                    */
/* -------------------------------------------------------------------------- */

/** A Lemon Squeezy license key's lifecycle status. */
export type LemonLicenseStatus = "active" | "inactive" | "expired" | "disabled"

/** The `meta` block returned by every license endpoint — identifies the product. */
export interface LicenseMeta {
  /** Numeric store id the key belongs to. Must match {@link STORE_ID}. */
  store_id: number
  /** Order that produced the key. */
  order_id: number
  /** Order item that produced the key. */
  order_item_id: number
  /** Numeric product id — mapped to a tier via {@link PRODUCT_IDS}. */
  product_id: number
  /** Human-readable product name. */
  product_name: string
  /** Numeric variant id — the preferred key for tier resolution. */
  variant_id: number
  /** Human-readable variant name. */
  variant_name: string
  /** Purchasing customer id. */
  customer_id: number
  /** Purchasing customer name. */
  customer_name: string
  /** Purchasing customer email. */
  customer_email: string
}

/** The `license_key` block describing the key itself. */
export interface LemonLicenseKey {
  id: number
  status: LemonLicenseStatus
  key: string
  /** Max number of activations allowed, or `null` for unlimited. */
  activation_limit: number | null
  /** Activations used so far. */
  activation_usage: number
  created_at: string
  /** ISO expiry, or `null` for perpetual (lifetime) keys. */
  expires_at: string | null
}

/** An activation instance (a key bound to one site/machine). */
export interface LemonInstance {
  id: string
  name: string
  created_at: string
}

/** Raw response from `POST /v1/licenses/validate`. */
interface LemonValidateResponse {
  valid: boolean
  error: string | null
  license_key: LemonLicenseKey
  instance: LemonInstance | null
  meta: LicenseMeta
}

/** Raw response from `POST /v1/licenses/activate`. */
interface LemonActivateResponse {
  activated: boolean
  error: string | null
  license_key: LemonLicenseKey
  instance: LemonInstance | null
  meta: LicenseMeta
}

/** Raw response from `POST /v1/licenses/deactivate`. */
interface LemonDeactivateResponse {
  deactivated: boolean
  error: string | null
}

/* -------------------------------------------------------------------------- */
/* Public result type                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The normalized outcome of a validate/activate call, as consumed by the hook
 * and cache. Mirrors the shape the task asks for: `{ valid, status, tier, meta }`
 * plus the derived `whiteLabel` and the bound activation instance id.
 */
export interface LicenseValidation {
  /**
   * `true` only when the key is genuinely usable AND belongs to OUR store/
   * product. A structurally-valid key from another store resolves to `false`.
   */
  valid: boolean
  /** The Lemon Squeezy key status, or `"unknown"` if the key was rejected outright. */
  status: LemonLicenseStatus | "unknown"
  /** The entitlement tier the key maps to, or `null` if it isn't one of ours. */
  tier: LicenseTier | null
  /** Whether white-label is entitled — derived from {@link tier}. */
  whiteLabel: boolean
  /** The activation instance id, if the key is bound to this site. */
  instanceId: string | null
  /** The raw product/store `meta`, for diagnostics (or `null` when unavailable). */
  meta: LicenseMeta | null
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Thrown for TRANSIENT failures where the key's validity is unknown: the network
 * is unreachable, the API rate-limited us (HTTP 429), or it returned a 5xx.
 *
 * Callers should treat this as "couldn't check right now" and fall back to the
 * last known-good cached verdict rather than revoking access.
 */
export class LicenseNetworkError extends Error {
  /** HTTP status code, or `0` for a transport-level failure (offline/timeout). */
  readonly httpStatus: number

  constructor(message: string, httpStatus: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "LicenseNetworkError"
    this.httpStatus = httpStatus
  }
}

/** Thrown specifically on HTTP 429 so the UI can show a "try again shortly" hint. */
export class LicenseRateLimitError extends LicenseNetworkError {
  constructor(message = "Lemon Squeezy rate limit reached (60 requests/min). Try again shortly.") {
    super(message, 429)
    this.name = "LicenseRateLimitError"
  }
}

/* -------------------------------------------------------------------------- */
/* Pure tier resolution                                                        */
/* -------------------------------------------------------------------------- */

/** Loose numeric compare — Lemon Squeezy may serialize ids as number or string. */
function idEquals(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

/**
 * Resolve a {@link LicenseTier} from a license `meta`, checking it against an
 * explicit store id and product table. PURE — no globals, no network — so it can
 * be unit-tested with fixtures independent of the placeholder config.
 *
 * A tier matches when its `variantId` (preferred) or `productId` equals the
 * key's meta. A key whose `store_id` doesn't match `storeId`, or whose product
 * isn't in `products`, resolves to `null` (i.e. "not one of ours").
 *
 * @param meta - The `meta` block from a validate/activate response.
 * @param storeId - The store id keys must belong to (see {@link STORE_ID}).
 * @param products - The tier → product/variant table (see {@link PRODUCT_IDS}).
 * @returns The matching paid tier, or `null` if the key isn't ours.
 */
export function resolveTierFrom(
  meta: Pick<LicenseMeta, "store_id" | "product_id" | "variant_id">,
  storeId: number,
  products: Readonly<Record<PaidTier, ProductRef>>,
): PaidTier | null {
  // Reject anything that isn't from our store outright.
  if (!idEquals(meta.store_id, storeId)) return null

  let productFallback: PaidTier | null = null
  for (const tier of Object.keys(products) as PaidTier[]) {
    const ref = products[tier]
    // Variant match is the most specific — return immediately.
    if (ref.variantId && idEquals(ref.variantId, meta.variant_id)) return tier
    // Remember a product-level match but keep looking for a variant match.
    if (productFallback === null && ref.productId && idEquals(ref.productId, meta.product_id)) {
      productFallback = tier
    }
  }
  return productFallback
}

/** Convenience wrapper: resolve a tier using the real {@link STORE_ID}/{@link PRODUCT_IDS}. */
export function resolveTier(meta: LicenseMeta): PaidTier | null {
  return resolveTierFrom(meta, STORE_ID, PRODUCT_IDS)
}

/**
 * Build a {@link LicenseValidation} from a raw validate/activate payload, applying
 * our store/product gate. Pure given the store/product inputs.
 */
function toValidation(
  payload: { valid: boolean; license_key: LemonLicenseKey; instance: LemonInstance | null; meta: LicenseMeta },
  storeId: number,
  products: Readonly<Record<PaidTier, ProductRef>>,
): LicenseValidation {
  const tier = payload.meta ? resolveTierFrom(payload.meta, storeId, products) : null
  // Valid ONLY if Lemon Squeezy says so AND it maps to one of our tiers.
  const valid = payload.valid === true && tier !== null
  return {
    valid,
    status: payload.license_key?.status ?? "unknown",
    tier: valid ? tier : null,
    whiteLabel: valid && tier ? entitlementsFor(tier).whiteLabel : false,
    instanceId: payload.instance?.id ?? null,
    meta: payload.meta ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

/** Dependencies a {@link LicenseClient} can be constructed with (all optional). */
export interface LicenseClientDeps {
  /** Injectable `fetch` (defaults to the global). Lets tests mock responses. */
  fetchFn?: typeof fetch
  /** Store id override (defaults to {@link STORE_ID}) — for hermetic tests. */
  storeId?: number
  /** Product table override (defaults to {@link PRODUCT_IDS}) — for hermetic tests. */
  products?: Readonly<Record<PaidTier, ProductRef>>
  /** API base override (defaults to {@link LICENSE_API_BASE}). */
  apiBase?: string
}

/** A typed client for the Lemon Squeezy License API. */
export interface LicenseClient {
  /**
   * Validate a key. Optionally pass an `instanceId` to confirm a specific
   * activation is still bound. Returns the normalized verdict — a key that is
   * structurally valid but from another store resolves to `{ valid: false }`.
   * @throws {LicenseNetworkError} on transient failures (offline / 429 / 5xx).
   */
  validateKey(key: string, instanceId?: string): Promise<LicenseValidation>
  /**
   * Activate a key, binding it to this site. `instanceName` should identify the
   * site (the plugin passes the Framer project id). Returns the verdict incl.
   * the new `instanceId`, which the caller must persist to later deactivate.
   * @throws {LicenseNetworkError} on transient failures (offline / 429 / 5xx).
   */
  activateKey(key: string, instanceName: string): Promise<LicenseValidation>
  /**
   * Deactivate an activation instance, freeing a seat so the key can move to
   * another site. Resolves `true` when the instance was released.
   * @throws {LicenseNetworkError} on transient failures (offline / 429 / 5xx).
   */
  deactivateKey(key: string, instanceId: string): Promise<boolean>
}

/**
 * POST to a license endpoint with form-encoded params and parse the JSON body.
 *
 * Throws {@link LicenseNetworkError} / {@link LicenseRateLimitError} for
 * transient conditions (transport error, 429, ≥500). A 4xx with a JSON body
 * (e.g. an invalid key → `{ valid: false, error }`) is returned as data, NOT
 * thrown, so the caller can distinguish "invalid" from "couldn't check".
 */
async function postForm<T>(
  fetchFn: typeof fetch,
  url: string,
  params: Record<string, string>,
): Promise<T> {
  let response: Response
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
    })
  } catch (cause) {
    // Transport-level failure: offline, DNS, CORS, timeout, etc.
    throw new LicenseNetworkError("Could not reach the license server.", 0, { cause })
  }

  if (response.status === 429) throw new LicenseRateLimitError()
  if (response.status >= 500) {
    throw new LicenseNetworkError(`License server error (HTTP ${response.status}).`, response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new LicenseNetworkError("License server returned an unreadable response.", response.status, { cause })
  }
  return body as T
}

/**
 * Create a {@link LicenseClient}. In production call with no arguments; tests
 * pass a mock `fetch` and/or store/product overrides.
 *
 * @param deps - Optional injected dependencies (see {@link LicenseClientDeps}).
 */
export function createLicenseClient(deps: LicenseClientDeps = {}): LicenseClient {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  const storeId = deps.storeId ?? STORE_ID
  const products = deps.products ?? PRODUCT_IDS
  const apiBase = deps.apiBase ?? LICENSE_API_BASE

  if (typeof fetchFn !== "function") {
    throw new Error("createLicenseClient: no fetch implementation available.")
  }

  return {
    async validateKey(key, instanceId) {
      const params: Record<string, string> = { license_key: key.trim() }
      if (instanceId) params.instance_id = instanceId
      const data = await postForm<LemonValidateResponse>(fetchFn, `${apiBase}/validate`, params)
      return toValidation(data, storeId, products)
    },

    async activateKey(key, instanceName) {
      const data = await postForm<LemonActivateResponse>(fetchFn, `${apiBase}/activate`, {
        license_key: key.trim(),
        instance_name: instanceName,
      })
      // `activate` returns `activated` rather than `valid`; normalize onto `valid`.
      return toValidation(
        { valid: data.activated, license_key: data.license_key, instance: data.instance, meta: data.meta },
        storeId,
        products,
      )
    },

    async deactivateKey(key, instanceId) {
      const data = await postForm<LemonDeactivateResponse>(fetchFn, `${apiBase}/deactivate`, {
        license_key: key.trim(),
        instance_id: instanceId,
      })
      return data.deactivated === true
    },
  }
}
