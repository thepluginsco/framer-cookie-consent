/**
 * In-plugin account state (plan §15 N4/N5/N7) for hosts that open without a
 * key (Framer: `host.inPluginAccount`).
 *
 * - Free runs on preview/staging addresses with no key. A live custom domain
 *   needs a paid plan, so the "Go live" prompt shows wherever that matters.
 * - Upgrading happens inside the plugin: email code → Dodo checkout tab →
 *   "waiting for payment" (polls 3 s, up to 10 min) → the paid key is
 *   activated on this site's domain automatically. No key to copy.
 * - Existing customers sign in the same way and their key is applied.
 * - Pasting a key and "Remove" in the License tab keep working as before.
 *
 * The account key (a guest key until sign-in) lives in localStorage, created
 * lazily the first time it's needed (upgrade or sign-in), so opening the
 * plugin never creates an account.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { PORTAL_DASHBOARD_URL, isPreviewHost } from "@framer-cookie-consent/shared"

import { useHost } from "../host"
import type { LicenseApi } from "../license/use-license"
import { hostnameOf } from "../license/use-license"
import {
  AccountApiError,
  createAccountClient,
  readAccountKey,
  saveAccountKey,
  type AccountClient,
  type AccountStatus,
} from "./account-client"

type Props = Record<string, string | number | boolean | null>

export type UpgradeStage = "plans" | "email" | "code" | "waiting" | "done"

export interface AccountApi {
  client: AccountClient
  status: AccountStatus | null
  /** Signed in with a real email (not a guest). */
  signedIn: boolean
  /** The site's live custom domain when it needs a paid plan, else null. */
  liveDomain: string | null
  /** This site is activated on a paid plan. */
  sitePaid: boolean
  track: (event: string, props?: Props) => void
  /** Open the upgrade sheet (`from` = where the prompt was shown). */
  openUpgrade: (from: string, stage?: "plans" | "email") => void
  closeUpgrade: () => void
  upgrade: { open: boolean; from: string; stage: UpgradeStage }
  setStage: (stage: UpgradeStage) => void
  /** Account key, creating a guest one if needed. */
  ensureKey: () => Promise<string>
  startEmail: (email: string) => Promise<void>
  verifyEmail: (email: string, code: string) => Promise<AccountStatus>
  /** Start a Dodo checkout in a new tab and begin polling for the payment. */
  checkout: (planSlug: string) => Promise<void>
  /** Stop waiting for a payment (user closed the sheet). */
  stopPolling: () => void
  refresh: () => Promise<AccountStatus | null>
  openPortal: (path?: string) => Promise<void>
  signOut: () => void
  /** Call after a success moment (banner installed/updated): first_value + paywall-after-success. */
  afterSuccess: (what: string) => void
}

const AccountContext = createContext<AccountApi | null>(null)

/** The account API, or `null` on hosts without in-plugin accounts. */
export function useAccount(): AccountApi | null {
  return useContext(AccountContext)
}

const POLL_MS = 3000
const POLL_MAX_MS = 10 * 60_000
const FIRST_OPEN_KEY = "consentful:first-open"
const FIRST_VALUE_KEY = "consentful:first-value"
const LIMIT_SEEN_KEY = "consentful:limit-seen"
const AFTER_SUCCESS_KEY = "consentful:paywall-after-success"

function lsGet(k: string): string | null {
  try {
    return window.localStorage.getItem(k)
  } catch {
    return null
  }
}
function lsSet(k: string, v: string): void {
  try {
    window.localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}
const today = () => new Date().toISOString().slice(0, 10)

export function AccountProvider({ lic, children, platform = "framer" }: { lic: LicenseApi | null; children: ReactNode; platform?: string }) {
  const host = useHost()
  const client = useMemo(() => createAccountClient(), [])
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [upgrade, setUpgrade] = useState<{ open: boolean; from: string; stage: UpgradeStage }>({ open: false, from: "", stage: "plans" })
  const [liveHost, setLiveHost] = useState<string | null>(null)
  const keyRef = useRef<string | null>(readAccountKey())

  /* ---- events (batched, fire-and-forget) --------------------------------- */
  const queue = useRef<{ event: string; props?: Props; ts: string }[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const events = queue.current.splice(0, 20)
    if (!events.length) return
    void client.sendEvents({ licenseKey: keyRef.current, platform, version: host.runtimeVersion, events })
    if (queue.current.length) timer.current = setTimeout(flush, 500)
  }, [client, host.runtimeVersion, platform])
  const track = useCallback(
    (event: string, props?: Props) => {
      queue.current.push({ event, ...(props ? { props } : {}), ts: new Date().toISOString() })
      if (queue.current.length >= 20) flush()
      else if (!timer.current) timer.current = setTimeout(flush, 3000)
    },
    [flush],
  )
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener("pagehide", onHide)
    return () => {
      window.removeEventListener("pagehide", onHide)
      flush()
    }
  }, [flush])

  /* ---- open: first_open / plugin_open + restore a saved account ---------- */
  useEffect(() => {
    if (!lsGet(FIRST_OPEN_KEY)) {
      lsSet(FIRST_OPEN_KEY, new Date().toISOString())
      track("first_open")
    }
    track("plugin_open")
    const k = keyRef.current
    if (k) {
      client
        .status(k)
        .then((s) => {
          keyRef.current = s.licenseKey
          saveAccountKey(s.licenseKey)
          setStatus(s)
        })
        .catch((e: unknown) => {
          // A key the server no longer knows: forget it (a new guest is made on demand).
          if (e instanceof AccountApiError && e.httpStatus === 401) {
            keyRef.current = null
            saveAccountKey(null)
          }
        })
    }
    host
      .getLiveSiteUrl()
      .then((u) => setLiveHost(hostnameOf(u)))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sitePaid = !!lic && lic.status === "active" && lic.tier !== "trial"
  const liveDomain = liveHost && !isPreviewHost(liveHost) && !sitePaid ? liveHost : null

  // N7: a live domain on Free shows no banner. Count it once a day per domain.
  useEffect(() => {
    if (!liveDomain) return
    const mark = `${today()}:${liveDomain}`
    if (lsGet(LIMIT_SEEN_KEY) === mark) return
    lsSet(LIMIT_SEEN_KEY, mark)
    track("limit_reached", { reason: "live_domain" })
  }, [liveDomain, track])

  /* ---- auto-activate a paid account key on this site -------------------- */
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (!lic || !status?.plan.paid) return
    // Never replace a paid key someone pasted for this site; only fill an
    // empty / Free slot with the account's paid key.
    if (lic.status === "validating" || sitePaid) return
    if (applied.current === status.licenseKey) return
    applied.current = status.licenseKey
    void lic.enterKey(status.licenseKey).then(() => track("key_activated", { how: "auto", plan: status.plan.slug }))
  }, [lic, status, sitePaid, track])

  /* ---- account actions ---------------------------------------------------- */
  const adopt = useCallback((s: AccountStatus) => {
    keyRef.current = s.licenseKey
    saveAccountKey(s.licenseKey)
    setStatus(s)
    return s
  }, [])

  const ensureKey = useCallback(async () => {
    if (keyRef.current) return keyRef.current
    const s = await client.guest(platform)
    return adopt(s).licenseKey
  }, [client, platform, adopt])

  const refresh = useCallback(async () => {
    const k = keyRef.current
    if (!k) return null
    try {
      return adopt(await client.status(k))
    } catch {
      return null
    }
  }, [client, adopt])

  const startEmail = useCallback(
    async (email: string) => {
      const k = await ensureKey()
      track("signin_started", { method: "email_code", from: upgrade.from || "license" })
      await client.startEmail(k, email)
    },
    [client, ensureKey, track, upgrade.from],
  )

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const k = await ensureKey()
      return adopt(await client.verifyEmail(k, email, code))
    },
    [client, ensureKey, adopt],
  )

  /* ---- checkout + polling --------------------------------------------------- */
  const poll = useRef<{ timer: ReturnType<typeof setInterval> | null; until: number }>({ timer: null, until: 0 })
  const stopPolling = useCallback(() => {
    if (poll.current.timer) clearInterval(poll.current.timer)
    poll.current.timer = null
  }, [])
  const checkOnce = useCallback(async () => {
    const s = await refresh()
    if (s?.plan.paid) {
      stopPolling()
      setUpgrade((u) => ({ ...u, stage: "done" }))
    } else if (Date.now() > poll.current.until) {
      stopPolling()
    }
  }, [refresh, stopPolling])
  useEffect(() => {
    const onFocus = () => {
      if (poll.current.timer) void checkOnce()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      stopPolling()
    }
  }, [checkOnce, stopPolling])

  const checkout = useCallback(
    async (planSlug: string) => {
      const k = await ensureKey()
      track("paywall_clicked", { plan: planSlug, from: upgrade.from || "unknown" })
      // Open the tab synchronously-ish so popup blockers allow it, then point it at Dodo.
      const tab = window.open("about:blank", "_blank")
      try {
        const { checkoutUrl } = await client.checkout(k, planSlug)
        if (tab) tab.location.href = checkoutUrl
        else window.open(checkoutUrl, "_blank", "noopener,noreferrer")
      } catch (e) {
        tab?.close()
        throw e
      }
      setUpgrade((u) => ({ ...u, stage: "waiting" }))
      stopPolling()
      poll.current.until = Date.now() + POLL_MAX_MS
      poll.current.timer = setInterval(() => void checkOnce(), POLL_MS)
    },
    [client, ensureKey, track, upgrade.from, stopPolling, checkOnce],
  )

  const openPortal = useCallback(
    async (path?: string) => {
      const k = keyRef.current
      const fallback = () => window.open(`${PORTAL_DASHBOARD_URL}${path ?? "/dashboard"}`, "_blank", "noopener,noreferrer")
      if (!k || !status || status.isGuest) {
        fallback()
        return
      }
      const tab = window.open("about:blank", "_blank")
      try {
        const { url } = await client.portal(k, path)
        if (tab) tab.location.href = url
        else window.open(url, "_blank", "noopener,noreferrer")
      } catch {
        tab?.close()
      }
    },
    [client, status],
  )

  const signOut = useCallback(() => {
    keyRef.current = null
    saveAccountKey(null)
    setStatus(null)
    applied.current = null
  }, [])

  const openUpgrade = useCallback(
    (from: string, stage: "plans" | "email" = "plans") => {
      setUpgrade({ open: true, from, stage })
      track("paywall_shown", { from, live_domain: liveDomain ? true : false })
    },
    [track, liveDomain],
  )
  const closeUpgrade = useCallback(() => {
    stopPolling()
    setUpgrade((u) => ({ ...u, open: false }))
  }, [stopPolling])
  const setStage = useCallback((stage: UpgradeStage) => setUpgrade((u) => ({ ...u, stage })), [])

  const afterSuccess = useCallback(
    (what: string) => {
      if (!lsGet(FIRST_VALUE_KEY)) {
        lsSet(FIRST_VALUE_KEY, new Date().toISOString())
        track("first_value", { action: what })
      }
      // G6: the paywall right after a success, never after an error. Only when
      // the live domain actually needs a plan, at most once a day.
      if (liveDomain && lsGet(AFTER_SUCCESS_KEY) !== today()) {
        lsSet(AFTER_SUCCESS_KEY, today())
        openUpgrade("after_" + what)
      }
    },
    [track, liveDomain, openUpgrade],
  )

  const api: AccountApi = {
    client,
    status,
    signedIn: !!status && !status.isGuest,
    liveDomain,
    sitePaid,
    track,
    openUpgrade,
    closeUpgrade,
    upgrade,
    setStage,
    ensureKey,
    startEmail,
    verifyEmail,
    checkout,
    stopPolling,
    refresh,
    openPortal,
    signOut,
    afterSuccess,
  }
  return <AccountContext.Provider value={api}>{children}</AccountContext.Provider>
}
