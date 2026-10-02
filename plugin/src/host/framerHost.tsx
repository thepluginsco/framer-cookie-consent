/**
 * The Framer host adapter.
 *
 * Everything platform-specific the shared Consentful shell needs, wired to the
 * Framer editor: the live site + project come from the Framer API, the License
 * tab is shown (Framer is the licensed surface), and the banner is written into
 * the site's custom code — but ONLY when the user clicks Install / Update.
 *
 * Opening the plugin and editing settings never change the project. The first
 * install always happens from the Publish tab, next to the explanation of what
 * will be added to the site's custom code.
 */

import { useCallback, useEffect, useState } from "react"

import {
  Button,
  Card,
  Icon,
  T,
  markPublished,
  markUnpublished,
  useSettingsContext,
  type ConsentfulModel,
  type HostPublisher,
  type HostServices,
} from "@framer-cookie-consent/shared-ui"
import { RUNTIME_INTEGRITY, parse, serialize } from "@framer-cookie-consent/shared"

import {
  loadConfigString,
  loadInstalledConfigString,
  saveInstalledConfigString,
} from "../lib/configStore"
import { injectLoader, readInstalledLoader, removeLoader } from "../lib/customCode"
import { canWriteSite, getLiveSiteUrl, getProjectInfo, getPluginData, setPluginData, canSetPluginData } from "../lib/framer"
import { RUNTIME_VERSION } from "../lib/runtimeCdn"
import { scanSiteForTrackers } from "../lib/scanSite"
import { useCustomCodeDisabled } from "../hooks/useCustomCodeStatus"
import { useReadOnlyNotice } from "../hooks/useWriteAccess"
import type { CookieConsentConfig } from "../types"

/** Shown wherever a write is refused for lack of the custom-code permission. */
const NO_ACCESS = "You don't have permission to edit this site's custom code. Ask a project owner for edit access."

/* -------------------------------------------------------------------------- */
/* Install / update / remove — the only code that writes custom code          */
/* -------------------------------------------------------------------------- */

/** Write the loader for `config` into the site's custom code and record it. */
async function installBanner(config: CookieConsentConfig): Promise<void> {
  await injectLoader(config)
  await saveInstalledConfigString(serialize(config))
}

/** Take the loader out of the site's custom code and forget the record. */
async function uninstallBanner(): Promise<void> {
  await removeLoader()
  await saveInstalledConfigString(null)
}

/**
 * Header control. It only UPDATES an installed banner in one click; when the
 * banner isn't on the site yet it sends the user to the Publish tab, so the
 * first write always follows the explanation there.
 */
const framerPublisher: HostPublisher = {
  async publish(config) {
    if (!canWriteSite()) return { ok: false, message: NO_ACCESS }
    try {
      if ((await readInstalledLoader()) === null) {
        return { ok: false, needsSetup: true, message: "Review and install on the Publish tab" }
      }
      await installBanner(config)
      return { ok: true, message: "Updated ✓ Publish your site in Framer to go live." }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  async loadPublished() {
    const block = await readInstalledLoader()
    if (block === null) return { config: null }
    // Sites installed before installs were recorded kept the custom code in
    // step with the saved config, so that is what's live for them.
    const stored = (await loadInstalledConfigString()) ?? (await loadConfigString())
    if (!stored) return { config: null }
    // The block pins a runtime version + integrity hash at install time; an
    // older pin means the site misses runtime fixes until it's updated.
    const current = block.includes(`@${RUNTIME_VERSION}/`) && block.includes(RUNTIME_INTEGRITY)
    return { config: parse(stored), outdated: !current }
  },
}

/** The Publish tab's action card: explains the change, then installs on click. */
function FramerPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  const { config } = useSettingsContext()
  const readOnly = useReadOnlyNotice() !== null
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<null | "install" | "remove">(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let active = true
    readInstalledLoader()
      .then((block) => {
        if (active) setInstalled(block !== null)
      })
      .catch(() => {
        if (active) setInstalled(false)
      })
    return () => {
      active = false
    }
  }, [])

  const run = useCallback(async (kind: "install" | "remove", action: () => Promise<string>) => {
    setBusy(kind)
    setNote(null)
    try {
      setNote({ text: await action(), error: false })
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true })
    } finally {
      setBusy(null)
    }
  }, [])

  const install = useCallback(() => {
    void run("install", async () => {
      if (!canWriteSite()) throw new Error(NO_ACCESS)
      await installBanner(config)
      markPublished(config)
      setInstalled(true)
      return "Done ✓ The banner is in your site's custom code. Click Publish in Framer (top-right) to make it live."
    })
  }, [config, run])

  const remove = useCallback(() => {
    void run("remove", async () => {
      if (!canWriteSite()) throw new Error(NO_ACCESS)
      await uninstallBanner()
      markUnpublished()
      setInstalled(false)
      return "Removed ✓ Consentful's code is no longer in your site's custom code. Publish your site in Framer to apply it."
    })
  }, [run])

  const locked = readOnly || busy !== null || installed === null

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icon name="code" size={18} color={T.accent} style={{ marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>
            {installed ? "Banner installed on this site" : "Install the banner on this site"}
          </div>
          <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.5 }}>
            {installed ? (
              <>
                Consentful's loader is in this site's custom code (start of <code>&lt;head&gt;</code>). Changes you make
                here are saved in the plugin only — click <strong>Update banner</strong> to write them to the site, then{" "}
                <strong>Publish</strong> in Framer.
              </>
            ) : (
              <>
                Nothing has been added to your site yet. <strong>Install banner</strong> will modify this project's
                custom code: it adds the Consentful loader (your banner settings, the Consent Mode defaults and the
                script tag listed below) to the start of <code>&lt;head&gt;</code>. You can remove it here at any time.
              </>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {installed ? (
          <Button variant="secondary" disabled={locked} loading={busy === "remove"} onClick={remove}>
            Remove banner
          </Button>
        ) : null}
        <Button variant="primary" icon="rocket_launch" disabled={locked} loading={busy === "install"} onClick={install}>
          {installed ? "Update banner" : "Install banner"}
        </Button>
      </div>
      {note ? (
        <div style={{ fontSize: 11.5, color: note.error ? T.danger : T.ink3, lineHeight: 1.5, fontWeight: note.error ? 600 : 400 }}>
          {note.text}
        </div>
      ) : null}
    </Card>
  )
}

/** The Framer platform services handed to the shared shell. */
export const framerHost: HostServices = {
  platformLabel: "Framer",
  runtimeVersion: RUNTIME_VERSION,
  scanSite: scanSiteForTrackers,
  getLiveSiteUrl: () => getLiveSiteUrl().catch(() => null),
  getSiteName: () => getProjectInfo().then((info) => info.name || null).catch(() => null),
  data: {
    get: (key) => getPluginData(key),
    set: (key, value) => setPluginData(key, value).then(() => undefined),
    canSet: canSetPluginData,
  },
  useCodeDisabled: useCustomCodeDisabled,
  useReadOnlyNotice,
  footerStatus: { ok: "Custom code enabled", bad: "Custom code disabled" },
  footerNote: `runtime ${RUNTIME_VERSION} · jsDelivr`,
  publishSubtitle: "Nothing is added to your site until you click Install banner. Review what it adds below.",
  showLicenseTab: true,
  PublishAction: FramerPublishAction,
  publisher: framerPublisher,
}
