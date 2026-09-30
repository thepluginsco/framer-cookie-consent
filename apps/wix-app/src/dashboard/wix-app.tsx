/**
 * The Wix host adapter.
 *
 * The authoring UI is the shared Consentful shell; what's Wix-specific is the
 * install action — the Worker verifies the signed instance Wix gave this page
 * and installs/removes through it (it mints the Wix token AND owns the per-site
 * config store the published-site bootstrap fetches). The draft persists in
 * localStorage in the panel.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  DEFAULT_CONFIG,
  mergeConfig,
  parse,
  RUNTIME_VERSION,
  serialize,
  type CookieConsentConfig,
} from "@framer-cookie-consent/shared"
import {
  Button,
  Card,
  ConsentfulShell,
  HostProvider,
  Icon,
  localStorageDataStore,
  markPublished,
  markUnpublished,
  SettingsContext,
  T,
  useSettingsContext,
  type ConfigUpdater,
  type ConsentfulModel,
  type HostPublisher,
  type HostServices,
  type ScanResult,
  type SettingsApi,
} from "@framer-cookie-consent/shared-ui"

import { WixDataClient } from "./data-client"
import { inWixHost, signedInstance } from "./wix-host"

const STORAGE_KEY = "consentful.wix.config"
// Empty = same origin: the Worker serves this dashboard page. Set for local dev.
const WORKER_BASE = (import.meta.env?.VITE_WORKER_BASE as string | undefined) ?? ""
const client = new WixDataClient({ workerBase: WORKER_BASE })

const NOT_IN_WIX = "Open Consentful from your Wix dashboard to publish."

function loadConfig(): CookieConsentConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return parse(raw)
  } catch {
    /* start from defaults */
  }
  return mergeConfig()
}

function saveConfig(config: CookieConsentConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(config))
  } catch {
    /* ignore */
  }
}

/** The verified session (site key), resolved once per page load; null outside Wix / invalid. */
interface Session {
  instance: string
  siteKey: string
  siteUrl?: string
  siteName?: string
}
let sessionPromise: Promise<Session | null> | null = null
function session(): Promise<Session | null> {
  const instance = signedInstance()
  if (!instance) return Promise.resolve(null)
  sessionPromise ??= client
    .session(instance)
    .then((s): Session | null =>
      s.connected && s.siteKey
        ? {
            instance,
            siteKey: s.siteKey,
            ...(s.siteUrl ? { siteUrl: s.siteUrl } : {}),
            ...(s.siteName ? { siteName: s.siteName } : {}),
          }
        : null,
    )
    .catch(() => {
      sessionPromise = null
      return null
    })
  return sessionPromise
}

/* -------------------------------------------------------------------------- */
/* Publisher — one-click publish + "what's live" for the header               */
/* -------------------------------------------------------------------------- */

const wixPublisher: HostPublisher = {
  async publish(config) {
    const s = await session()
    if (!s) return { ok: false, needsSetup: true, message: NOT_IN_WIX }
    try {
      await client.install(s.instance, config)
      return { ok: true, message: "Published ✓ Your banner is live." }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  async loadPublished() {
    const s = await session()
    if (!s) throw new Error("No site")
    return { config: await client.loadConfig(s.siteKey) }
  },
}

/* -------------------------------------------------------------------------- */
/* Install action — install/remove via the Data Client Worker                 */
/* -------------------------------------------------------------------------- */

function WixPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()

  const [connected, setConnected] = useState<boolean | null>(inWixHost() ? null : false)
  const [busy, setBusy] = useState<null | "install" | "remove">(null)
  const [note, setNote] = useState(inWixHost() ? "" : NOT_IN_WIX)

  useEffect(() => {
    if (!inWixHost()) return
    let active = true
    void session().then((s) => {
      if (!active) return
      setConnected(s !== null)
      if (!s) setNote("Couldn't verify this Wix site. Reopen Consentful from your Wix dashboard.")
    })
    return () => {
      active = false
    }
  }, [])

  const run = useCallback(async (kind: "install" | "remove", action: () => Promise<string>) => {
    setBusy(kind)
    try {
      setNote(await action())
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [])

  const install = useCallback(() => {
    void run("install", async () => {
      const s = await session()
      if (!s) return NOT_IN_WIX
      const r = await client.install(s.instance, config)
      markPublished(config)
      return r.changed ? "Banner installed. Publish your Wix site to see it live." : "Published — your banner is up to date."
    })
  }, [config, run])

  const remove = useCallback(() => {
    void run("remove", async () => {
      const s = await session()
      if (!s) return NOT_IN_WIX
      const r = await client.remove(s.instance)
      markUnpublished()
      return r.changed ? "Banner removed." : "Nothing to remove."
    })
  }, [run])

  const canWrite = connected === true && busy === null

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="cloud_upload" size={18} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            Install on your Wix site
          </span>
        </div>
        <ConnectionPill connected={connected} />
      </div>

      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5 }}>
        {inWixHost()
          ? "Install your consent banner on this Wix site. Turn off Wix's built-in cookie banner first — only one consent app per site."
          : "Preview mode — open Consentful from your Wix dashboard to install."}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={!canWrite} loading={busy === "remove"} onClick={remove}>Remove</Button>
        <Button variant="primary" icon="rocket_launch" disabled={!canWrite} loading={busy === "install"} onClick={install}>
          Install banner
        </Button>
      </div>

      {note ? <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.5 }}>{note}</div> : null}
    </Card>
  )
}

function ConnectionPill({ connected }: { connected: boolean | null }) {
  const [label, color, bg] =
    connected === true
      ? ["Connected", T.successText, T.successSoft]
      : connected === false
        ? ["Not in Wix", T.warn, T.warnSoft]
        : ["Checking…", T.ink3, T.sunken]
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".02em", padding: "4px 10px", borderRadius: T.rPill, color, background: bg }}>
      {label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Host services + root                                                       */
/* -------------------------------------------------------------------------- */

async function scanUnsupported(): Promise<ScanResult> {
  return {
    ok: false,
    reason: "unsupported",
    url: null,
    message: "Add your tags by hand below — the dashboard can't scan the published Wix site.",
  }
}

const wixHost: HostServices = {
  platformLabel: "Wix",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanUnsupported,
  getLiveSiteUrl: async () => (await session())?.siteUrl ?? null,
  getSiteName: async () => (await session())?.siteName ?? null,
  data: localStorageDataStore("consentful.wix."),
  useCodeDisabled: () => false,
  footerStatus: { ok: "Ready to install", bad: "Open in Wix" },
  footerNote: `runtime ${RUNTIME_VERSION} · Wix`,
  publishSubtitle: "Install the banner on this Wix site from here, then publish your site.",
  showLicenseTab: true,
  PublishAction: WixPublishAction,
  publisher: wixPublisher,
}

function WixSettingsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CookieConsentConfig>(loadConfig)
  const [status, setStatus] = useState<string>("idle")

  // Load-on-mount: open the dashboard on the config that's actually live for
  // this site (kept in the Worker's per-site store), not a fresh default. Falls
  // back silently to the local draft for a brand-new site or an offline Worker.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const s = await session()
        if (!s) return
        setStatus("loading")
        const remote = await client.loadConfig(s.siteKey)
        if (active && remote) {
          // The stored copy is public (license stripped) — keep this browser's
          // activated license rather than wiping it on every load.
          setConfig((prev) => {
            const next = remote.license.key ? remote : { ...remote, license: prev.license }
            saveConfig(next)
            return next
          })
        }
      } catch {
        /* keep the local draft */
      } finally {
        if (active) setStatus("idle")
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const update = useCallback((updater: ConfigUpdater) => {
    setConfig((prev) => {
      const next = updater(prev)
      saveConfig(next)
      return next
    })
    setStatus("saving")
    window.setTimeout(() => setStatus("idle"), 300)
  }, [])

  const reset = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
    saveConfig(DEFAULT_CONFIG)
  }, [])

  const api = useMemo<SettingsApi>(() => ({ config, status, error: null, update, reset }), [config, status, update, reset])
  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}

/** The Wix dashboard app: the shared editor on the Wix adapter. */
export function WixApp() {
  return (
    <WixSettingsProvider>
      <HostProvider value={wixHost}>
        <ConsentfulShell />
      </HostProvider>
    </WixSettingsProvider>
  )
}
