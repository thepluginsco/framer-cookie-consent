/**
 * "Your live domain needs a plan" (plan §15 N7, G1). Shown on the Publish and
 * License tabs when the site's live address is a custom domain and this site
 * isn't on a paid plan. Free keeps running on the platform/staging address.
 */

import { useHost } from "../host"
import { T } from "../tokens"
import { Button, Icon } from "../ui"
import { useAccount } from "./account-context"

export function GoLiveNotice({ from }: { from: string }) {
  const a = useAccount()
  const host = useHost()
  if (!a?.liveDomain) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, background: T.warnSoft, border: `1px solid #f3dfae`, borderRadius: T.rXl, padding: "14px 15px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <Icon name="public" size={19} color={T.warn} style={{ marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>{a.liveDomain} needs a plan to show the banner</div>
          <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 3, lineHeight: 1.5 }}>
            Free runs on {host.platformAddress ? <code>{host.platformAddress}</code> : "preview"} and staging addresses. On your live domain the
            banner stays hidden and trackers stay blocked until you upgrade. It takes a minute, inside this plugin.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" icon="rocket_launch" onClick={() => a.openUpgrade(from)}>
          Go live on {a.liveDomain}
        </Button>
      </div>
    </div>
  )
}
