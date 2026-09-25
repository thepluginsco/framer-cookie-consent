/**
 * `useLicense` — the editor's license state engine (portal-based), shared by
 * every platform (Framer, Webflow, WordPress, Shopify, Wix, universal embed).
 *
 * Bridges the Consentful licensing portal ({@link module:license/portal-client})
 * with the shared config (`config.license`). Licensing is DOMAIN-based: the user
 * pastes a license key and the editor ACTIVATES the site's domain against it (a
 * "site seat"). The published site's runtime unlocks on its own by fetching a
 * domain-scoped signed token at boot — it never trusts the injected config — so
 * this hook's job is only to:
 *
 * - resolve the site's domain (the host's live URL, or one the user types when
 *   the host can't know it — e.g. the universal embed);
 * - activate a pasted key against that domain and report the resolved plan;
 * - write `{ key, tier, whiteLabel }` into `config.license` so the EDITOR
 *   unlocks its Pro controls (an editor hint; the runtime re-derives entitlement
 *   from the token, and the key is stripped from published HTML);
 * - re-check a saved key when the editor opens, so a lapsed plan relocks;
 * - never downgrade a paying user on a licensing outage.
 *
 * Seat management across sites (freeing/moving a seat) lives on the portal
 * dashboard, not here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { LicenseTier } from "@framer-cookie-consent/shared"

import { useHost } from "../host"
import { useSettingsContext } from "../settings-context"
import { createPortalClient, PortalNetworkError, type ActivationResult } from "./portal-client"

/**
 * The UI-facing license status:
 * - `trial`      — no key activated; the editor's Pro controls are locked.
 * - `validating` — an activation request is in flight.
 * - `active`     — the key activated this domain on a paid plan.
 * - `invalid`    — the key was rejected (unknown / expired / free / site limit).
 * - `offline`    — couldn't reach the portal; keeping the last known status.
 */
export type LicenseStatus = "trial" | "validating" | "active" | "invalid" | "offline"

/** The license API returned by {@link useLicense}. */
export interface LicenseApi {
  /** Current entitlement tier (editor hint). */
  tier: LicenseTier
  /** The current license key (empty string when none). */
  key: string
  /** UI status of the last activation (see {@link LicenseStatus}). */
  status: LicenseStatus
  /** Human-readable note for the current status (e.g. a rejection reason), or `null`. */
  message: string | null
  /**
   * The domain the key is (or would be) activated for, or `null` when unknown
   * (unpublished site, or a host that can't know its domain and none was typed).
   */
  domain: string | null
  /** Whether {@link domain} came from the host (vs. typed by the user). */
  domainFromHost: boolean
  /** Set the domain manually (hosts that can't detect it, e.g. the embed). */
  setDomain: (domain: string) => void
  /** Production sites the plan allows, when known from the last activation. */
  maxSites: number | null
  /** Whether the activated domain is a free preview/staging host. */
  isDev: boolean
  /** Activate a key, registering the domain as a seat. */
  enterKey: (key: string) => Promise<void>
  /** Remove the key locally (relock the editor). Seat management is on the portal. */
  removeKey: () => Promise<void>
  /** Re-activate the current key against the current domain. */
  refresh: () => Promise<void>
}

/** Extract a bare hostname from a URL or host string, or `null` when unparseable. */
export function hostnameOf(input: string | null): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname || null
  } catch {
    return null
  }
}

/** Friendly one-liner for a rejected activation. */
function rejectionMessage(reason: string | null): string {
  return reason?.trim()
    ? reason
    : "That key couldn't be activated for this site. Double-check it, or manage your sites on the dashboard."
}

/** Per-browser memory of a manually entered domain (embed host). */
const DOMAIN_KEY = "consentful:license-domain"

function readSavedDomain(): string | null {
  try {
    return window.localStorage.getItem(DOMAIN_KEY)
  } catch {
    return null
  }
}

function saveDomain(domain: string): void {
  try {
    window.localStorage.setItem(DOMAIN_KEY, domain)
  } catch {
    /* storage unavailable */
  }
}

/**
 * Read and manage the site's license. Cheap to call per panel; state that must
 * be shared lives in the settings context (`config.license`).
 */
export function useLicense(opts: { autoCheck?: boolean } = {}): LicenseApi {
  const autoCheck = opts.autoCheck ?? false
  const host = useHost()
  const { config, update } = useSettingsContext()
  const key = config.license.key ?? ""
  const tier = config.license.tier

  const [status, setStatus] = useState<LicenseStatus>(key && tier !== "trial" ? "active" : "trial")
  const [message, setMessage] = useState<string | null>(null)
  const [hostDomain, setHostDomain] = useState<string | null>(null)
  const [typedDomain, setTypedDomain] = useState<string | null>(() => readSavedDomain())
  const [maxSites, setMaxSites] = useState<number | null>(null)
  const [isDev, setIsDev] = useState(false)

  // Same optional per-site API override the runtime honours (staging/dev).
  const apiBase = config.license.portalApiBaseUrl || undefined
  const client = useMemo(() => createPortalClient(apiBase ? { apiBase } : {}), [apiBase])
  const domain = hostDomain ?? typedDomain

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

  /** Resolve the domain: the host's live URL first, else the typed one. */
  const resolveDomain = useCallback(async (): Promise<string | null> => {
    let fromHost: string | null = null
    try {
      fromHost = hostnameOf(await host.getLiveSiteUrl())
    } catch {
      fromHost = null
    }
    setHostDomain(fromHost)
    return fromHost ?? typedDomain
  }, [host, typedDomain])

  /** Apply an activation verdict to config + UI. */
  const applyActivation = useCallback(
    (k: string, v: ActivationResult) => {
      if (v.ok) {
        syncConfig({ key: k, tier: v.tier, whiteLabel: v.whiteLabel })
        setMaxSites(v.maxSites)
        setIsDev(v.isDev)
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

  /** Activate `k` against the current domain. */
  const activate = useCallback(
    async (k: string): Promise<void> => {
      const d = await resolveDomain()
      if (!d) {
        setStatus("invalid")
        setMessage("Enter your site's domain (or publish the site), then activate — a license is tied to a domain.")
        return
      }
      const v = await client.activate(k, d)
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
          // Can't verify right now; keep the key but don't unlock until we can.
          syncConfig({ key: k, tier: "trial", whiteLabel: false })
          setStatus("offline")
          setMessage("Couldn't reach the licensing server. Try again in a moment.")
        } else {
          console.warn("[consentful] activation failed:", error)
          syncConfig({ key: k, tier: "trial", whiteLabel: false })
          setStatus("invalid")
          setMessage("Something went wrong activating that key. Please try again.")
        }
      }
    },
    [activate, syncConfig],
  )

  /** Re-activate the current key. A network failure keeps the last status. */
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
        console.warn("[consentful] re-activation failed:", error)
      }
      setStatus(tier !== "trial" ? "offline" : "trial")
      setMessage("Couldn't reach the licensing server — keeping your last verified status.")
    }
  }, [key, tier, activate, syncConfig])

  /** Remove the current key locally (relock the editor). */
  const removeKey = useCallback(async () => {
    syncConfig({ key: null, tier: "trial", whiteLabel: false })
    setStatus("trial")
    setMessage(null)
    setMaxSites(null)
  }, [syncConfig])

  const setDomain = useCallback((d: string) => {
    const h = hostnameOf(d)
    setTypedDomain(h)
    if (h) saveDomain(h)
  }, [])

  /* ---- Resolve the domain on mount (for display) --------------------------- */
  useEffect(() => {
    void resolveDomain()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- autoCheck: re-check a saved key once per key (editor start-up) ------
   * The shell mounts one auto-checking instance so a lapsed or moved license
   * relocks the Pro controls as soon as the editor opens — including hosts
   * whose config (and so the key) loads asynchronously. */
  const checkedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!autoCheck || !key || checkedKey.current === key) return
    // Marked before the await and never "cancelled": under StrictMode's double
    // effect run a cancel-on-cleanup would drop the only request.
    checkedKey.current = key
    void (async () => {
      const d = await resolveDomain()
      if (!d) return
      try {
        applyActivation(key, await client.activate(key, d))
      } catch {
        /* offline — keep the saved status */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, key])

  return {
    tier,
    key,
    status,
    message,
    domain,
    domainFromHost: hostDomain !== null,
    setDomain,
    maxSites,
    isDev,
    enterKey,
    removeKey,
    refresh,
  }
}
