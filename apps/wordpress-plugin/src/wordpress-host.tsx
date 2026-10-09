/**
 * The WordPress host adapter.
 *
 * The authoring UI is the shared Consentful shell; what's WordPress-specific is
 * the publish action — inside wp-admin (`window.CONSENTFUL_WP` present) it saves
 * the published settings over the REST store, and PHP loads the bundled runtime
 * with them; standalone (`npm run
 * dev`) it's preview-only. Config persists in localStorage, matching the old
 * admin bundle (which never loaded prior config from the server).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"

import {
  DEFAULT_CONFIG,
  mergeConfig,
  parse,
  RUNTIME_VERSION,
  serialize,
  toPublishedConfig,
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
  Toggle,
  useSettingsContext,
  type ConfigUpdater,
  type ConsentfulModel,
  type HostPublisher,
  type HostServices,
  type ScanResult,
  type SettingsApi,
} from "@framer-cookie-consent/shared-ui"

import { WordPressRestStore } from "./rest-store"

const STORAGE_KEY = "consentful.wordpress.config"
/**
 * `true` in the free WordPress.org build, `false` in the Pro add-on's build
 * (see vite.config.ts). The free core never licenses, so it drops any license
 * a Pro install left in the saved config: it always publishes the free plan.
 */
declare const __CC_FREE_CORE__: boolean | undefined

function freeCore(config: CookieConsentConfig): CookieConsentConfig {
  return (typeof __CC_FREE_CORE__ !== "undefined" && __CC_FREE_CORE__)
    ? { ...config, license: { ...config.license, key: null, tier: "trial", whiteLabel: false } }
    : config
}

const boot = typeof window !== "undefined" ? window.CONSENTFUL_WP : undefined
const wpStore = boot ? new WordPressRestStore({ restBase: boot.restBase, nonce: boot.nonce }) : null

function loadConfig(): CookieConsentConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return freeCore(parse(raw))
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
/* "Powered by" credit — the site owner's opt-in                              */
/* -------------------------------------------------------------------------- */

/**
 * WordPress.org plugins may only credit themselves on the public site when the
 * owner asks for it, so the credit is OFF until the owner turns it on here. The
 * choice lives in a WP option (PHP enforces it when printing the settings); this
 * store mirrors it for the toggle and the preview.
 */
let creditOn = false
const creditListeners = new Set<() => void>()

function setCreditOn(next: boolean): void {
  creditOn = next
  creditListeners.forEach((l) => l())
}

function useCreditVisible(): boolean {
  return useSyncExternalStore(
    (l) => {
      creditListeners.add(l)
      return () => creditListeners.delete(l)
    },
    () => creditOn,
  )
}

if (wpStore) {
  wpStore.readCredit().then(setCreditOn, () => {
    /* stays off */
  })
}

function CreditOptIn() {
  const on = useCreditVisible()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = useCallback(() => {
    if (!wpStore || saving) return
    const next = !on
    setSaving(true)
    setError(null)
    wpStore
      .writeCredit(next)
      .then(() => setCreditOn(next))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false))
  }, [on, saving])

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 10, background: T.accentSoft }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Support Consentful</div>
        <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 1.5 }}>
          Show a small &ldquo;Powered by Consentful&rdquo; line in your banner. It&rsquo;s off unless you turn it on, and
          every feature works either way. Applies to your live site straight away.
        </div>
        {error ? <div style={{ fontSize: 11, color: T.danger, marginTop: 4, fontWeight: 600 }}>{error}</div> : null}
      </div>
      <Toggle on={on} onClick={toggle} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Publisher — one-click publish + "what's live" for the header               */
/* -------------------------------------------------------------------------- */

const wordpressPublisher: HostPublisher = {
  async publish(config) {
    if (!wpStore) {
      return { ok: false, needsSetup: true, message: "Open this screen inside WordPress to publish." }
    }
    try {
      // The site gets the plan-limited settings; PHP prints them before the
      // bundled runtime. The full config is kept too, so reopening the screen
      // reloads this banner.
      const published = serialize(toPublishedConfig(config))
      const unchanged = (await wpStore.readPublished()) === published
      if (!unchanged) await wpStore.writePublished(published)
      await wpStore.writeConfigOption(serialize(config))
      return { ok: true, message: unchanged ? "Already up to date." : "Published ✓ Your banner is live." }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  async loadPublished() {
    if (!wpStore) throw new Error("Not inside WordPress")
    const [stored, published] = await Promise.all([wpStore.readConfigOption(), wpStore.readPublished()])
    if (!stored || !published) return { config: null }
    // The runtime ships inside the plugin, so a published banner is never on an
    // older runtime than this screen.
    return { config: parse(stored), outdated: false }
  },
}

/* -------------------------------------------------------------------------- */
/* Publish action — write / remove the loader over the REST store             */
/* -------------------------------------------------------------------------- */

function WordPressPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()
  const [busy, setBusy] = useState<null | "publish" | "remove">(null)
  const [note, setNote] = useState(
    wpStore
      ? "Ready. Publish puts the banner on your site."
      : "Preview only — open this screen inside WordPress to publish.",
  )
  const [errored, setErrored] = useState(false)

  const run = useCallback(
    async (kind: "publish" | "remove", action: () => Promise<string>) => {
      setBusy(kind)
      setErrored(false)
      setNote(kind === "publish" ? "Publishing…" : "Removing…")
      try {
        setNote(await action())
      } catch (err) {
        setErrored(true)
        setNote(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  const publish = useCallback(() => {
    if (!wpStore) return
    void run("publish", async () => {
      const r = await wordpressPublisher.publish(config)
      if (!r.ok) throw new Error(r.message)
      markPublished(config)
      return r.message
    })
  }, [config, run])

  const remove = useCallback(() => {
    if (!wpStore) return
    void run("remove", async () => {
      const removed = (await wpStore.readPublished()) !== null
      await wpStore.writePublished(null)
      // Drop the stored config too, so the next open starts clean.
      await wpStore.writeConfigOption(null)
      markUnpublished()
      return removed ? "Removed ✓ The banner is no longer on your site." : "Nothing to remove — no banner was published."
    })
  }, [run])

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="publish" size={18} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            Publish to your site
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" disabled={!wpStore || busy !== null} loading={busy === "remove"} onClick={remove}>
            Remove
          </Button>
          <Button variant="primary" icon="rocket_launch" disabled={!wpStore || busy !== null} loading={busy === "publish"} onClick={publish}>
            Publish to site
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: errored ? T.danger : T.ink3, lineHeight: 1.5, fontWeight: errored ? 600 : 400 }}>
        {note}
      </div>
      {wpStore ? <CreditOptIn /> : null}
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
    message: "Add your tags by hand below — pre-fill from active plugins is handled by WordPress on the server.",
  }
}

const wordpressHost: HostServices = {
  platformLabel: "WordPress",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanUnsupported,
  getLiveSiteUrl: async () => boot?.siteUrl ?? null,
  getSiteName: async () => null,
  data: localStorageDataStore("consentful.wordpress."),
  useCodeDisabled: () => false,
  footerStatus: { ok: wpStore ? "Ready to publish" : "Preview only", bad: "Not connected" },
  footerNote: `runtime ${RUNTIME_VERSION} · bundled`,
  runtimeDelivery: {
    title: "Runtime bundled with the plugin",
    desc: "Served from your own site, deferred so it never blocks your page.",
  },
  publishSubtitle: "Publish puts the banner on your site. Update or remove it any time from here.",
  showLicenseTab: true,
  // Pro add-on build: the free core it extends keeps working without a key, so
  // only the Pro controls lock (the free build has no license code at all).
  requireActivation: false,
  PublishAction: WordPressPublishAction,
  publisher: wordpressPublisher,
  useCreditVisible,
}

function WordPressSettingsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CookieConsentConfig>(loadConfig)
  const [status, setStatus] = useState<string>("idle")

  // Load-on-mount: inside wp-admin, reopen on the config that's actually live
  // (stored in a WP option) instead of a fresh default. Falls back silently to
  // the local draft when nothing is stored or the REST call fails.
  useEffect(() => {
    if (!wpStore) return
    let active = true
    void (async () => {
      try {
        setStatus("loading")
        const stored = await wpStore.readConfigOption()
        if (active && stored) {
          const remote = freeCore(parse(stored))
          setConfig(remote)
          saveConfig(remote)
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

/** The WordPress admin app: the shared editor on the WordPress adapter. */
export function WordPressApp() {
  return (
    <WordPressSettingsProvider>
      <HostProvider value={wordpressHost}>
        <ConsentfulShell />
      </HostProvider>
    </WordPressSettingsProvider>
  )
}
