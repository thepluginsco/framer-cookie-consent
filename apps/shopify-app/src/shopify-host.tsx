/**
 * The Shopify host adapter.
 *
 * The authoring UI is the shared Consentful shell, embedded in Shopify admin
 * via App Bridge. Publishing writes the loader to the app's `consentful.loader`
 * app-data metafield through the Admin API (direct API access — no backend);
 * the theme app embed prints it, so edits go live without redeploying the
 * extension. The draft persists in localStorage; the published config is read
 * back from the `consentful.config` metafield on open.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  DEFAULT_CONFIG,
  mergeConfig,
  parse,
  RUNTIME_VERSION,
  serialize,
  SHOPIFY_BLOCK_HANDLE,
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

import { inShopifyAdmin, ShopifyAdminClient, type ShopContext } from "./shopify-admin"

const STORAGE_KEY = "consentful.shopify.config"
const RUNTIME_URL = import.meta.env?.VITE_RUNTIME_URL as string | undefined
const client = new ShopifyAdminClient(RUNTIME_URL ? { runtimeUrl: RUNTIME_URL } : {})
/** The app's client id (App Bridge's `shopify-api-key` meta tag). */
const API_KEY = import.meta.env?.SHOPIFY_API_KEY as string | undefined

const NOT_EMBEDDED = "Open Consentful from your Shopify admin (Apps → Consentful) to publish."

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

/** The store context, resolved once per page load (null outside Shopify admin). */
let shopPromise: Promise<ShopContext | null> | null = null
function shopContext(): Promise<ShopContext | null> {
  if (!inShopifyAdmin()) return Promise.resolve(null)
  shopPromise ??= client.shopContext().catch(() => {
    shopPromise = null
    return null
  })
  return shopPromise
}

/* -------------------------------------------------------------------------- */
/* Publisher — one-click publish + "what's live" for the header               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* App-embed status — is the theme actually printing our loader?              */
/* -------------------------------------------------------------------------- */

/** On / off / unknown (null: no `read_themes` grant yet, or not embedded). */
type EmbedStatus = boolean | null

// App Bridge resolves `shopify://admin/…` links to the current store's admin;
// `activateAppId=<api key>/<block handle>` opens the editor with our embed
// already switched on, so the merchant only has to click Save.
const EMBED_EDITOR_URL = `shopify://admin/themes/current/editor?context=apps${API_KEY ? `&activateAppId=${API_KEY}/${SHOPIFY_BLOCK_HANDLE}` : ""}`

const EMBED_OFF_AFTER_PUBLISH =
  "Published — but the Consentful app embed is off in your theme, so the banner isn't showing yet."
/** Short form for the header pill (max ~220px). */
const EMBED_OFF_SHORT = "Published · app embed off"

function embedStatus(): Promise<EmbedStatus> {
  return inShopifyAdmin() ? client.embedStatus() : Promise.resolve(null)
}

/**
 * The live embed status, re-checked whenever the app regains focus — i.e. when
 * the merchant comes back from the theme editor after switching the embed on.
 */
function useEmbedStatus(): [EmbedStatus | "checking", () => void] {
  const [status, setStatus] = useState<EmbedStatus | "checking">("checking")
  const refresh = useCallback(() => {
    void embedStatus().then(setStatus)
  }, [])
  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])
  return [status, refresh]
}

const shopifyPublisher: HostPublisher = {
  async publish(config) {
    if (!inShopifyAdmin()) return { ok: false, needsSetup: true, message: NOT_EMBEDDED }
    try {
      await client.publish(config)
      const embedOn = await embedStatus()
      // Embed off: keep an amber warning up and send the merchant to the Publish
      // tab, where the persistent "Turn on app embed" call-to-action lives.
      return embedOn === false
        ? { ok: true, warning: true, needsSetup: true, message: EMBED_OFF_SHORT }
        : { ok: true, message: "Published ✓ Your banner is live." }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  async loadPublished() {
    if (!inShopifyAdmin()) throw new Error("Not in Shopify admin")
    return { config: await client.loadConfig() }
  },
  useLiveBlocker() {
    const [status] = useEmbedStatus()
    return status === false ? "App embed off" : null
  },
}

/* -------------------------------------------------------------------------- */
/* Publish action — publish / remove via app-data metafields                  */
/* -------------------------------------------------------------------------- */

function ShopifyPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()
  const embedded = inShopifyAdmin()
  const [shop, setShop] = useState<ShopContext | null>(null)
  const [busy, setBusy] = useState<null | "publish" | "remove">(null)
  const [note, setNote] = useState(embedded ? "" : NOT_EMBEDDED)
  const [embedOn, refreshEmbed] = useEmbedStatus()

  useEffect(() => {
    let active = true
    void shopContext().then((s) => {
      if (active) setShop(s)
    })
    return () => {
      active = false
    }
  }, [])

  const run = useCallback(async (kind: "publish" | "remove", action: () => Promise<string>) => {
    setBusy(kind)
    try {
      setNote(await action())
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [])

  const publish = useCallback(() => {
    void run("publish", async () => {
      await client.publish(config)
      markPublished(config)
      const on = await embedStatus()
      refreshEmbed()
      return on === false
        ? EMBED_OFF_AFTER_PUBLISH
        : on
          ? "Published ✓ Your banner is live on your storefront."
          : "Published. Make sure the Consentful app embed is on in your theme."
    })
  }, [config, run, refreshEmbed])

  const remove = useCallback(() => {
    void run("remove", async () => {
      await client.remove()
      markUnpublished()
      return "Banner removed from your storefront."
    })
  }, [run])

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="storefront" size={18} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            Publish to your Shopify store
          </span>
        </div>
        {embedded ? <EmbedPill status={embedOn} /> : null}
      </div>

      {embedOn === false ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: T.rMd, background: T.warnSoft }}>
          <div style={{ fontSize: 11.5, color: T.ink, lineHeight: 1.5 }}>
            <strong>Your banner isn't showing yet.</strong> Turn on the Consentful app embed in your theme — it opens
            switched on, just click <strong>Save</strong>.
          </div>
          <a
            href={EMBED_EDITOR_URL}
            style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.accent, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Turn on app embed →
          </a>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5 }}>
          Publish writes your banner to {shop ? <strong>{shop.myshopifyDomain}</strong> : "your store"}
          {embedOn === true ? " — the app embed is on, so changes go live immediately." : "."}
          {embedOn === null && embedded ? (
            <>
              {" "}Make sure the app embed is on (
              <a href={EMBED_EDITOR_URL} style={{ color: T.accent, fontWeight: 600 }}>
                open theme editor
              </a>
              ).
            </>
          ) : null}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={!embedded || busy !== null} loading={busy === "remove"} onClick={remove}>
          Remove
        </Button>
        <Button variant="primary" icon="rocket_launch" disabled={!embedded || busy !== null} loading={busy === "publish"} onClick={publish}>
          Publish banner
        </Button>
      </div>

      {note ? <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.5 }}>{note}</div> : null}
    </Card>
  )
}

function EmbedPill({ status }: { status: EmbedStatus | "checking" }) {
  const [label, color, bg] =
    status === true
      ? ["Live on storefront", T.successText, T.successSoft]
      : status === false
        ? ["App embed off", T.warn, T.warnSoft]
        : status === "checking"
          ? ["Checking…", T.ink3, T.sunken]
          : ["Embed status unknown", T.ink3, T.sunken]
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".02em", padding: "4px 10px", borderRadius: T.rPill, color, background: bg, whiteSpace: "nowrap" }}>
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
    message: "Add your storefront tags by hand below — the app can't scan a live store.",
  }
}

const shopifyHost: HostServices = {
  platformLabel: "Shopify",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanUnsupported,
  getLiveSiteUrl: async () => {
    const s = await shopContext()
    return s ? `https://${s.primaryHost}` : null
  },
  getSiteName: async () => (await shopContext())?.myshopifyDomain ?? null,
  data: localStorageDataStore("consentful.shopify."),
  useCodeDisabled: () => false,
  footerStatus: { ok: "Ready to publish", bad: "Open in Shopify admin" },
  footerNote: `runtime ${RUNTIME_VERSION} · jsDelivr`,
  publishSubtitle: "Publish the banner to your store, then turn on the Consentful app embed in your theme.",
  showLicenseTab: true,
  PublishAction: ShopifyPublishAction,
  publisher: shopifyPublisher,
}

function ShopifySettingsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CookieConsentConfig>(loadConfig)
  const [status, setStatus] = useState<string>("idle")

  // Load-on-mount: reopen on the store's last-published config (the
  // `consentful.config` metafield) instead of a fresh default. Falls back
  // silently to the local draft when nothing is published or we're not embedded.
  useEffect(() => {
    if (!inShopifyAdmin()) return
    let active = true
    void (async () => {
      try {
        setStatus("loading")
        const remote = await client.loadConfig()
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

/** The Shopify admin app: the shared editor on the Shopify adapter. */
export function ShopifyApp() {
  return (
    <ShopifySettingsProvider>
      <HostProvider value={shopifyHost}>
        <ConsentfulShell />
      </HostProvider>
    </ShopifySettingsProvider>
  )
}
