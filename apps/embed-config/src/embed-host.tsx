/**
 * The universal-embed host adapter.
 *
 * This is everything that makes the embed page *this* platform rather than
 * Framer: how the config persists (localStorage, since there's no site to write
 * into) and how it ships (a copy-paste `<script>` snippet rather than an
 * auto-synced custom-code block). Everything else — the entire editor shell,
 * every panel, the live preview — is the shared Consentful UI, byte-for-byte
 * the same components Framer renders.
 */

import { useCallback, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  buildEmbedSnippet,
  DEFAULT_CONFIG,
  mergeConfig,
  parse,
  RUNTIME_VERSION,
  serialize,
  type CookieConsentConfig,
  type EmbedForm,
} from "@framer-cookie-consent/shared"
import {
  Button,
  Card,
  ConsentfulShell,
  HostProvider,
  Icon,
  localStorageDataStore,
  SettingsContext,
  Segmented,
  T,
  useSettingsContext,
  type ConfigUpdater,
  type ConsentfulModel,
  type HostServices,
  type ScanResult,
  type SettingsApi,
} from "@framer-cookie-consent/shared-ui"

const STORAGE_KEY = "consentful.embed.config"

/** Load the persisted config, falling back to defaults. Never throws. */
function loadConfig(): CookieConsentConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return parse(raw)
  } catch {
    /* corrupt or unavailable storage — start from defaults */
  }
  return mergeConfig()
}

/** Persist the config to localStorage. Never throws. */
function saveConfig(config: CookieConsentConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(config))
  } catch {
    /* ignore quota / disabled storage */
  }
}

/* -------------------------------------------------------------------------- */
/* Publish action — the "little different" for the universal embed            */
/* -------------------------------------------------------------------------- */

function EmbedPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()
  const [form, setForm] = useState<EmbedForm>("window")
  const [copied, setCopied] = useState(false)

  const snippet = useMemo(() => buildEmbedSnippet(config, { form }), [config, form])

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(snippet)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  }, [snippet])

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="content_paste" size={18} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            Copy your snippet
          </span>
        </div>
        <Segmented
          value={form}
          onChange={setForm}
          options={[
            { value: "window", label: "Script" },
            { value: "attribute", label: "Attribute" },
          ]}
        />
      </div>

      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5 }}>
        Paste this once into your site's <strong>&lt;head&gt;</strong>. Works on Wix, Squarespace, Ghost,
        Carrd, or any hand-coded site — no account needed.
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
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {snippet}
      </pre>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" icon={copied ? "check" : "content_copy"} onClick={copy}>
          {copied ? "Copied" : "Copy snippet"}
        </Button>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Host services                                                              */
/* -------------------------------------------------------------------------- */

/** Scanning a live site needs a host origin; the standalone embed page has none. */
async function scanUnsupported(): Promise<ScanResult> {
  return {
    ok: false,
    reason: "unsupported",
    url: null,
    message:
      "Add your trackers by hand below. The embed builder can't scan a live site — paste each tag's URL or snippet.",
  }
}

const embedHost: HostServices = {
  platformLabel: "Universal embed",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanUnsupported,
  getLiveSiteUrl: async () => null,
  getSiteName: async () => null,
  data: localStorageDataStore(),
  useCodeDisabled: () => false,
  footerStatus: { ok: "Snippet ready", bad: "Snippet unavailable" },
  footerNote: `runtime ${RUNTIME_VERSION} · jsDelivr`,
  publishSubtitle: "Copy the snippet into your site's <head> — re-copy it after any change.",
  showLicenseTab: false,
  PublishAction: EmbedPublishAction,
}

/* -------------------------------------------------------------------------- */
/* Root                                                                       */
/* -------------------------------------------------------------------------- */

/** localStorage-backed settings provider for the standalone embed builder. */
function EmbedSettingsProvider({ children }: { children: ReactNode }) {
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

/** The full embed builder: the shared Consentful editor on the embed adapter. */
export function EmbedApp() {
  return (
    <EmbedSettingsProvider>
      <HostProvider value={embedHost}>
        <ConsentfulShell />
      </HostProvider>
    </EmbedSettingsProvider>
  )
}
