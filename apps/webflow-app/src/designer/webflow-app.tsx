/**
 * The Webflow host adapter.
 *
 * The authoring UI is the shared Consentful shell; what's Webflow-specific is
 * the publish action — resolve the site (from the Designer host, or a manual id
 * outside it), connect via OAuth if needed, then install/remove the loader
 * through the Data Client Worker. Config persists in localStorage (the panel
 * holds no credentials; only the Worker does).
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
  SettingsContext,
  T,
  useSettingsContext,
  type ConfigUpdater,
  type ConsentfulModel,
  type HostServices,
  type ScanResult,
  type SettingsApi,
} from "@framer-cookie-consent/shared-ui"

import { WebflowDataClient } from "./data-client"
import { currentSiteId, inDesigner } from "./webflow-host"

const STORAGE_KEY = "consentful.webflow.config"
const WORKER_BASE = (import.meta.env?.VITE_WORKER_BASE as string | undefined) ?? ""
const client = new WebflowDataClient({ workerBase: WORKER_BASE })

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

/* -------------------------------------------------------------------------- */
/* Publish action — connect + install/remove via the Data Client Worker       */
/* -------------------------------------------------------------------------- */

function WebflowPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()

  const [siteId, setSiteId] = useState("")
  const [siteFromHost, setSiteFromHost] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<null | "install" | "remove">(null)
  const [note, setNote] = useState("")

  const checkConnection = useCallback(async (id: string) => {
    if (!id) {
      setConnected(null)
      return
    }
    try {
      setConnected(await client.isConnected(id))
    } catch {
      setConnected(null)
      setNote("Worker unreachable — check VITE_WORKER_BASE.")
    }
  }, [])

  // Resolve the site from the Designer host when present.
  useEffect(() => {
    let active = true
    void (async () => {
      const hostSite = await currentSiteId()
      if (active && hostSite) {
        setSiteId(hostSite)
        setSiteFromHost(true)
        await checkConnection(hostSite)
      }
    })()
    return () => {
      active = false
    }
  }, [checkConnection])

  const onSiteInput = useCallback(
    (v: string) => {
      setSiteId(v)
      void checkConnection(v.trim())
    },
    [checkConnection],
  )

  const connect = useCallback(() => {
    const id = siteId.trim()
    if (!id) {
      setNote("Enter a site id first.")
      return
    }
    client.connect(id)
    setNote("Complete the Webflow authorization in the popup, then click Re-check.")
  }, [siteId])

  // Force a connection re-check — resolves the host site id if we don't have one
  // yet, then polls the Worker. Lets the user confirm the connection right after
  // authorizing, without waiting for a full panel reload.
  const recheck = useCallback(async () => {
    let id = siteId.trim()
    if (!id) {
      const hostSite = await currentSiteId()
      if (hostSite) {
        setSiteId(hostSite)
        setSiteFromHost(true)
        id = hostSite
      }
    }
    if (!id) {
      setNote("No site id yet — open this inside the Webflow Designer.")
      return
    }
    setNote("Checking connection…")
    await checkConnection(id)
  }, [siteId, checkConnection])

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
      const r = await client.install(siteId.trim(), config)
      return r.changed ? `Published${r.published ? " + site published" : ""}.` : "No change — the banner was already up to date."
    })
  }, [config, siteId, run])

  const remove = useCallback(() => {
    void run("remove", async () => {
      const r = await client.remove(siteId.trim())
      return r.changed ? "Banner removed." : "Nothing to remove."
    })
  }, [siteId, run])

  const canWrite = connected === true && !!siteId.trim() && busy === null

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="cloud_upload" size={18} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            Publish to your Webflow site
          </span>
        </div>
        <ConnectionPill connected={connected} />
      </div>

      {!siteFromHost ? (
        <input
          type="text"
          value={siteId}
          placeholder="Webflow site id"
          onChange={(e) => onSiteInput(e.target.value)}
          style={{ height: T.control, boxSizing: "border-box", padding: `0 ${T.controlPadX}px`, border: `1px solid ${T.border}`, borderRadius: T.rMd, background: T.surface, fontFamily: T.mono, fontSize: 12, color: T.ink, outline: "none" }}
        />
      ) : null}

      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5 }}>
        {inDesigner()
          ? "Author your consent banner and publish it to this Webflow site."
          : "Preview mode — open inside the Webflow Designer, or enter a site id, to publish."}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {connected !== true ? (
          <>
            <Button variant="secondary" icon="link" onClick={connect}>Connect Webflow</Button>
            <Button variant="secondary" icon="refresh" onClick={() => void recheck()}>Re-check</Button>
          </>
        ) : null}
        <Button variant="secondary" disabled={!canWrite} loading={busy === "remove"} onClick={remove}>Remove</Button>
        <Button variant="primary" icon="rocket_launch" disabled={!canWrite} loading={busy === "install"} onClick={install}>
          Publish banner
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
        ? ["Not connected", T.warn, T.warnSoft]
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
    message: "Add your tags by hand below — the Designer panel can't scan the published site.",
  }
}

const webflowHost: HostServices = {
  platformLabel: "Webflow",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanUnsupported,
  getLiveSiteUrl: async () => null,
  getSiteName: async () => null,
  data: localStorageDataStore("consentful.webflow."),
  useCodeDisabled: () => false,
  footerStatus: { ok: "Ready to publish", bad: "Not connected" },
  footerNote: `runtime ${RUNTIME_VERSION} · jsDelivr`,
  publishSubtitle: "Connect your Webflow site, then publish the banner into its custom code from here.",
  showLicenseTab: true,
  PublishAction: WebflowPublishAction,
}

function WebflowSettingsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CookieConsentConfig>(loadConfig)
  const [status, setStatus] = useState<string>("idle")

  // Load-on-mount: reopen on the site's last-published config (kept in the
  // Worker's per-site store) instead of a fresh default. Falls back silently to
  // the local draft when nothing is stored or the Worker is unreachable.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const site = await currentSiteId()
        if (!site) return
        setStatus("loading")
        const remote = await client.loadConfig(site)
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

/** The Webflow Designer app: the shared editor on the Webflow adapter. */
export function WebflowApp() {
  return (
    <WebflowSettingsProvider>
      <HostProvider value={webflowHost}>
        <ConsentfulShell />
      </HostProvider>
    </WebflowSettingsProvider>
  )
}
