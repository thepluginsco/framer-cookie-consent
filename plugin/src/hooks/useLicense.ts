/**
 * `useLicense` — the plugin's license state engine.
 *
 * Bridges the Lemon Squeezy License API ({@link module:lib/license}) with the
 * shared config (`config.license`) and a Framer-plugin-data cache
 * ({@link module:lib/licenseCache}). It:
 *
 * - resolves the current {@link LicenseTier} and derived {@link Entitlements};
 * - lets the UI enter / remove / re-check a key (`enterKey`, `removeKey`,
 *   `refresh`);
 * - writes the resolved `{ key, tier, whiteLabel }` back into `config.license`
 *   (via `useSettings`) so the injected runtime learns its entitlements;
 * - caches successful verdicts and re-validates at most once per
 *   {@link VALIDATION_TTL_MS} (7 days), on demand, or when the key changes;
 * - NEVER hard-crashes on a licensing outage — a network error falls back to the
 *   last known-good cached verdict instead of downgrading a paying user.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getProjectInfo } from "../lib/framer"
import {
  createLicenseClient,
  LicenseNetworkError,
  type LicenseValidation,
} from "../lib/license"
import {
  clearCachedLicense,
  isCacheFresh,
  loadCachedLicense,
  saveCachedLicense,
  type CachedLicense,
} from "../lib/licenseCache"
import { entitlementsFor, type Entitlements } from "../lib/entitlements"
import { useSettingsContext } from "../state/settings-context"
import type { LicenseTier } from "../types"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The UI-facing license status:
 * - `trial`      — no key entered; running the free (basic) banner.
 * - `validating` — a validate/activate request is in flight.
 * - `active`     — the key validated and unlocked a paid tier.
 * - `invalid`    — the key was rejected (wrong store/product, expired, disabled).
 * - `offline`    — couldn't reach the API; showing the last known-good verdict.
 */
export type LicenseStatus = "trial" | "validating" | "active" | "invalid" | "offline"

/** The license API returned by {@link useLicense}. */
export interface LicenseApi {
  /** Current entitlement tier. */
  tier: LicenseTier
  /** Features unlocked by {@link tier} (derived, never stored). */
  entitlements: Entitlements
  /** The current license key (empty string when none). */
  key: string
  /** UI status of the last check (see {@link LicenseStatus}). */
  status: LicenseStatus
  /** Human-readable note for the current status (e.g. a rejection reason), or `null`. */
  message: string | null
  /** Enter (activate + validate) a key, binding it to this site. */
  enterKey: (key: string) => Promise<void>
  /** Remove the current key and deactivate its site binding. */
  removeKey: () => Promise<void>
  /** Force a fresh re-validation of the current key against the API. */
  refresh: () => Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Friendly one-liner for a rejected key, based on its Lemon Squeezy status. */
function invalidMessage(v: LicenseValidation): string {
  switch (v.status) {
    case "expired":
      return "This key has expired. Renew it to keep Pro features."
    case "disabled":
      return "This key has been disabled. Contact support if that's unexpected."
    case "inactive":
      return "This key isn't active yet."
    default:
      return "That key doesn't match this product. Double-check it and try again."
  }
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Read and manage the plugin's license. Call once high in the tree (or per
 * panel — it's cheap); it shares state through the settings context.
 */
export function useLicense(): LicenseApi {
  const { config, update } = useSettingsContext()
  const key = config.license.key ?? ""
  const tier = config.license.tier

  const [status, setStatus] = useState<LicenseStatus>(key ? "active" : "trial")
  const [message, setMessage] = useState<string | null>(null)

  /** The Lemon Squeezy client (real `fetch`), created once. */
  const client = useMemo(() => createLicenseClient(), [])
  /** The activation instance id for the current key, loaded from cache. */
  const instanceIdRef = useRef<string | null>(null)
  /** Guards the one-shot bootstrap so it doesn't re-run on every render. */
  const bootstrappedRef = useRef(false)

  const entitlements = useMemo(() => entitlementsFor(tier), [tier])

  /** Write the resolved license into the shared config — only if it changed. */
  const syncConfig = useCallback(
    (next: { key: string | null; tier: LicenseTier; whiteLabel: boolean }) => {
      update((prev) => {
        const cur = prev.license
        if (cur.key === next.key && cur.tier === next.tier && cur.whiteLabel === next.whiteLabel) {
          return prev
        }
        return { ...prev, license: { key: next.key, tier: next.tier, whiteLabel: next.whiteLabel } }
      })
    },
    [update],
  )

  /** Apply a fresh (valid or invalid) verdict to config + cache + UI. */
  const applyValidation = useCallback(
    async (k: string, v: LicenseValidation) => {
      if (v.valid && v.tier) {
        instanceIdRef.current = v.instanceId ?? instanceIdRef.current
        syncConfig({ key: k, tier: v.tier, whiteLabel: v.whiteLabel })
        setStatus("active")
        setMessage(null)
        const entry: CachedLicense = {
          key: k,
          tier: v.tier,
          whiteLabel: v.whiteLabel,
          instanceId: instanceIdRef.current,
          validatedAt: Date.now(),
        }
        // Best-effort persistence; a viewer without write permission just won't cache.
        try {
          await saveCachedLicense(entry)
        } catch {
          /* caching is non-load-bearing */
        }
      } else {
        // Rejected: keep the key visible so the user can see/correct it, but
        // drop entitlements to the trial and don't cache a failure.
        syncConfig({ key: k || null, tier: "trial", whiteLabel: false })
        setStatus("invalid")
        setMessage(invalidMessage(v))
      }
    },
    [syncConfig],
  )

  /** Fall back to the last known-good cached verdict when the API is unreachable. */
  const fallBackOffline = useCallback(
    (k: string, cached: CachedLicense | null) => {
      if (cached && cached.key === k) {
        instanceIdRef.current = cached.instanceId
        syncConfig({ key: k, tier: cached.tier, whiteLabel: cached.whiteLabel })
      }
      setStatus("offline")
      setMessage("Couldn't reach the license server — using your last verified status.")
    },
    [syncConfig],
  )

  /** The Framer project id, used as the activation instance name (best-effort). */
  const projectInstanceName = useCallback(async (): Promise<string> => {
    try {
      const info = await getProjectInfo()
      return info.id
    } catch {
      return "framer-site"
    }
  }, [])

  /**
   * Validate `k`, binding it to this site on first use. Avoids duplicate
   * activations: it only activates when validation reports no bound instance.
   */
  const bindAndValidate = useCallback(
    async (k: string): Promise<void> => {
      const existing = instanceIdRef.current ?? undefined
      const v = await client.validateKey(k, existing)
      if (!v.valid) {
        await applyValidation(k, v)
        return
      }
      if (v.instanceId) {
        await applyValidation(k, v)
        return
      }
      // Valid key with no bound instance → activate to tie it to this site.
      const a = await client.activateKey(k, await projectInstanceName())
      if (a.valid) {
        await applyValidation(k, a)
      } else {
        // The key is genuine but couldn't be bound (usually the site limit).
        // Grant the entitlements anyway; just warn we couldn't reserve a seat.
        await applyValidation(k, v)
        setMessage("Unlocked, but this key has reached its site limit. Deactivate another site to bind this one.")
      }
    },
    [client, applyValidation, projectInstanceName],
  )

  /** Force a network re-validation of the current key. */
  const refresh = useCallback(async () => {
    const k = key.trim()
    if (!k) {
      syncConfig({ key: null, tier: "trial", whiteLabel: false })
      setStatus("trial")
      setMessage(null)
      return
    }
    setStatus("validating")
    setMessage(null)
    const cached = await loadCachedLicense()
    try {
      await bindAndValidate(k)
    } catch (error) {
      if (error instanceof LicenseNetworkError) {
        fallBackOffline(k, cached)
      } else {
        // Unexpected (bug) — don't take the banner offline; keep last status.
        console.warn("[cookie-consent] license refresh failed:", error)
        fallBackOffline(k, cached)
      }
    }
  }, [key, bindAndValidate, fallBackOffline, syncConfig])

  /** Enter a new key from the UI (trims; empty → remove). */
  const enterKey = useCallback(
    async (input: string) => {
      const k = input.trim()
      if (!k) {
        syncConfig({ key: null, tier: "trial", whiteLabel: false })
        instanceIdRef.current = null
        setStatus("trial")
        setMessage(null)
        try {
          await clearCachedLicense()
        } catch {
          /* ignore */
        }
        return
      }
      // A freshly entered key has no known binding yet.
      instanceIdRef.current = null
      setStatus("validating")
      setMessage(null)
      try {
        await bindAndValidate(k)
      } catch (error) {
        if (error instanceof LicenseNetworkError) {
          // Can't verify right now; store the key but stay on trial until we can.
          syncConfig({ key: k, tier: "trial", whiteLabel: false })
          setStatus("offline")
          setMessage("Couldn't reach the license server — we'll verify this key next time you're online.")
        } else {
          console.warn("[cookie-consent] license activation failed:", error)
          syncConfig({ key: k, tier: "trial", whiteLabel: false })
          setStatus("invalid")
          setMessage("Something went wrong validating that key. Please try again.")
        }
      }
    },
    [bindAndValidate, syncConfig],
  )

  /** Remove the current key + release its site binding. */
  const removeKey = useCallback(async () => {
    const k = key.trim()
    const instanceId = instanceIdRef.current
    // Best-effort deactivation so the freed seat can move to another site.
    if (k && instanceId) {
      try {
        await client.deactivateKey(k, instanceId)
      } catch {
        /* offline / already gone — the local removal below still applies */
      }
    }
    instanceIdRef.current = null
    syncConfig({ key: null, tier: "trial", whiteLabel: false })
    setStatus("trial")
    setMessage(null)
    try {
      await clearCachedLicense()
    } catch {
      /* ignore */
    }
  }, [key, client, syncConfig])

  /* ---- Bootstrap on mount: honour a fresh cache, else re-validate --------- */
  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    let cancelled = false
    void (async () => {
      const k = key.trim()
      if (!k) {
        setStatus("trial")
        return
      }
      const cached = await loadCachedLicense()
      if (cancelled) return
      // Seed the known binding before any type-guard narrowing touches `cached`.
      const seedInstance = cached && cached.key === k ? cached.instanceId : null
      if (isCacheFresh(cached, k, Date.now())) {
        // Trusted within the 7-day window — no network call needed.
        instanceIdRef.current = cached.instanceId
        syncConfig({ key: k, tier: cached.tier, whiteLabel: cached.whiteLabel })
        setStatus("active")
        setMessage(null)
        return
      }
      // Missing or stale cache → re-validate against the API.
      instanceIdRef.current = seedInstance
      await refresh()
    })()

    return () => {
      cancelled = true
    }
    // Intentionally run once on mount; `key` is read fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { tier, entitlements, key, status, message, enterKey, removeKey, refresh }
}
