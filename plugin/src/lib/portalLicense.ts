/**
 * Client for the Consentful licensing **portal** — activation from the Framer
 * editor.
 *
 * This replaces the old Lemon Squeezy client. Licensing is now domain-based and
 * portal-authoritative: the user pastes a license key and the plugin ACTIVATES
 * the site's published domain against it (creating/renewing a "site seat").
 * The published site's runtime then unlocks on its own, by fetching a
 * domain-scoped signed token at boot (it never trusts the injected config) — so
 * this client's job is only to register the seat and report the resolved plan
 * back to the editor UI.
 *
 * The `POST /public/site-activate` endpoint takes a PUBLISHABLE (non-secret)
 * `x-api-key`, so calling it straight from the browser plugin is safe — no
 * secret key is ever embedded. Contract pinned in DEPLOY.md §1.
 *
 * Design goals mirror the old client: strictly typed, an injectable `fetch` for
 * tests, and graceful degradation — transient failures throw
 * {@link PortalNetworkError} so the caller can keep the user's last status
 * rather than falsely reporting the key invalid.
 */

import {
  PORTAL_API_BASE,
  PORTAL_PUBLISHABLE_KEY,
  ACTIVATE_PATH,
} from "@framer-cookie-consent/shared"
import type { LicenseTier } from "../types"

/* -------------------------------------------------------------------------- */
/* Result                                                                      */
/* -------------------------------------------------------------------------- */

/** The plan a license resolves to (from the portal's plan catalogue). */
export interface PortalPlan {
  /** Stable plan slug (e.g. `pro`, `agency`). */
  slug: string
  /** Human-readable plan name. */
  name: string
}

/**
 * The normalized outcome of an activation call.
 *
 * `ok: false` is a genuine rejection (unknown/expired/disabled key, or the seat
 * limit reached) — returned as DATA with a `reason`, not thrown. Transient
 * failures throw {@link PortalNetworkError} instead.
 */
export interface ActivationResult {
  /** `true` when the domain is now an active seat on a paid plan. */
  ok: boolean
  /** The entitlement tier the key maps to (`trial` when not `ok`). */
  tier: LicenseTier
  /** Whether white-label (hiding the credit) is entitled. */
  whiteLabel: boolean
  /** The resolved plan, or `null` when not `ok`. */
  plan: PortalPlan | null
  /** A human-readable reason when `ok` is false, else `null`. */
  reason: string | null
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Thrown for TRANSIENT failures where the key's validity is unknown: the network
 * is unreachable, the API rate-limited us (HTTP 429), or it returned a 5xx.
 * Callers should treat this as "couldn't check right now" and keep the last
 * known status rather than revoking access.
 */
export class PortalNetworkError extends Error {
  /** HTTP status code, or `0` for a transport-level failure (offline/timeout). */
  readonly httpStatus: number

  constructor(message: string, httpStatus: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "PortalNetworkError"
    this.httpStatus = httpStatus
  }
}

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

/** Dependencies a {@link PortalClient} can be constructed with (all optional). */
export interface PortalClientDeps {
  /** Injectable `fetch` (defaults to the global). Lets tests mock responses. */
  fetchFn?: typeof fetch
  /** API base override (defaults to {@link PORTAL_API_BASE}). */
  apiBase?: string
  /** Publishable key override (defaults to {@link PORTAL_PUBLISHABLE_KEY}). */
  publishableKey?: string
}

/** A typed client for the Consentful licensing portal. */
export interface PortalClient {
  /**
   * Activate a license key for `domain`, registering the site as a seat.
   * Returns the normalized verdict (see {@link ActivationResult}).
   * @throws {PortalNetworkError} on transient failures (offline / 429 / 5xx).
   */
  activate(licenseKey: string, domain: string): Promise<ActivationResult>
}

/** Coerce an unknown tier string from the API into a valid {@link LicenseTier}. */
function toTier(value: unknown): LicenseTier {
  return value === "lifetime" || value === "pro" || value === "agency" ? value : "trial"
}

/**
 * Create a {@link PortalClient}. In production call with no arguments; tests pass
 * a mock `fetch` and/or base/key overrides.
 *
 * @param deps - Optional injected dependencies (see {@link PortalClientDeps}).
 */
export function createPortalClient(deps: PortalClientDeps = {}): PortalClient {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  const apiBase = (deps.apiBase ?? PORTAL_API_BASE).replace(/\/+$/, "")
  const publishableKey = deps.publishableKey ?? PORTAL_PUBLISHABLE_KEY

  if (typeof fetchFn !== "function") {
    throw new Error("createPortalClient: no fetch implementation available.")
  }

  return {
    async activate(licenseKey, domain) {
      let response: Response
      try {
        response = await fetchFn(apiBase + ACTIVATE_PATH, {
          method: "POST",
          headers: {
            "x-api-key": publishableKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ licenseKey: licenseKey.trim(), domain }),
        })
      } catch (cause) {
        throw new PortalNetworkError("Could not reach the licensing server.", 0, { cause })
      }

      if (response.status === 429) {
        throw new PortalNetworkError("Rate limit reached. Try again shortly.", 429)
      }
      if (response.status >= 500) {
        throw new PortalNetworkError(`Licensing server error (HTTP ${response.status}).`, response.status)
      }

      let body: {
        ok?: boolean
        tier?: unknown
        whiteLabel?: boolean
        plan?: PortalPlan | null
        reason?: string | null
      }
      try {
        body = (await response.json()) as typeof body
      } catch (cause) {
        throw new PortalNetworkError("Licensing server returned an unreadable response.", response.status, { cause })
      }

      const ok = body.ok === true
      return {
        ok,
        tier: ok ? toTier(body.tier) : "trial",
        whiteLabel: ok && body.whiteLabel === true,
        plan: ok && body.plan ? body.plan : null,
        reason: typeof body.reason === "string" ? body.reason : null,
      }
    },
  }
}
