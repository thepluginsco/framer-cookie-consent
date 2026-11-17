/**
 * Client for the portal's in-plugin account API (plan §4, §15 N4/N5) and the
 * analytics intake (§9, N3). Same origin as licensing
 * ({@link PORTAL_API_BASE}); the web app rewrites `/v1/account/*` to the API
 * and proxies `/v1/events` (so the visitor country reaches it).
 *
 * The credential is the ACCOUNT licence key, kept per browser (localStorage),
 * not in the site config: the editor gets a free "guest" key on first use,
 * signs in with a 6-digit email code, checks out with Dodo, and the paid key
 * then activates the site's live domain through the normal licensing path.
 *
 * No user content is ever sent: events carry only names + small scalar props.
 */

import { PORTAL_API_BASE } from "@framer-cookie-consent/shared"

/** What `/v1/account/status` (and sign-in / guest) returns. */
export interface AccountStatus {
  licenseKey: string
  account: { email: string; name: string | null } | null
  isGuest: boolean
  plan: { slug: string; name: string; type: string; paid: boolean }
  licenseStatus: string
  maxSites: number | null
  renewsAt: string | null
  cancelAtPeriodEnd: boolean
}

export interface AccountPlan {
  slug: string
  name: string
  type: string
  interval: string | null
  priceInCents: number
  currency: string
  highlighted: boolean
  badge: string | null
}

export interface AccountOffer {
  active: boolean
  planSlug: string
  label: string
  priceInCents: number
  seatsTotal: number
  seatsLeft: number
  endsAt: string
}

export interface PlansResponse {
  offer: AccountOffer | null
  regularLifetimeInCents: number | null
  plans: AccountPlan[]
}

/** A rejected call: `code` from the API (e.g. INVALID_CODE, TOO_SOON), or NETWORK. */
export class AccountApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 0,
  ) {
    super(message)
    this.name = "AccountApiError"
  }
}

const INSTALL_KEY = "consentful:install-id"
const ACCOUNT_KEY = "consentful:account-key"

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Anonymous id of this editor install (per browser), created on first use. */
export function getInstallId(): string {
  const s = store()
  const existing = s?.getItem(INSTALL_KEY)
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const id = "cf_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  try {
    s?.setItem(INSTALL_KEY, id)
  } catch {
    /* storage unavailable: a fresh id per session is fine */
  }
  return id
}

export function readAccountKey(): string | null {
  return store()?.getItem(ACCOUNT_KEY) ?? null
}

export function saveAccountKey(key: string | null): void {
  try {
    if (key) store()?.setItem(ACCOUNT_KEY, key)
    else store()?.removeItem(ACCOUNT_KEY)
  } catch {
    /* ignore */
  }
}

export interface AccountClientDeps {
  fetchFn?: typeof fetch
  apiBase?: string
}

export function createAccountClient(deps: AccountClientDeps = {}) {
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
  const base = (deps.apiBase ?? PORTAL_API_BASE).replace(/\/+$/, "")

  async function call<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      res = await fetchFn(base + "/v1/account" + path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new AccountApiError("NETWORK", "Couldn't reach Consentful. Check your connection and try again.")
    }
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new AccountApiError(err?.code ?? "HTTP_" + res.status, err?.message ?? "Something went wrong. Try again.", res.status)
    }
    return json as T
  }

  return {
    guest: (platform: string) => call<AccountStatus & { created: boolean }>("/guest", { installId: getInstallId(), platform }),
    status: (licenseKey: string) => call<AccountStatus>("/status", { licenseKey }),
    plans: () => call<PlansResponse>("/plans"),
    startEmail: (licenseKey: string, email: string) => call<{ sent: boolean; email: string }>("/email/start", { licenseKey, email }),
    verifyEmail: (licenseKey: string, email: string, code: string) =>
      call<AccountStatus>("/email/verify", { licenseKey, email, code }),
    checkout: (licenseKey: string, planSlug: string) =>
      call<{ checkoutUrl: string }>("/checkout", { licenseKey, planSlug, installId: getInstallId() }),
    portal: (licenseKey: string, path?: string) => call<{ url: string }>("/portal", { licenseKey, ...(path ? { path } : {}) }),

    /** Fire-and-forget batch to /v1/events (never throws). */
    async sendEvents(payload: {
      licenseKey?: string | null
      platform: string
      version: string
      events: { event: string; props?: Record<string, string | number | boolean | null>; ts: string }[]
    }): Promise<void> {
      if (!payload.events.length) return
      try {
        await fetchFn(base + "/v1/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            installId: getInstallId(),
            ...(payload.licenseKey ? { licenseKey: payload.licenseKey } : {}),
            platform: payload.platform,
            store: payload.platform,
            version: payload.version,
            language: typeof navigator !== "undefined" ? navigator.language : undefined,
            events: payload.events,
          }),
        })
      } catch {
        /* analytics must never break the editor */
      }
    },
  }
}

export type AccountClient = ReturnType<typeof createAccountClient>

/** "$12" / "$99.50" from cents. */
export function formatPrice(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
  }
}
