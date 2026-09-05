/**
 * Persistent cache for the last known-good license verdict.
 *
 * Validation results are cached in Framer plugin data so the plugin doesn't
 * re-hit the Lemon Squeezy API on every load, and so a temporary licensing
 * outage falls back to the last successful verdict instead of downgrading the
 * user. The cached tier is small (well under Framer's 2KB per-value limit), so —
 * unlike the chunked {@link module:configStore} — it lives under a single key.
 *
 * The freshness policy ({@link isCacheFresh}) is a pure function so it can be
 * reasoned about (and tested) without a clock or Framer.
 */

import { getPluginData, setPluginData } from "./framer"
import { VALIDATION_TTL_MS } from "./licenseConfig"
import type { LicenseTier } from "../types"

/** Plugin-data key holding the serialized {@link CachedLicense}. */
const CACHE_KEY = "cookieConsentLicense.cache"

/**
 * A validated license verdict, cached to survive reloads and outages. Keyed to
 * the exact `key` it was validated for, so a changed key invalidates it.
 */
export interface CachedLicense {
  /** The license key this verdict is for (cache is ignored if the key changes). */
  key: string
  /** Resolved entitlement tier. */
  tier: LicenseTier
  /** Whether white-label was entitled at validation time. */
  whiteLabel: boolean
  /** The bound activation instance id (needed to later deactivate/move the key). */
  instanceId: string | null
  /** Epoch-ms timestamp of the successful validation. */
  validatedAt: number
}

/**
 * Whether a cached verdict is still within its trust window and matches `key`.
 * Pure — the caller supplies `now` so this is deterministic and testable.
 *
 * @param cached - The cached verdict (or `null`).
 * @param key - The key we currently want a verdict for.
 * @param now - Current epoch-ms.
 * @param ttl - Trust window in ms (defaults to {@link VALIDATION_TTL_MS}).
 */
export function isCacheFresh(
  cached: CachedLicense | null,
  key: string,
  now: number,
  ttl: number = VALIDATION_TTL_MS,
): cached is CachedLicense {
  if (cached === null) return false
  if (cached.key !== key) return false
  const age = now - cached.validatedAt
  return age >= 0 && age < ttl
}

/** Narrow arbitrary parsed JSON to a {@link CachedLicense}. */
function isCachedLicense(value: unknown): value is CachedLicense {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.key === "string" &&
    typeof v.tier === "string" &&
    typeof v.whiteLabel === "boolean" &&
    (typeof v.instanceId === "string" || v.instanceId === null) &&
    typeof v.validatedAt === "number"
  )
}

/**
 * Load the cached verdict, or `null` when nothing valid is stored. Reads are
 * always allowed by Framer and never throw (a corrupt value → `null`).
 */
export async function loadCachedLicense(): Promise<CachedLicense | null> {
  try {
    const raw = await getPluginData(CACHE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isCachedLicense(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persist a verdict to the cache. Requires the `setPluginData` permission; the
 * caller should ignore failures (caching is best-effort, not load-bearing).
 */
export async function saveCachedLicense(entry: CachedLicense): Promise<void> {
  await setPluginData(CACHE_KEY, JSON.stringify(entry))
}

/** Clear the cached verdict (e.g. when the user removes their key). */
export async function clearCachedLicense(): Promise<void> {
  await setPluginData(CACHE_KEY, null)
}
