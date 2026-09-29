/**
 * Dashboard ("portal") mode of the embed builder.
 *
 * When the Consentful dashboard serves this builder same-origin at
 * `/builder/index.html?site=<id>`, the owner is already signed in, so there is
 * no key to paste: the site's config loads from — and publishes to — the
 * portal REST API with the session cookie, the plan comes from the account, and
 * the live site picks up changes through its one-line snippet
 * (`/embed/<id>.js`) without re-pasting anything.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  mergeConfig,
  RUNTIME_VERSION,
  toPublishedConfig,
  type CookieConsentConfig,
  type LicenseTier,
} from "@framer-cookie-consent/shared"
import {
  Card,
  ConsentfulShell,
  HostProvider,
  Icon,
  localStorageDataStore,
  SettingsContext,
  T,
  type ConfigUpdater,
  type ConsentfulModel,
  type HostPublisher,
  type HostServices,
  type ScanResult,
  type SettingsApi,
} from "@framer-cookie-consent/shared-ui"

/** The site this builder edits (`?site=cs_…`). */
export function portalSiteId(): string | null {
  const id = new URLSearchParams(window.location.search).get("site")
  return id && /^cs_[a-z0-9]{8,40}$/.test(id) ? id : null
}

type SiteInfo = { id: string; name: string; domain: string }
type SiteResponse = {
  site: SiteInfo
  config: Record<string, unknown> | null
  tier: LicenseTier
  whiteLabel: boolean
}

/** Same-origin call to the portal REST API (session cookie). Redirects to login on 401. */
async function portalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/rest${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
    throw new Error("Please sign in again.")
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      /* non-JSON error */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

function fromStored(stored: Record<string, unknown> | null): CookieConsentConfig {
  return stored ? mergeConfig(stored as never) : mergeConfig()
}

function makePublisher(siteId: string): HostPublisher {
  return {
    async publish(config) {
      try {
        await portalFetch(`/embed-sites/${siteId}/config`, {
          method: "PUT",
          body: JSON.stringify({ config: toPublishedConfig(config), runtimeVersion: RUNTIME_VERSION }),
        })
        return { ok: true, message: "Published ✓ Live on your site within a minute." }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    },
    async loadPublished() {
      const r = await portalFetch<SiteResponse>(`/embed-sites/${siteId}`)
      return { config: r.config ? fromStored(r.config) : null }
    },
  }
}

function snippetFor(siteId: string): string {
  return `<script src="${window.location.origin}/embed/${siteId}.js" defer></script>`
}

function PortalPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const siteId = portalSiteId() ?? ""
  const snippet = snippetFor(siteId)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(snippet)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  }
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="code" size={18} color={T.accent} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>Your snippet</span>
      </div>
      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5 }}>
        Paste this once into your site&apos;s <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>&lt;head&gt;</span>.
        After that, just click <strong>Publish</strong> (top right) — changes go live without touching your site again.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            padding: "10px 12px",
            background: T.ink,
            color: "#e8eaf0",
            borderRadius: T.rMd,
            fontFamily: T.mono,
            fontSize: 11,
          }}
        >
          {snippet}
        </code>
        <button
          type="button"
          onClick={copy}
          style={{
            height: T.control,
            padding: "0 14px",
            borderRadius: T.rMd,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: copied ? T.successText : T.ink,
            fontWeight: 700,
            fontSize: 12.5,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <a href="/websites" style={{ fontSize: 11.5, color: T.accentText, fontWeight: 700, textDecoration: "none" }}>
        ← Back to your websites
      </a>
    </Card>
  )
}

async function scanUnsupported(): Promise<ScanResult> {
  return {
    ok: false,
    reason: "unsupported",
    url: null,
    message: "Add your trackers by hand below — paste each tag's URL or snippet.",
  }
}

/** Loads the site from the portal, keeps edits local until Publish. */
function PortalSettingsProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const [config, setConfig] = useState<CookieConsentConfig>(() => mergeConfig())
  const [status, setStatus] = useState<string>("loading")
  const [error, setError] = useState<string | null>(null)
  const [site, setSite] = useState<SiteInfo | null>(null)

  useEffect(() => {
    let active = true
    portalFetch<SiteResponse>(`/embed-sites/${siteId}`)
      .then((r) => {
        if (!active) return
        const base = fromStored(r.config)
        // The plan comes from the signed-in account (editor hint only — the
        // live runtime re-verifies the domain's license on its own).
        setConfig({ ...base, license: { ...base.license, key: null, tier: r.tier, whiteLabel: r.whiteLabel } })
        setSite(r.site)
        setStatus("idle")
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      })
    return () => {
      active = false
    }
  }, [siteId])

  const update = useCallback((updater: ConfigUpdater) => {
    setConfig((prev) => updater(prev))
  }, [])
  const reset = useCallback(() => setConfig((prev) => ({ ...mergeConfig(), license: prev.license })), [])
  const api = useMemo<SettingsApi>(() => ({ config, status, error, update, reset }), [config, status, error, update, reset])

  const host = useMemo<HostServices>(
    () => ({
      platformLabel: "Website",
      runtimeVersion: RUNTIME_VERSION,
      scanSite: scanUnsupported,
      getLiveSiteUrl: async () => (site ? `https://${site.domain}` : null),
      getSiteName: async () => site?.name ?? null,
      data: localStorageDataStore(`consentful.site.${siteId}.`),
      useCodeDisabled: () => false,
      footerStatus: { ok: "Connected to your dashboard", bad: "Not connected" },
      footerNote: `runtime ${RUNTIME_VERSION} · jsDelivr`,
      publishSubtitle: "Paste the snippet once — then every Publish goes live automatically.",
      // Signed in through the dashboard: no key to paste, no License tab.
      showLicenseTab: false,
      PublishAction: PortalPublishAction,
      publisher: makePublisher(siteId),
    }),
    [site, siteId],
  )

  if (status === "error" && !site) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.ground, fontFamily: T.sans }}>
        <Card style={{ maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Couldn&apos;t open this website</div>
          <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.5, marginBottom: 12 }}>{error}</div>
          <a href="/websites" style={{ fontSize: 12.5, color: T.accentText, fontWeight: 700 }}>← Back to your websites</a>
        </Card>
      </div>
    )
  }

  return (
    <SettingsContext.Provider value={api}>
      <HostProvider value={host}>{children}</HostProvider>
    </SettingsContext.Provider>
  )
}

/** The builder, bound to one dashboard website. */
export function PortalApp({ siteId }: { siteId: string }) {
  return (
    <PortalSettingsProvider siteId={siteId}>
      <ConsentfulShell />
    </PortalSettingsProvider>
  )
}

