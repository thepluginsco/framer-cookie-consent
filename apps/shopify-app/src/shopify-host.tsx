/**
 * The Shopify host adapter.
 *
 * The authoring UI is the shared Consentful shell; what's Shopify-specific is
 * the publish action — there's no live host to write into, so the merchant
 * copies or downloads the generated `blocks/consentful.liquid` app-embed block
 * and deploys it with the Shopify CLI. Config persists in localStorage (the
 * page is static, ∅-infra).
 */

import { useCallback, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  buildConsentfulBlock,
} from "./extension"
import {
  DEFAULT_CONFIG,
  mergeConfig,
  parse,
  RUNTIME_VERSION,
  serialize,
  SHOPIFY_BLOCK_FILENAME,
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

const STORAGE_KEY = "consentful.shopify.config"
const RUNTIME_URL = import.meta.env?.VITE_RUNTIME_URL as string | undefined

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
/* Publish action — copy / download the app-embed block                       */
/* -------------------------------------------------------------------------- */

function ShopifyPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()
  const [note, setNote] = useState("")

  const liquid = useMemo(
    () => buildConsentfulBlock(config, RUNTIME_URL ? { runtimeUrl: RUNTIME_URL } : {}).liquid,
    [config],
  )

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(liquid)
      .then(() => setNote("Copied. Paste it into your extension's blocks/consentful.liquid."))
      .catch(() => setNote("Couldn't copy automatically — select-all in the block below."))
  }, [liquid])

  const download = useCallback(() => {
    const blob = new Blob([liquid], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "consentful.liquid"
    document.body.append(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setNote(`Downloaded consentful.liquid → put it at ${SHOPIFY_BLOCK_FILENAME}.`)
  }, [liquid])

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="deployed_code" size={18} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            Deploy the app-embed block
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="download" onClick={download}>.liquid</Button>
          <Button variant="primary" icon="content_copy" onClick={copy}>Copy block</Button>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5 }}>
        Put this at <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>{SHOPIFY_BLOCK_FILENAME}</span>, run{" "}
        <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>shopify app deploy</span>, then enable{" "}
        <strong>Consentful</strong> in Theme editor → App embeds.
      </div>

      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          background: T.ink,
          color: "#e8eaf0",
          borderRadius: T.rMd,
          fontFamily: T.mono,
          fontSize: 11,
          lineHeight: 1.5,
          maxHeight: 220,
          overflow: "auto",
          whiteSpace: "pre",
        }}
      >
        {liquid}
      </pre>

      {note ? <div style={{ fontSize: 11.5, color: T.successText, fontWeight: 600 }}>{note}</div> : null}
    </Card>
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
    message: "Add your storefront tags by hand below — the authoring page can't scan a live store.",
  }
}

const shopifyHost: HostServices = {
  platformLabel: "Shopify",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanUnsupported,
  getLiveSiteUrl: async () => null,
  getSiteName: async () => null,
  data: localStorageDataStore("consentful.shopify."),
  useCodeDisabled: () => false,
  footerStatus: { ok: "Block ready", bad: "Block unavailable" },
  footerNote: `runtime ${RUNTIME_VERSION} · Shopify CDN`,
  publishSubtitle: "Copy or download the app-embed block, then deploy it with the Shopify CLI.",
  showLicenseTab: true,
  PublishAction: ShopifyPublishAction,
}

function ShopifySettingsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CookieConsentConfig>(loadConfig)
  const [status, setStatus] = useState<string>("idle")

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

/** The Shopify authoring app: the shared editor on the Shopify adapter. */
export function ShopifyApp() {
  return (
    <ShopifySettingsProvider>
      <HostProvider value={shopifyHost}>
        <ConsentfulShell />
      </HostProvider>
    </ShopifySettingsProvider>
  )
}
