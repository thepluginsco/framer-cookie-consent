import "@framer-cookie-consent/shared-ui/fonts.css"
import "./App.css"
import { ConsentfulShell, HostProvider } from "@framer-cookie-consent/shared-ui"
import { SettingsProvider } from "./state/SettingsProvider"
import { framerHost } from "./host/framerHost"
import { showPluginUI } from "./lib/framer"

/**
 * Root of the Consentful plugin UI (runs inside the Framer editor iframe).
 *
 * Hosts the shared settings state (`SettingsProvider`) and the Consentful shell
 * (`ConsentfulShell`) — a three-column editor (tab rail, panel, live preview)
 * with onboarding, add-category / add-script dialogs and a publish flow. Every
 * field maps onto the shared config schema and auto-saves (debounced) to the
 * plugin's own data. The site's custom code is only written when the user
 * clicks Install / Update banner (see `host/framerHost.tsx`).
 */

// Size the panel to the Consentful layout: a fixed 820×640 window. The redesign
// is composed for exactly this size — a rail plus a full-width panel, with the
// live preview arriving as a slide-over drawer rather than a permanent column —
// so the window is locked and every bound pinned to the same value.
const PANEL_WIDTH = 820
const PANEL_HEIGHT = 640

// showPluginUI checks the permission first and never throws, so a refusal
// (or a plain browser with no host) just leaves the window as Framer sized it.
void showPluginUI({
  position: "top right",
  width: PANEL_WIDTH,
  height: PANEL_HEIGHT,
  resizable: false,
  minWidth: PANEL_WIDTH,
  minHeight: PANEL_HEIGHT,
  maxWidth: PANEL_WIDTH,
  maxHeight: PANEL_HEIGHT,
})

export function App() {
  return (
    <SettingsProvider>
      <HostProvider value={framerHost}>
        <ConsentfulShell />
      </HostProvider>
    </SettingsProvider>
  )
}
