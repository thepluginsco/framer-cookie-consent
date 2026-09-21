/**
 * The Framer host adapter.
 *
 * Everything platform-specific the shared Consentful shell needs, wired to the
 * Framer editor: config is written into the site's custom code (so publishing
 * is automatic — there's no copy step), the live site + project come from the
 * Framer API, and the License tab is shown (Framer is the licensed surface).
 */

import { Card, Icon, T, type ConsentfulModel, type HostServices } from "@framer-cookie-consent/shared-ui"

import { getLiveSiteUrl, getProjectInfo, getPluginData, setPluginData, canSetPluginData } from "../lib/framer"
import { RUNTIME_VERSION } from "../lib/runtimeCdn"
import { scanSiteForTrackers } from "../lib/scanSite"
import { useCustomCodeDisabled } from "../hooks/useCustomCodeStatus"
import { FramerLicensePanel } from "./FramerLicensePanel"

/** Framer's publish action: there's nothing to copy — editing auto-syncs. */
function FramerPublishAction({ m }: { m: ConsentfulModel }) {
  void m
  return (
    <Card style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <Icon name="sync" size={18} color={T.accent} style={{ marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>Saved &amp; synced automatically</div>
        <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 1.5 }}>
          Every change is saved and written into the site's custom code in the same step — there's nothing to
          publish here. To make it live for visitors, click <strong>Publish</strong> in Framer (top-right); a
          plugin can't trigger that step for you.
        </div>
      </div>
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
  footerStatus: { ok: "Custom code enabled", bad: "Custom code disabled" },
  footerNote: `runtime ${RUNTIME_VERSION} · jsDelivr`,
  publishSubtitle: "Review what's added to your site — it stays in sync automatically.",
  showLicenseTab: true,
  LicensePanel: FramerLicensePanel,
  PublishAction: FramerPublishAction,
}
