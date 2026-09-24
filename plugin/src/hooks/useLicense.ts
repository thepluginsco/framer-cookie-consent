/**
 * `useLicense` — the plugin's license state engine (portal-based).
 *
 * Bridges the Consentful licensing portal ({@link module:lib/portalLicense})
 * with the shared config (`config.license`). Licensing is now DOMAIN-based: the
 * user pastes a license key and the plugin ACTIVATES the site's published domain
 * against it (a "site seat"). The published site's runtime unlocks on its own,
 * by fetching a domain-scoped signed token at boot — it never trusts the
 * injected config — so this hook's job is only to:
 *
 * - resolve the published domain (from Framer's publish info);
 * - activate a pasted key against that domain and report the resolved plan;
 * - write the resolved `{ key, tier, whiteLabel }` back into `config.license` so
 *   the EDITOR UI unlocks its Pro controls (an editor hint; the runtime re-derives
 *   entitlement from the token);
 * - never hard-crash on a licensing outage — a network error keeps the last
 *   status rather than downgrading a paying user.
 *
 * Seat management across sites (freeing/moving a seat) lives on the portal
 * dashboard, not here.
 */

import { useCallback, useEffect, useMemo, useState } from "react"

import { getLiveSiteUrl } from "../lib/framer"
import {
  createPortalClient,
  PortalNetworkError,
  type ActivationResult,
} from "../lib/portalLicense"
import { entitlementsFor, type Entitlements } from "../lib/entitlements"
import { useSettingsContext } from "@framer-cookie-consent/shared-ui"
import type { LicenseTier } from "../types"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The UI-facing license status:
 * - `trial`      — no key activated; running the free (basic) banner.
 * - `validating` — an activation request is in flight.
 * - `active`     — the key activated this domain and unlocked a paid plan.
 * - `invalid`    — the key was rejected (unknown / expired / seat limit reached).
 * - `offline`    — couldn't reach the portal; keeping the last known status.
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
  /** UI status of the last activation (see {@link LicenseStatus}). */
  status: LicenseStatus
  /** Human-readable note for the current status (e.g. a rejection reason), or `null`. */
  message: string | null
  /**
   * The published domain the key is (or would be) activated for, or `null` when
   * the site hasn't been published yet (activation needs a live domain).
   */
  domain: string | null
  /** Activate a key, registering the published domain as a seat. */
  enterKey: (key: string) => Promise<void>
  /** Remove the key locally (relock the editor). Seat management is on the portal. */
  removeKey: () => Promise<void>
  /** Re-activate the current key against the current domain. */
  refresh: () => Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Extract a bare hostname from a URL, or `null` when it isn't parseable. */
function hostnameOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/** Friendly one-liner for a rejected activation. */
function rejectionMessage(reason: string | null): string {
  return reason?.trim()
    ? reason
    : "That key couldn't be activated for this site. Double-check it, or manage your seats on the portal."
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
  const [domain, setDomain] = useState<string | null>(null)

  /** The portal client (real `fetch`), created once. */
  const client = useMemo(() => createPortalClient(), [])

  const entitlements = useMemo(() => entitlementsFor(tier), [tier])

  /** Write the resolved license into the shared config — only if it changed. */
  const syncConfig = useCallback(
    (next: { key: string | null; tier: LicenseTier; whiteLabel: boolean }) => {
      update((prev) => {
        const cur = prev.license
        if (cur.key === next.key && cur.tier === next.tier && cur.whiteLabel === next.whiteLabel) {
          return prev
        }
        return { ...prev, license: { ...prev.license, key: next.key, tier: next.tier, whiteLabel: next.whiteLabel } }
      })
    },
    [update],
  )

  /** Resolve (and cache in state) the site's published domain. */
  const resolveDomain = useCallback(async (): Promise<string | null> => {
    const host = hostnameOf(await getLiveSiteUrl())
    setDomain(host)
    return host
  }, [])

  /** Apply an activation verdict to config + UI. */
  const applyActivation = useCallback(
    (k: string, v: ActivationResult) => {
      if (v.ok) {
        syncConfig({ key: k, tier: v.tier, whiteLabel: v.whiteLabel })
        setStatus("active")
        setMessage(null)
      } else {
        // Rejected: keep the key visible so the user can correct it, but relock.
        syncConfig({ key: k || null, tier: "trial", whiteLabel: false })
        setStatus("invalid")
        setMessage(rejectionMessage(v.reason))
      }
    },
    [syncConfig],
  )

  /** Activate `k` against the current published domain. */
  const activate = useCallback(
    async (k: string): Promise<void> => {
      const host = await resolveDomain()
      if (!host) {
        // No live domain yet — a seat is registered against a real hostname, so
        // the user has to publish the site once before activating.
        setStatus("invalid")
        setMessage("Publish your site first, then activate — a license is tied to your live domain.")
        return
      }
      const v = await client.activate(k, host)
      applyActivation(k, v)
    },
    [client, resolveDomain, applyActivation],
  )

  /** Enter a new key from the UI (trims; empty → remove). */
  const enterKey = useCallback(
    async (input: string) => {
      const k = input.trim()
      if (!k) {
        syncConfig({ key: null, tier: "trial", whiteLabel: false })
        setStatus("trial")
        setMessage(null)
        return
      }
      setStatus("validating")
      setMessage(null)
      try {
        await activate(k)
      } catch (error) {
        if (error instanceof PortalNetworkError) {
          // Can't verify right now; store the key but stay on trial until we can.
          syncConfig({ key: k, tier: "trial", whiteLabel: false })
          setStatus("offline")
          setMessage("Couldn't reach the licensing server — we'll activate this key next time you're online.")
        } else {
          console.warn("[cookie-consent] activation failed:", error)
          syncConfig({ key: k, tier: "trial", whiteLabel: false })
          setStatus("invalid")
          setMessage("Something went wrong activating that key. Please try again.")
        }
      }
    },
    [activate, syncConfig],
  )

  /** Force a re-activation of the current key. */
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
    try {
      await activate(k)
    } catch (error) {
      if (!(error instanceof PortalNetworkError)) {
        console.warn("[cookie-consent] re-activation failed:", error)
      }
      setStatus("offline")
      setMessage("Couldn't reach the licensing server — keeping your last verified status.")
    }
  }, [key, activate, syncConfig])

  /** Remove the current key locally (relock the editor). */
  const removeKey = useCallback(async () => {
    syncConfig({ key: null, tier: "trial", whiteLabel: false })
    setStatus("trial")
    setMessage(null)
  }, [syncConfig])

  /* ---- Resolve the published domain once on mount (best-effort) ----------- */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const host = hostnameOf(await getLiveSiteUrl())
      if (!cancelled) setDomain(host)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { tier, entitlements, key, status, message, domain, enterKey, removeKey, refresh }
}
