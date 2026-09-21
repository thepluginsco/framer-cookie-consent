/**
 * Entry point for the Wix dashboard authoring page.
 *
 * Mounts the shared Consentful editor (via the Wix host adapter) into `#root`,
 * so the dashboard page is the same UI Framer ships. The only network is to the
 * Data Client Worker, through the install action.
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@framer-cookie-consent/shared-ui/fonts.css"
import "./styles.css"
import { WixApp } from "./dashboard/wix-app"

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WixApp />
    </StrictMode>,
  )
}
