import { framer } from "@framer/plugin"

import "@framer-cookie-consent/shared-ui/fonts.css"
import "./App.css"
import { ConsentfulShell, HostProvider } from "@framer-cookie-consent/shared-ui"
import { SettingsProvider } from "./state/SettingsProvider"
import { framerHost } from "./host/framerHost"

/**
 * Root of the Consentful plugin UI (runs inside the Framer editor iframe).
 *
 * Hosts the shared settings state (`SettingsProvider`) and the Consentful shell
 * (`ConsentfulShell`) — a three-column editor (tab rail, panel, live preview)
 * with onboarding, add-category / add-script dialogs and a publish flow. Every
 * field maps onto the shared config schema and auto-saves (debounced), keeping
 * the published site's loader in sync.
 */

// Size the panel to the Consentful layout: a fixed 820×640 window. The redesign
// is composed for exactly this size — a rail plus a full-width panel, with the
// live preview arriving as a slide-over drawer rather than a permanent column —
// so the window is locked and every bound pinned to the same value. Guarded so
// the UI still mounts in a plain browser (local visual checks) with no host.
const PANEL_WIDTH = 820
const PANEL_HEIGHT = 640

try {
  framer.showUI({
    position: "top right",
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    resizable: false,
    minWidth: PANEL_WIDTH,
    minHeight: PANEL_HEIGHT,
    maxWidth: PANEL_WIDTH,
    maxHeight: PANEL_HEIGHT,
  })
} catch {
  /* not running inside Framer */
}

export function App() {
  return (
    <SettingsProvider>
      <HostProvider value={framerHost}>
        <ConsentfulShell />
      </HostProvider>
    </SettingsProvider>
  )
}
