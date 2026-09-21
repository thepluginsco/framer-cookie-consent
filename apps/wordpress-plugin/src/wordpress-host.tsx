/**
 * The WordPress host adapter.
 *
 * The authoring UI is the shared Consentful shell; what's WordPress-specific is
 * the publish action — inside wp-admin (`window.CONSENTFUL_WP` present) it writes
 * the loader into the site's `<head>` over the REST store; standalone (`npm run
 * dev`) it's preview-only. Config persists in localStorage, matching the old
 * admin bundle (which never loaded prior config from the server).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  DEFAULT_CONFIG,
  installWordPressLoader,
  mergeConfig,
  parse,
  removeWordPressLoader,
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

import { WordPressRestStore } from "./rest-store"

const STORAGE_KEY = "consentful.wordpress.config"
const boot = typeof window !== "undefined" ? window.CONSENTFUL_WP : undefined
const wpStore = boot ? new WordPressRestStore({ restBase: boot.restBase, nonce: boot.nonce }) : null
const runtimeOpts = boot?.runtimeUrl ? { runtimeUrl: boot.runtimeUrl } : {}

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
/* Publish action — write / remove the loader over the REST store             */
/* -------------------------------------------------------------------------- */

function WordPressPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()
  const [busy, setBusy] = useState<null | "publish" | "remove">(null)
  const [note, setNote] = useState(
    wpStore
      ? "Ready. Publish writes the banner into your site's <head>."
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
      const wrote = await installWordPressLoader(wpStore, config, runtimeOpts)
      // Persist the config too, so reopening the screen reloads this banner.
      await wpStore.writeConfigOption(serialize(config))
      return wrote ? "Published ✓ Your banner is live." : "Already up to date — nothing to publish."
    })
  }, [config, run])

  const remove = useCallback(() => {
    if (!wpStore) return
    void run("remove", async () => {
      const removed = await removeWordPressLoader(wpStore)
      // Drop the stored config too, so the next open starts clean.
      await wpStore.writeConfigOption(null)
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
  getLiveSiteUrl: async () => null,
  getSiteName: async () => null,
  data: localStorageDataStore("consentful.wordpress."),
  useCodeDisabled: () => false,
  footerStatus: { ok: wpStore ? "Ready to publish" : "Preview only", bad: "Not connected" },
  footerNote: `runtime ${RUNTIME_VERSION} · wp_head`,
  publishSubtitle: "Publish writes the banner into your site's <head> — update it any time from here.",
  showLicenseTab: false,
  PublishAction: WordPressPublishAction,
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
          const remote = parse(stored)
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
